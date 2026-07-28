"""Requests: state machine, pickup, delivery, review, cancellation, comments, audit trail."""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone

from auth import (
    get_current_user, require_roles,
    ROLE_REQUESTER, ROLE_TRIAGE, ROLE_WRITER, ROLE_DESIGNER, ROLE_EXECUTIVE,
)
from db import db
from models import (
    RequestCreateIn, PrioritizeIn, CopySubmitIn, CopyReviewIn, DeliverIn,
    DesignReviewIn, HoldIn, ReassignIn, CommentIn, CancelIn, CancelDecisionIn,
    new_id, now_iso, ACTIVE_STATES,
)
from notifications import notify, notify_one, notify_triage

router = APIRouter(prefix="/requests", tags=["requests"])


# ---------- Helpers ----------
def _can_view(user: dict, req: dict) -> bool:
    if user["role"] == ROLE_REQUESTER:
        return req["requester_id"] == user["id"]
    return True


async def _log_audit(request_id: str, actor: dict, action: str,
                     from_state: Optional[str] = None, to_state: Optional[str] = None,
                     details: Optional[dict] = None):
    await db.audit_log.insert_one({
        "id": new_id(),
        "request_id": request_id,
        "actor_id": actor["id"],
        "actor_name": actor["name"],
        "actor_role": actor["role"],
        "action": action,
        "from_state": from_state,
        "to_state": to_state,
        "details": details or {},
        "created_at": now_iso(),
    })


async def _hydrate(req: dict) -> dict:
    """Attach requester_name, assignees, file metadata to request."""
    requester = await db.users.find_one({"id": req["requester_id"]}, {"_id": 0, "name": 1, "email": 1, "id": 1})
    writer = None
    designer = None
    if req.get("assigned_writer_id"):
        w = await db.users.find_one({"id": req["assigned_writer_id"]}, {"_id": 0, "name": 1, "id": 1, "email": 1})
        writer = w
    if req.get("assigned_designer_id"):
        d = await db.users.find_one({"id": req["assigned_designer_id"]}, {"_id": 0, "name": 1, "id": 1, "email": 1})
        designer = d
    files = []
    for fid in req.get("reference_file_ids", []):
        f = await db.files.find_one({"id": fid, "is_deleted": False})
        if f:
            files.append({"id": f["id"], "filename": f["original_filename"], "size": f["size"]})
    return {
        **{k: v for k, v in req.items() if k != "_id"},
        "requester": requester,
        "writer": writer,
        "designer": designer,
        "reference_files": files,
    }


