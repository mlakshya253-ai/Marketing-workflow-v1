"""Reference image upload & download via Emergent object storage."""
import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Response, Query, Request
import jwt

from auth import get_current_user, JWT_ALGORITHM
from db import db
from storage import put_object, get_object, guess_mime, APP_NAME
from models import new_id, now_iso

router = APIRouter(prefix="/files", tags=["files"])

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_EXT = {"jpg", "jpeg", "png", "gif", "webp"}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), current=Depends(get_current_user)):
    filename = (file.filename or "upload").strip()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only images allowed (jpg, png, gif, webp)")
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Max file size is 5MB")

    file_id = new_id()
    path = f"{APP_NAME}/uploads/{current['id']}/{file_id}.{ext}"
    content_type = file.content_type or guess_mime(ext)
    result = put_object(path, data, content_type)

    doc = {
        "id": file_id,
        "uploader_id": current["id"],
        "storage_path": result["path"],
        "original_filename": filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.files.insert_one(doc)
    return {"id": file_id, "filename": filename, "size": doc["size"]}


async def _authorize_via_query_or_cookie(request: Request, auth: str = None) -> dict:
    token = request.cookies.get("access_token") or auth
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User invalid")
    return user


@router.get("/{file_id}/download")
async def download_file(file_id: str, request: Request, auth: str = Query(default=None)):
    await _authorize_via_query_or_cookie(request, auth)
    record = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type", ct))
