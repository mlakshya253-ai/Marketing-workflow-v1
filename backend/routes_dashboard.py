"""Dashboard endpoints for Triage Lead / Executive."""
from datetime import datetime, timezone
from typing import List
from statistics import median

from fastapi import APIRouter, Depends

from auth import require_roles, ROLE_TRIAGE, ROLE_EXECUTIVE
from db import db
from models import ACTIVE_STATES

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _hours_since(iso_str: str) -> float:
    try:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
    except Exception:
        return 0.0


@router.get("/summary")
async def summary(_=Depends(require_roles(ROLE_TRIAGE, ROLE_EXECUTIVE))):
    active = await db.requests.count_documents({"status": {"$in": list(ACTIVE_STATES)}})
    queue = await db.requests.count_documents({"status": "prioritized"})
    submitted = await db.requests.count_documents({"status": "submitted"})
    on_hold = await db.requests.count_documents({"status": "on_hold"})
    in_review = await db.requests.count_documents({"status": {"$in": ["copy_awaiting_approval", "delivered"]}})
    completed = await db.requests.count_documents({"status": "completed"})
    cancelled = await db.requests.count_documents({"status": "cancelled"})

    # Median hours: pickup -> delivered
    delivered_docs = await db.requests.find(
        {"status": {"$in": ["delivered", "completed"]}, "delivered_at": {"$ne": None}},
        {"_id": 0}
    ).to_list(2000)

    pickup_to_deliver: List[float] = []
    queue_wait: List[float] = []
    for d in delivered_docs:
        # Find first pickup audit entry
        first_pickup = await db.audit_log.find_one(
            {"request_id": d["id"], "action": "picked_up"},
            sort=[("created_at", 1)]
        )
        if first_pickup and d.get("delivered_at"):
            try:
                pu = datetime.fromisoformat(first_pickup["created_at"])
                de = datetime.fromisoformat(d["delivered_at"])
                pickup_to_deliver.append((de - pu).total_seconds() / 3600)
            except Exception:
                pass
        # Queue wait: prioritized_at -> first pickup
        prio = await db.audit_log.find_one(
            {"request_id": d["id"], "action": "prioritized"},
            sort=[("created_at", 1)]
        )
        if prio and first_pickup:
            try:
                p1 = datetime.fromisoformat(prio["created_at"])
                p2 = datetime.fromisoformat(first_pickup["created_at"])
                queue_wait.append((p2 - p1).total_seconds() / 3600)
            except Exception:
                pass

    median_pickup_to_deliver = median(pickup_to_deliver) if pickup_to_deliver else 0.0
    median_queue_wait = median(queue_wait) if queue_wait else 0.0

    # Blockers: on_hold and delivered-awaiting
    blockers = []
    on_hold_docs = await db.requests.find({"status": "on_hold"}, {"_id": 0}).to_list(200)
    for d in on_hold_docs:
        blockers.append({
            "id": d["id"], "title": d["title"], "status": "on_hold",
            "reason": d.get("on_hold_reason"),
            "hours_stuck": round(_hours_since(d.get("on_hold_since") or d["updated_at"]), 1),
        })
    review_docs = await db.requests.find({"status": {"$in": ["copy_awaiting_approval", "delivered"]}},
                                          {"_id": 0}).to_list(200)
    for d in review_docs:
        blockers.append({
            "id": d["id"], "title": d["title"], "status": d["status"],
            "hours_stuck": round(_hours_since(d.get("delivered_at") or d["updated_at"]), 1),
        })

    # Volume by channel
    pipeline = [{"$group": {"_id": "$channel", "count": {"$sum": 1}}}]
    channels_agg = await db.requests.aggregate(pipeline).to_list(100)
    volume_by_channel = [{"channel": c["_id"], "count": c["count"]} for c in channels_agg]

    # WIP per assignee
    wip_writers = []
    writers = await db.users.find({"role": "writer", "active": True}, {"_id": 0}).to_list(200)
    for w in writers:
        n = await db.requests.count_documents({
            "assigned_writer_id": w["id"], "status": "in_content"
        })
        wip_writers.append({"user_id": w["id"], "name": w["name"], "wip": n})

    wip_designers = []
    designers = await db.users.find({"role": "designer", "active": True}, {"_id": 0}).to_list(200)
    for d in designers:
        n = await db.requests.count_documents({
            "assigned_designer_id": d["id"], "status": {"$in": ["in_design", "on_hold"]}
        })
        wip_designers.append({"user_id": d["id"], "name": d["name"], "wip": n})

    return {
        "counts": {
            "active": active,
            "queue": queue,
            "submitted": submitted,
            "on_hold": on_hold,
            "in_review": in_review,
            "completed": completed,
            "cancelled": cancelled,
        },
        "medians": {
            "pickup_to_deliver_hours": round(median_pickup_to_deliver, 1),
            "queue_wait_hours": round(median_queue_wait, 1),
        },
        "blockers": blockers,
        "volume_by_channel": volume_by_channel,
        "wip_writers": wip_writers,
        "wip_designers": wip_designers,
    }
