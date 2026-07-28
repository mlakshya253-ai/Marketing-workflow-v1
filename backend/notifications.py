"""Notification helpers — create in-app notifications on backend events."""
from typing import List
from db import db
from models import new_id, now_iso


async def notify(user_ids: List[str], request_id: str, kind: str, message: str, actor_id: str = None):
    """Insert one notification per unique target user."""
    seen = set()
    for uid in user_ids:
        if not uid or uid in seen:
            continue
        if actor_id and uid == actor_id:
            # Don't notify the actor of their own action
            continue
        seen.add(uid)
        await db.notifications.insert_one({
            "id": new_id(),
            "user_id": uid,
            "request_id": request_id,
            "kind": kind,
            "message": message,
            "read": False,
            "created_at": now_iso(),
        })


async def notify_one(user_id: str, request_id: str, kind: str, message: str, actor_id: str = None):
    await notify([user_id], request_id, kind, message, actor_id)


async def notify_triage(request_id: str, kind: str, message: str, actor_id: str = None):
    """Notify all active Triage Leads."""
    triage_ids = [u["id"] async for u in db.users.find(
        {"role": "triage", "active": True}, {"id": 1}
    )]
    await notify(triage_ids, request_id, kind, message, actor_id)
