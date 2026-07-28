"""Background scheduler: 24h reminder + 48h auto-approval for delivered requests."""
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import db
from models import now_iso
from notifications import notify_one

logger = logging.getLogger(__name__)

REMINDER_HOURS = 24
AUTO_APPROVE_HOURS = 48

scheduler: AsyncIOScheduler = AsyncIOScheduler(timezone="UTC")


async def _sweep_delivered():
    """Send 24h reminders and 48h auto-approvals."""
    now = datetime.now(timezone.utc)
    docs = await db.requests.find({"status": "delivered"}).to_list(2000)
    for d in docs:
        notified_at_str = d.get("delivered_notified_at")
        if not notified_at_str:
            continue
        try:
            notified_at = datetime.fromisoformat(notified_at_str)
            if notified_at.tzinfo is None:
                notified_at = notified_at.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        elapsed = now - notified_at

        # 24h reminder
        if elapsed >= timedelta(hours=REMINDER_HOURS) and not d.get("reminder_sent_at"):
            await notify_one(d["requester_id"], d["id"], "reminder",
                             f"Reminder: '{d['title']}' is awaiting your review — 24h left before auto-approval.")
            await db.requests.update_one({"id": d["id"]}, {"$set": {"reminder_sent_at": now_iso()}})

        # 48h auto-approve
        if elapsed >= timedelta(hours=AUTO_APPROVE_HOURS):
            await db.requests.update_one({"id": d["id"]}, {"$set": {
                "status": "completed",
                "completed_at": now_iso(),
                "auto_approved": True,
                "updated_at": now_iso(),
            }})
            await db.audit_log.insert_one({
                "id": __import__("uuid").uuid4().hex,
                "request_id": d["id"],
                "actor_id": "system",
                "actor_name": "System",
                "actor_role": "system",
                "action": "auto_approved",
                "from_state": "delivered",
                "to_state": "completed",
                "details": {},
                "created_at": now_iso(),
            })
            await notify_one(d["requester_id"], d["id"], "auto_approved",
                             f"'{d['title']}' was auto-approved after 48 hours.")
            if d.get("assigned_designer_id"):
                await notify_one(d["assigned_designer_id"], d["id"], "auto_approved",
                                 f"'{d['title']}' auto-approved after 48h.")


def start_scheduler():
    if scheduler.running:
        return
    scheduler.add_job(_sweep_delivered, "interval", minutes=5, id="sweep_delivered", replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started with sweep_delivered every 5 minutes")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