# ---------- Create ----------
@router.post("")
async def create_request(payload: RequestCreateIn, current=Depends(get_current_user)):
    # Validate channel exists
    chan = await db.channels.find_one({"name": payload.channel, "active": True})
    if not chan:
        raise HTTPException(status_code=400, detail="Invalid channel")

    if payload.content_source == "self_provided":
        if not payload.no_text_needed and not (payload.provided_copy and payload.provided_copy.strip()):
            raise HTTPException(status_code=400,
                                detail="Provide copy or confirm no text is needed")

    # Validate uploaded files belong to this user
    for fid in payload.reference_file_ids:
        f = await db.files.find_one({"id": fid})
        if not f or f["uploader_id"] != current["id"] or f.get("is_deleted"):
            raise HTTPException(status_code=400, detail=f"Invalid file id: {fid}")
    if len(payload.reference_file_ids) > 5:
        raise HTTPException(status_code=400, detail="Max 5 reference files")

    req_id = new_id()
    doc = {
        "id": req_id,
        "title": payload.title.strip(),
        "objective": payload.objective.strip(),
        "target_audience": payload.target_audience.strip(),
        "brief": payload.brief.strip(),
        "channel": payload.channel,
        "desired_deadline": payload.desired_deadline,
        "content_source": payload.content_source,
        "provided_copy": payload.provided_copy,
        "no_text_needed": payload.no_text_needed,
        "reference_file_ids": payload.reference_file_ids,
        "requester_id": current["id"],
        "status": "submitted",
        "brief_locked": False,
        "priority": None,
        "high_importance": False,
        "assigned_writer_id": None,
        "assigned_designer_id": None,
        "draft_copy": None,
        "deliverable_url": None,
        "delivery_notes": None,
        "revision_count": 0,
        "on_hold_reason": None,
        "on_hold_since": None,
        "delivered_at": None,
        "delivered_notified_at": None,
        "reminder_sent_at": None,
        "completed_at": None,
        "cancelled_at": None,
        "auto_approved": False,
        "prev_state_for_cancel": None,
        "prev_pickup_snapshot": None,  # for restoring after declined cancel
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.requests.insert_one(doc)
    await _log_audit(req_id, current, "created", None, "submitted")
    await notify_triage(req_id, "submitted", f"New request: {doc['title']}", actor_id=current["id"])
    return await _hydrate(doc)


# ---------- List ----------
@router.get("")
async def list_requests(
    scope: str = Query("all"),      # all | mine | awaiting_me | active | completed
    status: Optional[str] = None,
    channel: Optional[str] = None,
    assignee: Optional[str] = None,
    requester: Optional[str] = None,
    q: Optional[str] = None,
    current=Depends(get_current_user),
):
    query: dict = {}
    role = current["role"]

    # Base visibility
    if role == ROLE_REQUESTER:
        query["requester_id"] = current["id"]

    # Scope filter
    if scope == "mine":
        query["requester_id"] = current["id"]
    elif scope == "active":
        query["status"] = {"$in": list(ACTIVE_STATES)}
    elif scope == "completed":
        query["status"] = {"$in": ["completed", "cancelled"]}
    elif scope == "awaiting_me":
        # Requester: delivered or copy_awaiting_approval awaiting them
        if role == ROLE_REQUESTER:
            query["requester_id"] = current["id"]
            query["status"] = {"$in": ["delivered", "copy_awaiting_approval"]}
        elif role == ROLE_WRITER:
            query["assigned_writer_id"] = current["id"]
            query["status"] = {"$in": ["in_content"]}
        elif role == ROLE_DESIGNER:
            query["assigned_designer_id"] = current["id"]
            query["status"] = {"$in": ["in_design", "on_hold"]}
        elif role == ROLE_TRIAGE:
            query["status"] = {"$in": ["submitted", "pending_cancellation"]}

    if status:
        query["status"] = status
    if channel:
        query["channel"] = channel
    if assignee:
        query["$or"] = [
            {"assigned_writer_id": assignee},
            {"assigned_designer_id": assignee},
        ]
    if requester:
        query["requester_id"] = requester
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"brief": {"$regex": q, "$options": "i"}},
            {"objective": {"$regex": q, "$options": "i"}},
        ]

    # Sort: high_importance first, then priority asc (nulls last), then created desc
    docs = await db.requests.find(query).to_list(2000)
    docs.sort(key=lambda r: (
        0 if r.get("high_importance") else 1,
        r.get("priority") if r.get("priority") is not None else 10**9,
        -datetime.fromisoformat(r["created_at"]).timestamp(),
    ))
    return [await _hydrate(d) for d in docs]


# ---------- Detail ----------
@router.get("/{request_id}")
async def get_request(request_id: str, current=Depends(get_current_user)):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_view(current, req):
        raise HTTPException(status_code=403, detail="Forbidden")
    return await _hydrate(req)


