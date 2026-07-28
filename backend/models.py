"""Pydantic models & state machine constants."""
from datetime import datetime, timezone
from typing import List, Optional, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict
import uuid


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- State machine ----------
STATES = [
    "submitted",
    "prioritized",
    "in_content",
    "copy_awaiting_approval",
    "in_design",
    "on_hold",
    "delivered",
    "completed",
    "cancelled",
    "pending_cancellation",
]

ACTIVE_STATES = {
    "submitted", "prioritized", "in_content", "copy_awaiting_approval",
    "in_design", "on_hold", "delivered", "pending_cancellation",
}

TERMINAL_STATES = {"completed", "cancelled"}


# ---------- Auth models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: str
    active: bool = True
    is_first_admin: bool = False
    created_at: str


# ---------- Admin ----------
class RoleUpdateIn(BaseModel):
    role: Literal["requester", "triage", "writer", "designer", "executive"]


class ActiveUpdateIn(BaseModel):
    active: bool


class ClaimAdminIn(BaseModel):
    pass


# ---------- Channels ----------
class ChannelIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


# ---------- Requests ----------
class RequestCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    objective: str = Field(min_length=1, max_length=1000)
    target_audience: str = Field(min_length=1, max_length=500)
    brief: str = Field(min_length=1, max_length=8000)
    channel: str
    desired_deadline: Optional[str] = None   # ISO date, informational
    content_source: Literal["write_for_me", "self_provided"]
    provided_copy: Optional[str] = None       # required if self_provided AND has text
    no_text_needed: bool = False              # explicit flag when self_provided and no copy
    reference_file_ids: List[str] = Field(default_factory=list)


class PrioritizeIn(BaseModel):
    priority: Optional[int] = None  # numeric order (lower = higher priority)
    high_importance: bool = False


class CopySubmitIn(BaseModel):
    body: str = Field(min_length=1)


class CopyReviewIn(BaseModel):
    approve: bool
    feedback: Optional[str] = None


class DeliverIn(BaseModel):
    deliverable_url: str = Field(min_length=1)
    notes: Optional[str] = None


class DesignReviewIn(BaseModel):
    approve: bool
    feedback: Optional[str] = None


class HoldIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ReassignIn(BaseModel):
    role: Literal["writer", "designer"]
    user_id: str


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    mentions: List[str] = Field(default_factory=list)  # user ids


class CancelIn(BaseModel):
    reason: Optional[str] = None


class CancelDecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = None
