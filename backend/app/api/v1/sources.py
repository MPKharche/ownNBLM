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
from app.core.events import publish, subscribe
from app.core.rate_limit import IngestRateLimit
from app.models.source import Source
from app.services.credits import get_or_create_usage
from app.services.ingest_runner import start_ingest_background
from app.services.storage import get_storage

router = APIRouter()


class SourceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    status: str
    source_type: str
    byte_size: int | None
    error_message: str | None
    is_private: bool = False


class SourcePatch(BaseModel):
    is_private: bool | None = None


@router.get("", response_model=list[SourceOut])
def list_sources(db: DbSession, user: CurrentUser):
    from sqlalchemy import or_

    rows = db.execute(
        select(Source)
        .where(
            Source.org_id == user.org_id,
            or_(Source.is_private.is_(False), Source.uploaded_by_user_id == user.id),
        )
        .order_by(Source.created_at.desc())
    ).scalars()
    return list(rows)


@router.post("", response_model=SourceOut, status_code=202)
async def upload_source(
    db: DbSession,
    user: CurrentUser,
    _rate: IngestRateLimit,
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
        uploaded_by_user_id=user.id,
        is_private=False,
    )

    db.add(source)
    usage.storage_bytes += len(data)
    db.commit()
    db.refresh(source)

    publish(
        f"ingest:{source.id}",
        {
            "event": "ingest_progress",
            "source_id": source.id,
            "pct": 5,
            "step": "Queued",
        },
    )
    start_ingest_background(source.id)
    return source


@router.patch("/{source_id}", response_model=SourceOut)
def patch_source(source_id: str, body: SourcePatch, db: DbSession, user: CurrentUser):
    source = db.get(Source, source_id)
    if source is None or source.org_id != user.org_id:
        raise HTTPException(status_code=404)
    if body.is_private is not None:
        source.is_private = body.is_private
    db.commit()
    db.refresh(source)
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
    source = db.get(Source, source_id)
    if source is None or source.org_id != user.org_id:
        raise HTTPException(status_code=404)

    if source.status == "indexed":
        meta_chunks = 0
        from app.models.document import Document

        doc = db.query(Document).filter(Document.source_id == source_id).first()
        if doc and doc.metadata_json:
            try:
                meta_chunks = json.loads(doc.metadata_json).get("chunk_count", 0)
            except json.JSONDecodeError:
                pass

        async def done_only():
            yield f"data: {json.dumps({'event': 'ingest_done', 'source_id': source_id, 'pct': 100, 'chunks': meta_chunks})}\n\n"

        return StreamingResponse(done_only(), media_type="text/event-stream")

    if source.status == "error":

        async def err_only():
            yield f"data: {json.dumps({'event': 'ingest_error', 'source_id': source_id, 'reason': source.error_message or 'Unknown error'})}\n\n"

        return StreamingResponse(err_only(), media_type="text/event-stream")

    async def gen():
        async for event in subscribe(f"ingest:{source_id}"):
            if event.get("event") == "heartbeat":
                continue
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
