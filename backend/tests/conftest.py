"""Shared pytest fixtures for Creative Hub backend tests."""
import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

# Load backend .env so we can access MONGO_URL / DB_NAME
BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else \
    (Path("/app/frontend/.env").read_text().splitlines()[0].split("=", 1)[1].strip())


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session", autouse=True)
def clean_db():
    """Wipe collections so first-signup flow is testable. Runs once per session."""
    from pymongo import MongoClient
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = MongoClient(mongo_url)
    db = client[db_name]
    for coll in ["users", "requests", "audit_log", "comments",
                 "notifications", "login_attempts", "files"]:
        db[coll].delete_many({})
    # keep channels seeded on startup
    yield
    client.close()


@pytest.fixture(scope="session")
def state() -> dict:
    """Shared mutable dict passed across tests to preserve created ids/tokens."""
    return {}
