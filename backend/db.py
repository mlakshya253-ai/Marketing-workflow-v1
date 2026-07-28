"""Shared MongoDB client + database handle."""
import os
from motor.motor_asyncio import AsyncIOMotorClient

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.requests.create_index("status")
    await db.requests.create_index("requester_id")
    await db.requests.create_index("assigned_designer_id")
    await db.requests.create_index("assigned_writer_id")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.audit_log.create_index([("request_id", 1), ("created_at", 1)])
    await db.comments.create_index([("request_id", 1), ("created_at", 1)])


def get_client() -> AsyncIOMotorClient:
    return _client
