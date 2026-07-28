"""Admin endpoints: user role management + channel list management."""
from fastapi import APIRouter, HTTPException, Depends

from auth import require_roles, ROLE_TRIAGE
from db import db
from models import RoleUpdateIn, ActiveUpdateIn, ChannelIn, new_id, now_iso

router = APIRouter(prefix="/admin", tags=["admin"])
public_router = APIRouter(prefix="", tags=["public"])


def _public(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "active": u.get("active", True),
        "created_at": u["created_at"],
    }


@router.get("/users")
async def list_users(_=Depends(require_roles(ROLE_TRIAGE))):
    users = await db.users.find({}).to_list(2000)
    return [_public(u) for u in users]


@router.patch("/users/{user_id}/role")
async def change_role(user_id: str, payload: RoleUpdateIn,
                      current=Depends(require_roles(ROLE_TRIAGE))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["id"] == current["id"] and payload.role != ROLE_TRIAGE:
        # Prevent locking yourself out if you're the last admin
        admin_count = await db.users.count_documents({"role": ROLE_TRIAGE, "active": True})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last active admin")
    await db.users.update_one({"id": user_id}, {"$set": {"role": payload.role}})
    updated = await db.users.find_one({"id": user_id})
    return _public(updated)


@router.patch("/users/{user_id}/active")
async def toggle_active(user_id: str, payload: ActiveUpdateIn,
                        current=Depends(require_roles(ROLE_TRIAGE))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["id"] == current["id"] and not payload.active:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    if not payload.active and target["role"] == ROLE_TRIAGE:
        admin_count = await db.users.count_documents({"role": ROLE_TRIAGE, "active": True})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot deactivate the last active admin")
    await db.users.update_one({"id": user_id}, {"$set": {"active": payload.active}})
    updated = await db.users.find_one({"id": user_id})
    return _public(updated)


# ---------- Channels ----------
DEFAULT_CHANNELS = ["WhatsApp", "Social", "Website", "Banner", "Digital", "Others"]


async def ensure_default_channels():
    if await db.channels.count_documents({}) == 0:
        for name in DEFAULT_CHANNELS:
            await db.channels.insert_one({
                "id": new_id(),
                "name": name,
                "active": True,
                "created_at": now_iso(),
            })


@public_router.get("/channels")
async def list_channels():
    """Public to authenticated users — used by intake form."""
    chans = await db.channels.find({"active": True}).sort("name", 1).to_list(500)
    return [{"id": c["id"], "name": c["name"]} for c in chans]


@router.get("/channels")
async def admin_list_channels(_=Depends(require_roles(ROLE_TRIAGE))):
    chans = await db.channels.find({}).sort("name", 1).to_list(500)
    return [{"id": c["id"], "name": c["name"], "active": c.get("active", True)} for c in chans]


@router.post("/channels")
async def create_channel(payload: ChannelIn, _=Depends(require_roles(ROLE_TRIAGE))):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.channels.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=409, detail="Channel already exists")
    doc = {"id": new_id(), "name": name, "active": True, "created_at": now_iso()}
    await db.channels.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "active": True}


@router.patch("/channels/{channel_id}")
async def update_channel(channel_id: str, payload: dict,
                         _=Depends(require_roles(ROLE_TRIAGE))):
    update = {}
    if "name" in payload:
        update["name"] = str(payload["name"]).strip()
    if "active" in payload:
        update["active"] = bool(payload["active"])
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.channels.update_one({"id": channel_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    c = await db.channels.find_one({"id": channel_id})
    return {"id": c["id"], "name": c["name"], "active": c.get("active", True)}


@router.get("/assignable-users")
async def assignable_users(role: str, _=Depends(require_roles(ROLE_TRIAGE))):
    """List of writers/designers a triage lead can pick for reassign dropdowns."""
    if role not in ("writer", "designer"):
        raise HTTPException(status_code=400, detail="Invalid role")
    users = await db.users.find({"role": role, "active": True}).to_list(500)
    return [{"id": u["id"], "name": u["name"], "email": u["email"]} for u in users]


# ---------- User directory (for @mentions) ----------
mention_router = APIRouter(prefix="/users", tags=["users"])


@mention_router.get("/search")
async def search_users(q: str = "", current=Depends(require_roles(
        "requester", "triage", "writer", "designer", "executive"))):
    q = q.strip()
    query = {"active": True}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    users = await db.users.find(query).limit(20).to_list(20)
    return [{"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"]}
            for u in users]