# ---------- Audit trail ----------
@router.get("/{request_id}/audit")
async def get_audit(request_id: str, current=Depends(get_current_user)):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_view(current, req):
        raise HTTPException(status_code=403, detail="Forbidden")
    entries = await db.audit_log.find({"request_id": request_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return entries


# ---------- Comments ----------
@router.get("/{request_id}/comments")
async def list_comments(request_id: str, current=Depends(get_current_user)):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_view(current, req):
        raise HTTPException(status_code=403, detail="Forbidden")
    comments = await db.comments.find({"request_id": request_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return comments


@router.post("/{request_id}/comments")
async def add_comment(request_id: str, payload: CommentIn, current=Depends(get_current_user)):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if not _can_view(current, req):
        raise HTTPException(status_code=403, detail="Forbidden")
    doc = {
        "id": new_id(),
        "request_id": request_id,
        "author_id": current["id"],
        "author_name": current["name"],
        "author_role": current["role"],
        "body": payload.body.strip(),
        "mentions": payload.mentions,
        "created_at": now_iso(),
    }
    await db.comments.insert_one(doc)
    # Notify mentioned users
    if payload.mentions:
        await notify(payload.mentions, request_id, "mention",
                     f"{current['name']} mentioned you in {req['title']}", actor_id=current["id"])
    return {k: v for k, v in doc.items() if k != "_id"}


# ---------- Triage: prioritize ----------
@router.post("/{request_id}/prioritize")
async def prioritize(request_id: str, payload: PrioritizeIn, current=Depends(require_roles(ROLE_TRIAGE))):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["status"] not in ("submitted", "prioritized"):
        raise HTTPException(status_code=400, detail="Cannot prioritize in current state")

    old_priority = req.get("priority")
    old_hi = req.get("high_importance", False)

    new_status = "prioritized"
    update = {
        "priority": payload.priority,
        "high_importance": payload.high_importance,
        "brief_locked": True,
        "status": new_status,
        "updated_at": now_iso(),
    }
    await db.requests.update_one({"id": request_id}, {"$set": update})
    await _log_audit(request_id, current, "prioritized",
                     from_state=req["status"], to_state=new_status,
                     details={"old_priority": old_priority, "old_high_importance": old_hi,
                              "new_priority": payload.priority, "new_high_importance": payload.high_importance})
    await notify_one(req["requester_id"], request_id, "prioritized",
                     f"Your request '{req['title']}' has been prioritized", actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


# ---------- Writer / Designer: pickup ----------
@router.post("/{request_id}/pickup")
async def pickup(request_id: str, current=Depends(get_current_user)):
    role = current["role"]
    if role not in (ROLE_WRITER, ROLE_DESIGNER):
        raise HTTPException(status_code=403, detail="Only writers/designers can pick up")
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")

    if role == ROLE_WRITER:
        if req["status"] != "prioritized" or req["content_source"] != "write_for_me":
            raise HTTPException(status_code=400, detail="Not available for writer pickup")
        update = {
            "assigned_writer_id": current["id"],
            "status": "in_content",
            "updated_at": now_iso(),
        }
        new_state = "in_content"
    else:  # designer
        # Designer picks up when: prioritized (self-provided) OR copy approved (in_design already set)
        if req["status"] != "prioritized" or req["content_source"] != "self_provided":
            # Also allow designer pickup if in_design and no designer yet (post copy-approval)
            if req["status"] == "in_design" and not req.get("assigned_designer_id"):
                pass
            else:
                raise HTTPException(status_code=400, detail="Not available for designer pickup")
        update = {
            "assigned_designer_id": current["id"],
            "status": "in_design",
            "updated_at": now_iso(),
        }
        new_state = "in_design"

    await db.requests.update_one({"id": request_id}, {"$set": update})
    await _log_audit(request_id, current, "picked_up",
                     from_state=req["status"], to_state=new_state)
    await notify_one(req["requester_id"], request_id, "picked_up",
                     f"{current['name']} picked up your request '{req['title']}'",
                     actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


# ---------- Writer: submit copy ----------
@router.post("/{request_id}/submit-copy")
async def submit_copy(request_id: str, payload: CopySubmitIn, current=Depends(require_roles(ROLE_WRITER))):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["status"] != "in_content" or req.get("assigned_writer_id") != current["id"]:
        raise HTTPException(status_code=400, detail="Not your active copy task")

    await db.requests.update_one({"id": request_id}, {"$set": {
        "draft_copy": payload.body,
        "status": "copy_awaiting_approval",
        "updated_at": now_iso(),
    }})
    await _log_audit(request_id, current, "submitted_copy",
                     from_state="in_content", to_state="copy_awaiting_approval",
                     details={"copy_length": len(payload.body)})
    await notify_one(req["requester_id"], request_id, "copy_ready",
                     f"Copy ready for approval: '{req['title']}'", actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


# ---------- Requester: review copy ----------
@router.post("/{request_id}/review-copy")
async def review_copy(request_id: str, payload: CopyReviewIn, current=Depends(get_current_user)):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["requester_id"] != current["id"]:
        raise HTTPException(status_code=403, detail="Only requester can review copy")
    if req["status"] != "copy_awaiting_approval":
        raise HTTPException(status_code=400, detail="Not awaiting copy approval")

    if payload.approve:
        await db.requests.update_one({"id": request_id}, {"$set": {
            "status": "in_design",
            "updated_at": now_iso(),
        }})
        await _log_audit(request_id, current, "approved_copy",
                         from_state="copy_awaiting_approval", to_state="in_design")
        # Notify all designers (queue open)
        designers = [u["id"] async for u in db.users.find({"role": ROLE_DESIGNER, "active": True}, {"id": 1})]
        await notify(designers, request_id, "queue_ready",
                     f"Copy approved. Ready for design: '{req['title']}'", actor_id=current["id"])
    else:
        if not payload.feedback:
            raise HTTPException(status_code=400, detail="Feedback required when requesting changes")
        await db.requests.update_one({"id": request_id}, {"$set": {
            "status": "in_content",
            "updated_at": now_iso(),
        }, "$inc": {"revision_count": 1}})
        await _log_audit(request_id, current, "requested_copy_changes",
                         from_state="copy_awaiting_approval", to_state="in_content",
                         details={"feedback": payload.feedback})
        if req.get("assigned_writer_id"):
            await notify_one(req["assigned_writer_id"], request_id, "copy_changes",
                             f"Copy changes requested on '{req['title']}': {payload.feedback[:120]}",
                             actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


# ---------- Designer: hold / resume / deliver ----------
@router.post("/{request_id}/hold")
async def put_on_hold(request_id: str, payload: HoldIn, current=Depends(require_roles(ROLE_DESIGNER))):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["status"] != "in_design" or req.get("assigned_designer_id") != current["id"]:
        raise HTTPException(status_code=400, detail="Cannot hold in current state")
    await db.requests.update_one({"id": request_id}, {"$set": {
        "status": "on_hold",
        "on_hold_reason": payload.reason.strip(),
        "on_hold_since": now_iso(),
        "updated_at": now_iso(),
    }})
    await _log_audit(request_id, current, "on_hold",
                     from_state="in_design", to_state="on_hold",
                     details={"reason": payload.reason})
    await notify_one(req["requester_id"], request_id, "on_hold",
                     f"'{req['title']}' put on hold: {payload.reason[:100]}", actor_id=current["id"])
    await notify_triage(request_id, "on_hold",
                        f"'{req['title']}' on hold: {payload.reason[:100]}", actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


@router.post("/{request_id}/resume")
async def resume(request_id: str, current=Depends(require_roles(ROLE_DESIGNER, ROLE_TRIAGE))):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["status"] != "on_hold":
        raise HTTPException(status_code=400, detail="Not on hold")
    if current["role"] == ROLE_DESIGNER and req.get("assigned_designer_id") != current["id"]:
        raise HTTPException(status_code=403, detail="Not your task")
    await db.requests.update_one({"id": request_id}, {"$set": {
        "status": "in_design",
        "on_hold_reason": None,
        "on_hold_since": None,
        "updated_at": now_iso(),
    }})
    await _log_audit(request_id, current, "resumed", from_state="on_hold", to_state="in_design")
    await notify_one(req["requester_id"], request_id, "resumed",
                     f"'{req['title']}' resumed", actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


@router.post("/{request_id}/deliver")
async def deliver(request_id: str, payload: DeliverIn, current=Depends(require_roles(ROLE_DESIGNER))):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["status"] != "in_design" or req.get("assigned_designer_id") != current["id"]:
        raise HTTPException(status_code=400, detail="Cannot deliver in current state")
    now = now_iso()
    await db.requests.update_one({"id": request_id}, {"$set": {
        "status": "delivered",
        "deliverable_url": payload.deliverable_url.strip(),
        "delivery_notes": payload.notes,
        "delivered_at": now,
        "delivered_notified_at": now,   # notification sent immediately, so 48h clock starts now
        "reminder_sent_at": None,
        "updated_at": now,
    }})
    await _log_audit(request_id, current, "delivered",
                     from_state="in_design", to_state="delivered",
                     details={"url": payload.deliverable_url})
    await notify_one(req["requester_id"], request_id, "delivered",
                     f"Delivery ready for review: '{req['title']}' — will auto-approve in 48h.",
                     actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


# ---------- Requester: review design ----------
@router.post("/{request_id}/review-design")
async def review_design(request_id: str, payload: DesignReviewIn, current=Depends(get_current_user)):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["requester_id"] != current["id"]:
        raise HTTPException(status_code=403, detail="Only requester can review")
    if req["status"] != "delivered":
        raise HTTPException(status_code=400, detail="Not awaiting design review")

    if payload.approve:
        await db.requests.update_one({"id": request_id}, {"$set": {
            "status": "completed",
            "completed_at": now_iso(),
            "updated_at": now_iso(),
        }})
        await _log_audit(request_id, current, "approved_design",
                         from_state="delivered", to_state="completed")
        if req.get("assigned_designer_id"):
            await notify_one(req["assigned_designer_id"], request_id, "completed",
                             f"'{req['title']}' approved — good to go!", actor_id=current["id"])
    else:
        if not payload.feedback:
            raise HTTPException(status_code=400, detail="Feedback required for redesign")
        await db.requests.update_one({"id": request_id}, {"$set": {
            "status": "in_design",
            "deliverable_url": None,
            "delivered_at": None,
            "delivered_notified_at": None,
            "reminder_sent_at": None,
            "updated_at": now_iso(),
        }, "$inc": {"revision_count": 1}})
        await _log_audit(request_id, current, "requested_redesign",
                         from_state="delivered", to_state="in_design",
                         details={"feedback": payload.feedback})
        if req.get("assigned_designer_id"):
            await notify_one(req["assigned_designer_id"], request_id, "redesign",
                             f"Redesign requested on '{req['title']}': {payload.feedback[:120]}",
                             actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


# ---------- Cancellation ----------
@router.post("/{request_id}/cancel")
async def cancel(request_id: str, payload: CancelIn, current=Depends(get_current_user)):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["requester_id"] != current["id"]:
        raise HTTPException(status_code=403, detail="Only requester can cancel")
    if req["status"] in ("completed", "cancelled", "pending_cancellation"):
        raise HTTPException(status_code=400, detail="Cannot cancel in current state")

    picked_up = bool(req.get("assigned_writer_id") or req.get("assigned_designer_id"))
    if not picked_up:
        # Instant cancellation
        await db.requests.update_one({"id": request_id}, {"$set": {
            "status": "cancelled",
            "cancelled_at": now_iso(),
            "updated_at": now_iso(),
        }})
        await _log_audit(request_id, current, "cancelled",
                         from_state=req["status"], to_state="cancelled",
                         details={"reason": payload.reason})
        await notify_triage(request_id, "cancelled",
                            f"'{req['title']}' cancelled by requester", actor_id=current["id"])
    else:
        # Requires triage confirmation
        await db.requests.update_one({"id": request_id}, {"$set": {
            "status": "pending_cancellation",
            "prev_state_for_cancel": req["status"],
            "updated_at": now_iso(),
        }})
        await _log_audit(request_id, current, "cancellation_requested",
                         from_state=req["status"], to_state="pending_cancellation",
                         details={"reason": payload.reason})
        await notify_triage(request_id, "cancel_pending",
                            f"Cancellation requested for '{req['title']}'", actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


@router.post("/{request_id}/cancel-decision")
async def cancel_decision(request_id: str, payload: CancelDecisionIn,
                           current=Depends(require_roles(ROLE_TRIAGE))):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    if req["status"] != "pending_cancellation":
        raise HTTPException(status_code=400, detail="No pending cancellation")

    if payload.approve:
        await db.requests.update_one({"id": request_id}, {"$set": {
            "status": "cancelled",
            "cancelled_at": now_iso(),
            "prev_state_for_cancel": None,
            "updated_at": now_iso(),
        }})
        await _log_audit(request_id, current, "cancellation_confirmed",
                         from_state="pending_cancellation", to_state="cancelled",
                         details={"note": payload.note})
        await notify_one(req["requester_id"], request_id, "cancel_confirmed",
                         f"Cancellation confirmed for '{req['title']}'", actor_id=current["id"])
    else:
        prev = req.get("prev_state_for_cancel") or "prioritized"
        await db.requests.update_one({"id": request_id}, {"$set": {
            "status": prev,
            "prev_state_for_cancel": None,
            "updated_at": now_iso(),
        }})
        await _log_audit(request_id, current, "cancellation_declined",
                         from_state="pending_cancellation", to_state=prev,
                         details={"note": payload.note})
        await notify_one(req["requester_id"], request_id, "cancel_declined",
                         f"Cancellation declined for '{req['title']}'", actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)


# ---------- Reassignment (triage) ----------
@router.post("/{request_id}/reassign")
async def reassign(request_id: str, payload: ReassignIn,
                    current=Depends(require_roles(ROLE_TRIAGE))):
    req = await db.requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    target = await db.users.find_one({"id": payload.user_id})
    if not target or not target.get("active", True) or target["role"] != payload.role:
        raise HTTPException(status_code=400, detail="Invalid target user")

    field = "assigned_writer_id" if payload.role == "writer" else "assigned_designer_id"
    old_id = req.get(field)
    await db.requests.update_one({"id": request_id}, {"$set": {
        field: target["id"], "updated_at": now_iso(),
    }})
    await _log_audit(request_id, current, "reassigned",
                     details={"role": payload.role, "from": old_id, "to": target["id"]})
    if old_id:
        await notify_one(old_id, request_id, "reassigned_off",
                         f"You were unassigned from '{req['title']}'", actor_id=current["id"])
    await notify_one(target["id"], request_id, "reassigned_to",
                     f"You were assigned to '{req['title']}'", actor_id=current["id"])
    updated = await db.requests.find_one({"id": request_id})
    return await _hydrate(updated)
