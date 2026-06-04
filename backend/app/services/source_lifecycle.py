"""Source delete, retry, and recovery for stuck ingest jobs."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import structlog
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.chunk import Chunk
from app.models.document import Document
from app.models.session import Session as ChatSession
from app.models.source import Source
from app.models.watched_folder import WatchedFolder
from app.services.credits import get_or_create_usage
from app.services.ingest_runner import start_ingest_background
from app.services.storage import get_storage

logger = structlog.get_logger()

STUCK_STATUSES = frozenset({"pending", "processing"})
STUCK_AFTER_MINUTES = 3


def _unlink_source_file(source: Source) -> None:
    if not source.file_path:
        return
    path = Path(source.file_path)
    if path.is_file():
        path.unlink(missing_ok=True)
        return
    settings = get_settings()
    base = Path(settings.storage_local_path).resolve()
    try:
        key = str(path.resolve().relative_to(base)).replace("\\", "/")
        get_storage().delete(key)
    except ValueError:
        pass


def delete_source_completely(db: Session, source: Source) -> None:
    """Remove source, documents/chunks, file on disk, and storage quota."""
    org_id = source.org_id
    byte_size = source.byte_size or 0
    docs = db.execute(select(Document).where(Document.source_id == source.id)).scalars()
    for doc in docs:
        db.execute(delete(Chunk).where(Chunk.document_id == doc.id))
    _unlink_source_file(source)
    db.delete(source)
    usage = get_or_create_usage(db, org_id)
    usage.storage_bytes = max(0, usage.storage_bytes - byte_size)
    db.flush()
    prune_session_source_ids(db, org_id)


def prune_session_source_ids(db: Session, org_id: str) -> None:
    valid = set(db.scalars(select(Source.id).where(Source.org_id == org_id)).all())
    for sess in db.execute(select(ChatSession).where(ChatSession.org_id == org_id)).scalars():
        if not sess.source_ids_json:
            continue
        try:
            ids = json.loads(sess.source_ids_json)
        except json.JSONDecodeError:
            continue
        if not isinstance(ids, list):
            continue
        new_ids = [sid for sid in ids if sid in valid]
        if new_ids != ids:
            sess.source_ids_json = json.dumps(new_ids)


def retry_source_ingest(db: Session, source: Source) -> None:
    if not source.file_path or not Path(source.file_path).is_file():
        source.status = "error"
        source.error_message = "File missing on server — delete and re-upload"
        db.commit()
        raise ValueError(source.error_message)
    source.status = "pending"
    source.error_message = None
    db.commit()
    start_ingest_background(source.id)


def recover_stuck_sources(
    db: Session, org_id: str | None = None, *, force: bool = False
) -> int:
    """Re-queue ingest jobs left in pending/processing (e.g. after API restart)."""
    cutoff = datetime.now(UTC) - timedelta(minutes=STUCK_AFTER_MINUTES)
    q = select(Source).where(Source.status.in_(STUCK_STATUSES))
    if org_id:
        q = q.where(Source.org_id == org_id)
    rows = list(db.scalars(q).all())
    recovered = 0
    for source in rows:
        updated = source.updated_at
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=UTC)
        if not force and updated > cutoff:
            continue
        try:
            retry_source_ingest(db, source)
            recovered += 1
        except ValueError:
            logger.warning("recover_skip", source_id=source.id, name=source.name)
    return recovered


def reset_org_corpus(
    db: Session,
    org_id: str,
    *,
    delete_all: bool = False,
    requeue_stuck: bool = True,
) -> dict:
    """Owner maintenance: wipe corpus or fix stuck rows."""
    deleted = 0
    if delete_all:
        rows = list(db.execute(select(Source).where(Source.org_id == org_id)).scalars())
        for source in rows:
            delete_source_completely(db, source)
            deleted += 1
        db.execute(delete(WatchedFolder).where(WatchedFolder.org_id == org_id))
        usage = get_or_create_usage(db, org_id)
        usage.storage_bytes = 0
        db.flush()
    requeued = recover_stuck_sources(db, org_id) if requeue_stuck else 0
    return {"deleted": deleted, "requeued": requeued}
