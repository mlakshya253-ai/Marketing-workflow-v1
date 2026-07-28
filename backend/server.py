"""Creative Hub — FastAPI entrypoint."""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import ensure_indexes
from storage import init_storage
from routes_auth import router as auth_router
from routes_admin import router as admin_router, public_router as channels_public_router, mention_router
from routes_files import router as files_router
from routes_requests import router as requests_router
from routes_notifications import router as notifications_router
from routes_dashboard import router as dashboard_router
from routes_admin import ensure_default_channels
from scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Creative Hub")

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(admin_router)
api.include_router(channels_public_router)
api.include_router(mention_router)
api.include_router(files_router)
api.include_router(requests_router)
api.include_router(notifications_router)
api.include_router(dashboard_router)


@api.get("/health")
async def health():
    return {"ok": True, "service": "creative-hub"}


app.include_router(api)

_cors_origins = os.environ.get("CORS_ORIGINS", "*")
_frontend_url = os.environ.get("FRONTEND_URL", "").strip()
if _cors_origins == "*" and _frontend_url:
    origins = [_frontend_url, "http://localhost:3000"]
else:
    origins = _cors_origins.split(",") if _cors_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.on_event("startup")
async def _on_startup():
    await ensure_indexes()
    await ensure_default_channels()
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed (will retry lazily): {e}")
    start_scheduler()


@app.on_event("shutdown")
async def _on_shutdown():
    stop_scheduler()
