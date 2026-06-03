from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.core.events import publish
from app.models.source import Source
from app.services.credits import get_or_create_usage
from app.services.storage import get_storage
from app.tasks.huey_app import ingest_source_task

router = APIRouter()


class SourceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    status: str
    source_type: str
    byte_size: int | None
    error_message: str | None


@router.get("", response_model=list[SourceOut])
def list_sources(db: DbSession, user: CurrentUser):
    rows = db.execute(
        select(Source).where(Source.org_id == user.org_id).order_by(Source.created_at.desc())
    ).scalars()
    return list(rows)


@router.post("", response_model=SourceOut, status_code=202)
async def upload_source(
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    settings = get_settings()
    data = await file.read()
    if len(data) > settings.max_file_size_bytes:
        raise HTTPException(status_code=413, detail="File too large")

    from app.models.org import Org

    org = db.get(Org, user.org_id)
    tier = org.tier if org else "free"
    usage = get_or_create_usage(db, user.org_id)
    if usage.storage_bytes + len(data) > settings.storage_limit_for_tier(tier):
        raise HTTPException(status_code=413, detail="Storage quota exceeded")

    storage = get_storage()
    key = storage.save(user.org_id, file.filename or "upload.bin", data)
    file_path = (
        str(Path(settings.storage_local_path) / key)
        if settings.storage_backend == "local"
        else key
    )
    source = Source(
        id=str(uuid.uuid4()),
        org_id=user.org_id,
        name=file.filename or "upload.bin",
        source_type="upload",
        file_path=file_path,
        status="pending",
        byte_size=len(data),
    )

    db.add(source)
    usage.storage_bytes += len(data)
    db.commit()
    db.refresh(source)

    ingest_source_task.call_local(source.id)
    return source


@router.delete("/{source_id}")
def delete_source(source_id: str, db: DbSession, user: CurrentUser):
    source = db.get(Source, source_id)
    if source is None or source.org_id != user.org_id:
        raise HTTPException(status_code=404)
    db.delete(source)
    db.commit()
    return {"ok": True}


@router.get("/{source_id}/events")
async def source_events(source_id: str, db: DbSession, user: CurrentUser):
    import asyncio

    from app.core.database import SessionLocal

    source = db.get(Source, source_id)
    if source is None or source.org_id != user.org_id:
        raise HTTPException(status_code=404)

    async def gen():
        pct = 10
        while True:
            with SessionLocal() as poll_db:
                s = poll_db.get(Source, source_id)
                if s is None:
                    break
                if s.status == "indexed":
                    yield f"data: {json.dumps({'event': 'ingest_done', 'source_id': source_id, 'pct': 100})}\n\n"
                    break
                if s.status == "error":
                    yield f"data: {json.dumps({'event': 'ingest_error', 'source_id': source_id, 'reason': s.error_message})}\n\n"
                    break
                yield f"data: {json.dumps({'event': 'ingest_progress', 'source_id': source_id, 'pct': pct, 'step': s.status})}\n\n"
                pct = min(pct + 15, 90)
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")
