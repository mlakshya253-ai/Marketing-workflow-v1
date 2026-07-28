"""Notification endpoints."""
from fastapi import APIRouter, HTTPException, Depends

from auth import get_current_user
from db import db
from models import now_iso

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(current=Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": current["id"]}, {"_id": 0}) \
        .sort("created_at", -1).limit(200).to_list(200)
    return docs


@router.get("/unread-count")
async def unread_count(current=Depends(get_current_user)):
    n = await db.notifications.count_documents({"user_id": current["id"], "read": False})
    return {"count": n}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, current=Depends(get_current_user)):
    doc = await db.notifications.find_one({"id": notif_id, "user_id": current["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True, "read_at": now_iso()}})
    return {"ok": True}


@router.post("/mark-all-read")
async def mark_all_read(current=Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": current["id"], "read": False},
        {"$set": {"read": True, "read_at": now_iso()}}
    )
    return {"ok": True}
