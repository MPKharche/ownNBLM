"""Public API v1 — API-key authenticated subset of workspace operations."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import get_settings
from fastapi import Depends

from app.core.deps import AuthContext, DbSession, get_auth_context, require_scope
from app.models.session import Session
from app.models.source import Source
from app.services.citation_export import export_bibtex, export_ris, export_zotero
from app.services.ingest_runner import start_ingest_background
from app.services.storage import get_storage

router = APIRouter()


class PublicSessionCreate(BaseModel):
    title: str = "API session"
    source_ids: list[str] = []


class PublicChatRequest(BaseModel):
    message: str


@router.get("/sources")
def public_list_sources(
    db: DbSession,
    ctx: AuthContext = Depends(require_scope("read")),
):
    rows = db.execute(
        select(Source).where(Source.org_id == ctx.org_id).order_by(Source.created_at.desc())
    ).scalars()
    return [
        {"id": s.id, "name": s.name, "status": s.status, "byte_size": s.byte_size}
        for s in rows
    ]


@router.post("/sources", status_code=202)
async def public_upload(
    db: DbSession,
    ctx: AuthContext = Depends(require_scope("ingest")),
    file: UploadFile = File(...),
):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="API key owner required for ingest")
    settings = get_settings()
    data = await file.read()
    if len(data) > settings.max_file_size_bytes:
        raise HTTPException(status_code=413, detail="File too large")
    storage = get_storage()
    key = storage.save(ctx.org_id, file.filename or "upload.bin", data)
    source = Source(
        id=str(uuid.uuid4()),
        org_id=ctx.org_id,
        name=file.filename or "upload.bin",
        source_type="upload",
        file_path=key,
        status="pending",
        byte_size=len(data),
        uploaded_by_user_id=ctx.user.id,
        is_private=False,
    )
    db.add(source)
    db.commit()
    start_ingest_background(source.id)
    return {"id": source.id, "status": source.status}


@router.get("/sessions")
def public_sessions(db: DbSession, ctx: AuthContext = Depends(require_scope("read"))):
    rows = db.execute(select(Session).where(Session.org_id == ctx.org_id)).scalars()
    return [
        {
            "id": s.id,
            "title": s.title,
            "source_ids": json.loads(s.source_ids_json or "[]"),
        }
        for s in rows
    ]


@router.post("/sessions")
def public_create_session(
    body: PublicSessionCreate,
    db: DbSession,
    ctx: AuthContext = Depends(require_scope("read")),
):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="User context required")
    session = Session(
        id=str(uuid.uuid4()),
        org_id=ctx.org_id,
        user_id=ctx.user.id,
        title=body.title,
        source_ids_json=json.dumps(body.source_ids),
    )
    db.add(session)
    db.commit()
    return {"id": session.id, "title": session.title}


@router.get("/sessions/{session_id}/export")
def public_export(
    session_id: str,
    format: str,
    db: DbSession,
    ctx: AuthContext = Depends(require_scope("read")),
):
    session = db.get(Session, session_id)
    if session is None or session.org_id != ctx.org_id:
        raise HTTPException(status_code=404)
    fmt = format.lower()
    if fmt == "bibtex":
        content = export_bibtex(db, session)
        media = "application/x-bibtex"
    elif fmt in ("ris", "zotero"):
        content = export_zotero(db, session) if fmt == "zotero" else export_ris(db, session)
        media = "application/x-research-info-systems"
    else:
        raise HTTPException(status_code=400, detail="format must be bibtex, ris, or zotero")
    from fastapi.responses import PlainTextResponse

    return PlainTextResponse(content, media_type=media)
