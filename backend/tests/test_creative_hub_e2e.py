"""End-to-end backend regression suite for Creative Hub.

Covers auth, admin, channels, requests state machine (both content paths),
file upload, comments, notifications, dashboard, cancellation flows.

Tests are ordered: pytest runs top-to-bottom within a file, and each test
mutates `state` (session-scoped dict) so downstream tests can reuse
created ids and access tokens.
"""
import io
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://creative-workflow-16.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Health & system ----------------
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_system_empty(state):
    r = requests.get(f"{API}/auth/system", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["total_users"] == 0
    assert data["admin_exists"] is False


# ---------------- First-signup / claim-admin ----------------
def test_register_first_user_is_first_admin_flag(state):
    r = requests.post(f"{API}/auth/register", json={
        "email": "admin@creativehub.com",
        "password": "Admin1234!",
        "name": "Alice Admin",
    }, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["is_first_admin"] is True
    assert data["user"]["role"] == "requester"
    assert data.get("access_token")
    state["admin"] = {"token": data["access_token"], "id": data["user"]["id"],
                       "email": "admin@creativehub.com"}


def test_claim_admin_promotes_to_triage(state):
    r = requests.post(f"{API}/auth/claim-admin",
                      headers=_h(state["admin"]["token"]),
                      json={}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "triage"


def test_register_second_user_defaults_to_requester_no_first_admin(state):
    r = requests.post(f"{API}/auth/register", json={
        "email": "requester@creativehub.com",
        "password": "Req1234!",
        "name": "Rick Requester",
    }, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "requester"
    assert data["user"]["is_first_admin"] is False
    state["requester"] = {"token": data["access_token"], "id": data["user"]["id"]}


def test_register_writer_and_designer_and_executive(state):
    for key, email, name in [
        ("writer", "writer@creativehub.com", "Wendy Writer"),
        ("designer", "designer@creativehub.com", "Dan Designer"),
        ("executive", "exec@creativehub.com", "Eve Exec"),
    ]:
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Pass1234!", "name": name}, timeout=15)
        assert r.status_code == 200, r.text
        state[key] = {"token": r.json()["access_token"], "id": r.json()["user"]["id"]}


# ---------------- Login / me / lockout ----------------
def test_login_success_and_me(state):
    r = requests.post(f"{API}/auth/login", json={
        "email": "admin@creativehub.com", "password": "Admin1234!"}, timeout=10)
    assert r.status_code == 200
    tok = r.json()["access_token"]
    state["admin"]["token"] = tok
    me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=10)
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "admin@creativehub.com"


def test_login_invalid_returns_401():
    r = requests.post(f"{API}/auth/login", json={
        "email": "admin@creativehub.com", "password": "wrong"}, timeout=10)
    assert r.status_code == 401


def test_lockout_after_5_fails(state):
    email = "lockout_probe@creativehub.com"
    # register the user first so the lockout is about credentials, not existence
    requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Correct1!", "name": "Lock Probe"}, timeout=10)
    codes = []
    for _ in range(6):
        r = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": "wrongpw"}, timeout=10)
        codes.append(r.status_code)
    # last one should be 429 (locked) — 5 fails threshold
    assert 429 in codes, f"Expected a 429 in {codes}"


# ---------------- Admin: role management & channels ----------------
def test_admin_list_users(state):
    r = requests.get(f"{API}/admin/users", headers=_h(state["admin"]["token"]), timeout=10)
    assert r.status_code == 200
    assert len(r.json()) >= 5


def test_non_admin_gets_403_on_admin(state):
    r = requests.get(f"{API}/admin/users", headers=_h(state["requester"]["token"]), timeout=10)
    assert r.status_code == 403


def test_admin_promotes_writer_designer_executive(state):
    for key, role in [("writer", "writer"), ("designer", "designer"),
                       ("executive", "executive")]:
        r = requests.patch(f"{API}/admin/users/{state[key]['id']}/role",
                           headers=_h(state["admin"]["token"]),
                           json={"role": role}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["role"] == role


def test_cannot_demote_last_admin(state):
    # admin trying to demote self while being the only admin -> 400
    r = requests.patch(f"{API}/admin/users/{state['admin']['id']}/role",
                       headers=_h(state["admin"]["token"]),
                       json={"role": "requester"}, timeout=10)
    assert r.status_code == 400


def test_cannot_deactivate_last_admin(state):
    r = requests.patch(f"{API}/admin/users/{state['admin']['id']}/active",
                       headers=_h(state["admin"]["token"]),
                       json={"active": False}, timeout=10)
    assert r.status_code == 400


def test_channels_list_default(state):
    r = requests.get(f"{API}/channels", headers=_h(state["requester"]["token"]), timeout=10)
    assert r.status_code == 200
    names = [c["name"] for c in r.json()]
    for expected in ["WhatsApp", "Social", "Website", "Banner", "Digital", "Others"]:
        assert expected in names, f"Missing default channel {expected}"


def test_admin_can_create_channel(state):
    r = requests.post(f"{API}/admin/channels",
                      headers=_h(state["admin"]["token"]),
                      json={"name": "TEST_Newsletter"}, timeout=10)
    assert r.status_code == 200
    state["test_channel_id"] = r.json()["id"]


# ---------------- Requests state machine (write_for_me path) ----------------
def test_create_request_write_for_me(state):
    payload = {
        "title": "TEST_WFM Campaign",
        "objective": "Drive Q1 signups",
        "target_audience": "SMB owners",
        "brief": "Announce the launch of the new EV charging network",
        "channel": "WhatsApp",
        "content_source": "write_for_me",
        "reference_file_ids": [],
    }
    r = requests.post(f"{API}/requests",
                      headers=_h(state["requester"]["token"]),
                      json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "submitted"
    assert data["brief_locked"] is False
    state["req_id"] = data["id"]


def test_create_request_invalid_channel(state):
    r = requests.post(f"{API}/requests", headers=_h(state["requester"]["token"]), json={
        "title": "TEST_X", "objective": "x", "target_audience": "x", "brief": "x",
        "channel": "NoSuchChannel", "content_source": "write_for_me",
    }, timeout=10)
    assert r.status_code == 400


def test_create_self_provided_requires_copy(state):
    r = requests.post(f"{API}/requests", headers=_h(state["requester"]["token"]), json={
        "title": "TEST_SP", "objective": "x", "target_audience": "x", "brief": "x",
        "channel": "Social", "content_source": "self_provided",
        "no_text_needed": False,
    }, timeout=10)
    assert r.status_code == 400


def test_triage_prioritize(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/prioritize",
                      headers=_h(state["admin"]["token"]),
                      json={"priority": 1, "high_importance": True}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "prioritized"
    assert data["brief_locked"] is True
    # audit
    a = requests.get(f"{API}/requests/{rid}/audit",
                     headers=_h(state["admin"]["token"]), timeout=10)
    assert a.status_code == 200
    log = a.json()
    assert any(e.get("from_state") == "submitted" and e.get("to_state") == "prioritized"
               for e in log), log


def test_writer_pickup_and_submit_copy(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/pickup",
                      headers=_h(state["writer"]["token"]),
                      json={}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_content"

    r2 = requests.post(f"{API}/requests/{rid}/submit-copy",
                       headers=_h(state["writer"]["token"]),
                       json={"body": "Here is a draft copy body."}, timeout=10)
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "copy_awaiting_approval"


def test_requester_bounces_copy(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/review-copy",
                      headers=_h(state["requester"]["token"]),
                      json={"approve": False, "feedback": "Please shorten"}, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "in_content"
    assert data["revision_count"] == 1


def test_requester_bounce_without_feedback_400(state):
    rid = state["req_id"]
    # get it back to copy_awaiting_approval
    requests.post(f"{API}/requests/{rid}/submit-copy",
                  headers=_h(state["writer"]["token"]),
                  json={"body": "second draft"}, timeout=10)
    r = requests.post(f"{API}/requests/{rid}/review-copy",
                      headers=_h(state["requester"]["token"]),
                      json={"approve": False}, timeout=10)
    assert r.status_code == 400


def test_requester_approves_copy(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/review-copy",
                      headers=_h(state["requester"]["token"]),
                      json={"approve": True}, timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "in_design"


def test_designer_pickup_after_copy_approval(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/pickup",
                      headers=_h(state["designer"]["token"]),
                      json={}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_design"
    assert r.json()["assigned_designer_id"] == state["designer"]["id"]


def test_hold_requires_reason(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/hold",
                      headers=_h(state["designer"]["token"]),
                      json={"reason": ""}, timeout=10)
    assert r.status_code in (400, 422)


def test_hold_and_resume(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/hold",
                      headers=_h(state["designer"]["token"]),
                      json={"reason": "Waiting on brand assets"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "on_hold"

    r2 = requests.post(f"{API}/requests/{rid}/resume",
                       headers=_h(state["designer"]["token"]),
                       json={}, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["status"] == "in_design"


def test_deliver_requires_url(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/deliver",
                      headers=_h(state["designer"]["token"]),
                      json={"deliverable_url": ""}, timeout=10)
    assert r.status_code in (400, 422)


def test_deliver_success(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/deliver",
                      headers=_h(state["designer"]["token"]),
                      json={"deliverable_url": "https://example.com/final.png"},
                      timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "delivered"
    assert data["deliverable_url"] == "https://example.com/final.png"
    assert data["delivered_at"] is not None


def test_redesign_requires_feedback(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/review-design",
                      headers=_h(state["requester"]["token"]),
                      json={"approve": False}, timeout=10)
    assert r.status_code == 400


def test_redesign_then_final_approve(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/review-design",
                      headers=_h(state["requester"]["token"]),
                      json={"approve": False, "feedback": "Change bg to emerald"},
                      timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "in_design"
    assert data["deliverable_url"] is None
    assert data["revision_count"] >= 2

    # re-deliver then approve
    r2 = requests.post(f"{API}/requests/{rid}/deliver",
                       headers=_h(state["designer"]["token"]),
                       json={"deliverable_url": "https://example.com/final2.png"},
                       timeout=10)
    assert r2.status_code == 200

    r3 = requests.post(f"{API}/requests/{rid}/review-design",
                       headers=_h(state["requester"]["token"]),
                       json={"approve": True}, timeout=10)
    assert r3.status_code == 200
    assert r3.json()["status"] == "completed"


# ---------------- Self-provided path (short) ----------------
def test_self_provided_direct_to_designer(state):
    payload = {
        "title": "TEST_SP flow",
        "objective": "obj", "target_audience": "aud",
        "brief": "brief text", "channel": "Website",
        "content_source": "self_provided",
        "provided_copy": "This is my copy",
        "reference_file_ids": [],
    }
    r = requests.post(f"{API}/requests",
                      headers=_h(state["requester"]["token"]),
                      json=payload, timeout=10)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    requests.post(f"{API}/requests/{rid}/prioritize",
                  headers=_h(state["admin"]["token"]),
                  json={"priority": 2}, timeout=10)
    r2 = requests.post(f"{API}/requests/{rid}/pickup",
                       headers=_h(state["designer"]["token"]), json={}, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["status"] == "in_design"
    state["sp_req_id"] = rid


# ---------------- Writer cannot pickup self_provided ----------------
def test_writer_cannot_pickup_self_provided(state):
    payload = {
        "title": "TEST_no_writer", "objective": "o", "target_audience": "a",
        "brief": "b", "channel": "Digital", "content_source": "self_provided",
        "provided_copy": "copy", "reference_file_ids": [],
    }
    r = requests.post(f"{API}/requests",
                      headers=_h(state["requester"]["token"]),
                      json=payload, timeout=10)
    rid = r.json()["id"]
    requests.post(f"{API}/requests/{rid}/prioritize",
                  headers=_h(state["admin"]["token"]),
                  json={"priority": 3}, timeout=10)
    r2 = requests.post(f"{API}/requests/{rid}/pickup",
                       headers=_h(state["writer"]["token"]), json={}, timeout=10)
    assert r2.status_code == 400


# ---------------- Cancellation ----------------
def test_cancel_without_pickup_immediate(state):
    payload = {
        "title": "TEST_cancel_immediate", "objective": "o", "target_audience": "a",
        "brief": "b", "channel": "Banner", "content_source": "write_for_me",
        "reference_file_ids": [],
    }
    r = requests.post(f"{API}/requests",
                      headers=_h(state["requester"]["token"]),
                      json=payload, timeout=10)
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/requests/{rid}/cancel",
                       headers=_h(state["requester"]["token"]),
                       json={"reason": "no longer needed"}, timeout=10)
    assert r2.status_code == 200
    assert r2.json()["status"] == "cancelled"


def test_cancel_after_pickup_becomes_pending_and_triage_decides(state):
    # Create request, prioritize, writer picks up, requester cancels -> pending
    payload = {
        "title": "TEST_cancel_pending", "objective": "o", "target_audience": "a",
        "brief": "b", "channel": "Social", "content_source": "write_for_me",
        "reference_file_ids": [],
    }
    r = requests.post(f"{API}/requests",
                      headers=_h(state["requester"]["token"]),
                      json=payload, timeout=10)
    rid = r.json()["id"]
    requests.post(f"{API}/requests/{rid}/prioritize",
                  headers=_h(state["admin"]["token"]),
                  json={"priority": 4}, timeout=10)
    requests.post(f"{API}/requests/{rid}/pickup",
                  headers=_h(state["writer"]["token"]), json={}, timeout=10)
    rc = requests.post(f"{API}/requests/{rid}/cancel",
                       headers=_h(state["requester"]["token"]),
                       json={"reason": "changed mind"}, timeout=10)
    assert rc.status_code == 200
    assert rc.json()["status"] == "pending_cancellation"
    # triage declines
    rd = requests.post(f"{API}/requests/{rid}/cancel-decision",
                       headers=_h(state["admin"]["token"]),
                       json={"approve": False}, timeout=10)
    assert rd.status_code == 200
    assert rd.json()["status"] == "in_content"  # restored to prev_state
    # triage approves after re-request
    requests.post(f"{API}/requests/{rid}/cancel",
                  headers=_h(state["requester"]["token"]),
                  json={"reason": "final"}, timeout=10)
    ra = requests.post(f"{API}/requests/{rid}/cancel-decision",
                       headers=_h(state["admin"]["token"]),
                       json={"approve": True}, timeout=10)
    assert ra.status_code == 200
    assert ra.json()["status"] == "cancelled"


# ---------------- Comments ----------------
def test_comment_add_and_mention(state):
    rid = state["req_id"]
    r = requests.post(f"{API}/requests/{rid}/comments",
                      headers=_h(state["requester"]["token"]),
                      json={"body": "Nice work @designer",
                            "mentions": [state["designer"]["id"]]},
                      timeout=10)
    assert r.status_code == 200
    lst = requests.get(f"{API}/requests/{rid}/comments",
                       headers=_h(state["requester"]["token"]), timeout=10)
    assert lst.status_code == 200
    assert any(c["body"].startswith("Nice work") for c in lst.json())


# ---------------- Notifications ----------------
def test_notifications_and_mark_read(state):
    # Designer should have notifications from mention & completed
    r = requests.get(f"{API}/notifications",
                     headers=_h(state["designer"]["token"]), timeout=10)
    assert r.status_code == 200
    notifs = r.json()
    assert len(notifs) > 0, "Designer should have received notifications"

    # unread count > 0
    uc = requests.get(f"{API}/notifications/unread-count",
                      headers=_h(state["designer"]["token"]), timeout=10)
    assert uc.status_code == 200
    assert uc.json()["count"] > 0

    # mark single read
    nid = notifs[0]["id"]
    rr = requests.post(f"{API}/notifications/{nid}/read",
                       headers=_h(state["designer"]["token"]),
                       json={}, timeout=10)
    assert rr.status_code == 200

    # mark all
    ma = requests.post(f"{API}/notifications/mark-all-read",
                       headers=_h(state["designer"]["token"]),
                       json={}, timeout=10)
    assert ma.status_code == 200

    uc2 = requests.get(f"{API}/notifications/unread-count",
                       headers=_h(state["designer"]["token"]), timeout=10)
    assert uc2.json()["count"] == 0


def test_actor_not_notified_of_own_action(state):
    # Admin prioritized requests — admin should not have "prioritized" notifs about themselves
    r = requests.get(f"{API}/notifications",
                     headers=_h(state["admin"]["token"]), timeout=10)
    assert r.status_code == 200
    # There should be no "prioritized" notif in admin's own list from admin's actions.
    # Admin acted on a requester's request; requester should get it. Admin gets triage-scoped notifs (submitted etc).
    # We assert simple invariant: no notification whose message contains prioritized for the admin's own actions.
    # (Admin never receives "prioritized" notifications by design.)
    for n in r.json():
        assert n["kind"] != "prioritized"


# ---------------- File upload ----------------
def test_upload_image_and_download(state):
    # 1x1 PNG
    png_bytes = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
    )
    files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
    r = requests.post(f"{API}/files/upload",
                      headers={"Authorization": f"Bearer {state['requester']['token']}"},
                      files=files, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Object storage not available: {r.status_code} {r.text[:200]}")
    fid = r.json()["id"]
    dl = requests.get(f"{API}/files/{fid}/download",
                      headers=_h(state["requester"]["token"]), timeout=10)
    assert dl.status_code == 200


def test_upload_rejects_non_image(state):
    files = {"file": ("bad.exe", io.BytesIO(b"MZbinary"), "application/octet-stream")}
    r = requests.post(f"{API}/files/upload",
                      headers={"Authorization": f"Bearer {state['requester']['token']}"},
                      files=files, timeout=10)
    assert r.status_code == 400


# ---------------- Dashboard ----------------
def test_dashboard_summary_triage(state):
    r = requests.get(f"{API}/dashboard/summary",
                     headers=_h(state["admin"]["token"]), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ["counts", "medians", "blockers", "volume_by_channel",
              "wip_writers", "wip_designers"]:
        assert k in data
    assert data["counts"]["completed"] >= 1


def test_dashboard_forbidden_for_requester(state):
    r = requests.get(f"{API}/dashboard/summary",
                     headers=_h(state["requester"]["token"]), timeout=10)
    assert r.status_code == 403


def test_dashboard_ok_for_executive(state):
    r = requests.get(f"{API}/dashboard/summary",
                     headers=_h(state["executive"]["token"]), timeout=10)
    assert r.status_code == 200


# ---------------- List filters ----------------
def test_search_query_filter(state):
    r = requests.get(f"{API}/requests?q=WFM",
                     headers=_h(state["admin"]["token"]), timeout=10)
    assert r.status_code == 200
    titles = [x["title"] for x in r.json()]
    assert any("WFM" in t for t in titles)


def test_requester_scope_all_only_shows_own(state):
    r = requests.get(f"{API}/requests?scope=all",
                     headers=_h(state["requester"]["token"]), timeout=10)
    assert r.status_code == 200
    for req in r.json():
        assert req["requester_id"] == state["requester"]["id"]


# ---------------- Reassignment ----------------
def test_reassign_to_another_designer(state):
    # promote another user to designer so we can reassign
    r = requests.post(f"{API}/auth/register", json={
        "email": "designer2@creativehub.com",
        "password": "Des1234!", "name": "Dana Designer2"}, timeout=10)
    assert r.status_code == 200
    d2 = r.json()["user"]["id"]
    requests.patch(f"{API}/admin/users/{d2}/role",
                   headers=_h(state["admin"]["token"]),
                   json={"role": "designer"}, timeout=10)
    # Use SP request which has designer assigned
    rid = state["sp_req_id"]
    rr = requests.post(f"{API}/requests/{rid}/reassign",
                       headers=_h(state["admin"]["token"]),
                       json={"role": "designer", "user_id": d2}, timeout=10)
    assert rr.status_code == 200, rr.text
    assert rr.json()["assigned_designer_id"] == d2


# ---------------- Logout ----------------
def test_logout(state):
    r = requests.post(f"{API}/auth/logout",
                      headers=_h(state["requester"]["token"]), timeout=10)
    assert r.status_code == 200
