"""Auth endpoints: register, login, logout, me, refresh, first-admin claim."""
from datetime import datetime, timezone, timedelta
import jwt
from fastapi import APIRouter, Response, HTTPException, Request, Depends
import os

from auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies, get_current_user, JWT_ALGORITHM,
    ROLE_REQUESTER, ROLE_TRIAGE,
)
from db import db
from models import RegisterIn, LoginIn, UserOut, ClaimAdminIn, new_id, now_iso

router = APIRouter(prefix="/auth", tags=["auth"])

LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15


def _user_public(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "active": u.get("active", True),
        "is_first_admin": u.get("is_first_admin", False),
        "created_at": u["created_at"],
    }


@router.post("/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")

    total_users = await db.users.count_documents({})
    # First user gets prompted to become admin — we still create as requester
    # but flag them; they can claim admin via /auth/claim-admin.
    is_first = total_users == 0

    doc = {
        "id": new_id(),
        "email": email,
        "name": payload.name.strip(),
        "password_hash": hash_password(payload.password),
        "role": ROLE_REQUESTER,
        "active": True,
        "is_first_admin": is_first,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)

    access = create_access_token(doc["id"], email)
    refresh = create_refresh_token(doc["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": _user_public(doc), "access_token": access}


@router.post("/claim-admin")
async def claim_admin(_: ClaimAdminIn, response: Response, current=Depends(get_current_user)):
    """First-signup user can promote themselves to Triage/Admin, once."""
    if not current.get("is_first_admin"):
        raise HTTPException(status_code=403, detail="Not eligible")
    # Ensure no admin exists yet
    existing_admin = await db.users.find_one({"role": ROLE_TRIAGE})
    if existing_admin:
        # Clear flag anyway to prevent stuck state
        await db.users.update_one({"id": current["id"]}, {"$set": {"is_first_admin": False}})
        raise HTTPException(status_code=409, detail="An admin already exists")
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"role": ROLE_TRIAGE, "is_first_admin": False}},
    )
    user = await db.users.find_one({"id": current["id"]})
    return {"user": _user_public(user)}


async def _check_lockout(identifier: str):
    doc = await db.login_attempts.find_one({"identifier": identifier})
    if not doc:
        return
    if doc.get("locked_until"):
        try:
            until = datetime.fromisoformat(doc["locked_until"])
            if until > datetime.now(timezone.utc):
                remaining = int((until - datetime.now(timezone.utc)).total_seconds() // 60) + 1
                raise HTTPException(status_code=429, detail=f"Too many attempts. Try again in {remaining} minutes.")
        except ValueError:
            pass


async def _record_failed(identifier: str):
    doc = await db.login_attempts.find_one({"identifier": identifier})
    count = (doc.get("count", 0) if doc else 0) + 1
    update = {"count": count, "last_at": now_iso()}
    if count >= LOCKOUT_THRESHOLD:
        update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        update["count"] = 0
    await db.login_attempts.update_one(
        {"identifier": identifier}, {"$set": {**update, "identifier": identifier}}, upsert=True
    )


async def _clear_attempts(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


@router.post("/login")
async def login(payload: LoginIn, response: Response, request: Request):
    email = payload.email.lower().strip()
    # Behind ingress/proxy request.client.host is a per-pod address; use forwarded IP.
    xff = request.headers.get("x-forwarded-for", "")
    ip = (xff.split(",")[0].strip() if xff else (request.client.host if request.client else "unknown"))
    identifier = f"{ip}:{email}"
    # Lock by email too so a distributed attacker can't split attempts across IPs.
    email_identifier = f"email:{email}"
    await _check_lockout(identifier)
    await _check_lockout(email_identifier)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await _record_failed(identifier)
        await _record_failed(email_identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")

    await _clear_attempts(identifier)
    await _clear_attempts(email_identifier)
    access = create_access_token(user["id"], email)
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": _user_public(user), "access_token": access}


@router.post("/logout")
async def logout(response: Response, _=Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(current=Depends(get_current_user)):
    return {"user": current}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    access = create_access_token(user["id"], user["email"])
    new_refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, new_refresh)
    return {"ok": True}


@router.get("/system")
async def system_status():
    """Public system status: is initial admin setup needed?"""
    total = await db.users.count_documents({})
    admin_exists = await db.users.find_one({"role": ROLE_TRIAGE}) is not None
    return {
        "total_users": total,
        "admin_exists": admin_exists,
        "first_admin_needed": total > 0 and not admin_exists,
    }
