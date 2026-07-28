"""Targeted API tests for iteration_2 bug fixes:
- Fix #1: desired_deadline accepts ISO yyyy-MM-dd string and null on POST /api/requests
- Fix #2: verifier@creativehub.com (promoted to triage) can access /api/admin/users
- Regression: register tester2, admin promotes via PATCH /api/admin/users/{id}/role
"""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://creative-workflow-16.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={
        "email": "verifier@creativehub.com", "password": "Verify1234!"
    })
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def test_auth_me_returns_triage(admin_session):
    r = admin_session.get(f"{BASE}/api/auth/me")
    assert r.status_code == 200, r.text
    data = r.json()
    user = data.get("user", data)
    assert user["role"] == "triage"
    assert user["active"] is True


def test_admin_users_endpoint_accessible(admin_session):
    r = admin_session.get(f"{BASE}/api/admin/users")
    assert r.status_code == 200, r.text
    users = r.json()
    emails = [u["email"] for u in users]
    assert "verifier@creativehub.com" in emails
    assert "lakshya.malhotra@statiq.in" in emails


def test_system_stats():
    # Just informational
    r = requests.get(f"{BASE}/api/auth/system")
    assert r.status_code == 200
    data = r.json()
    assert data["admin_exists"] is True


def test_create_request_with_deadline_iso(admin_session):
    payload = {
        "title": "TEST_ITER2 deadline set",
        "objective": "verify deadline stored",
        "target_audience": "internal",
        "brief": "brief text " * 3,
        "channel": "Social",
        "desired_deadline": "2026-09-15",
        "content_source": "write_for_me",
        "provided_copy": None,
        "no_text_needed": False,
        "reference_file_ids": [],
    }
    r = admin_session.post(f"{BASE}/api/requests", json=payload)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created["desired_deadline"] in ("2026-09-15", "2026-09-15T00:00:00", None) or "2026-09-15" in str(created.get("desired_deadline"))
    rid = created["id"]

    # GET verify persistence
    g = admin_session.get(f"{BASE}/api/requests/{rid}")
    assert g.status_code == 200
    fetched = g.json()
    assert "2026-09-15" in str(fetched.get("desired_deadline"))


def test_create_request_with_null_deadline(admin_session):
    payload = {
        "title": "TEST_ITER2 no deadline",
        "objective": "verify null deadline ok",
        "target_audience": "internal",
        "brief": "brief text " * 3,
        "channel": "Social",
        "desired_deadline": None,
        "content_source": "write_for_me",
        "provided_copy": None,
        "no_text_needed": False,
        "reference_file_ids": [],
    }
    r = admin_session.post(f"{BASE}/api/requests", json=payload)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created.get("desired_deadline") in (None, "")


def test_register_and_promote_tester2(admin_session):
    # Register fresh user
    reg = requests.post(f"{BASE}/api/auth/register", json={
        "email": "tester2@creativehub.com", "password": "Pass1234!", "name": "Tester Two"
    })
    assert reg.status_code in (200, 201), reg.text
    body = reg.json()
    user = body["user"]
    assert user["role"] == "requester"
    assert user["is_first_admin"] is False
    uid = user["id"]

    # Admin promotes to writer
    p = admin_session.patch(f"{BASE}/api/admin/users/{uid}/role", json={"role": "writer"})
    assert p.status_code == 200, p.text
    assert p.json()["role"] == "writer"
