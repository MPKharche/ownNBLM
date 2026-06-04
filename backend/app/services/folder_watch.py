"""Watchdog-based folder ingest for corpus sync."""

from __future__ import annotations

import hashlib
import threading
import uuid
from pathlib import Path

import structlog
from sqlalchemy import select
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.source import Source
from app.models.watched_folder import WatchedFolder
from app.services.ingest_runner import start_ingest_background
from app.services.storage import get_storage

logger = structlog.get_logger()

ALLOWED_SUFFIXES = {".pdf", ".txt", ".md", ".docx"}
_observers: list[Observer] = []
_lock = threading.Lock()


class _IngestHandler(FileSystemEventHandler):
    def __init__(self, org_id: str, watch_id: str, base_path: Path):
        self.org_id = org_id
        self.watch_id = watch_id
        self.base_path = base_path.resolve()

    def on_created(self, event):
        if event.is_directory:
            return
        self._maybe_ingest(event.src_path)

    def on_modified(self, event):
        if event.is_directory:
            return
        self._maybe_ingest(event.src_path)

    def _maybe_ingest(self, src_path: str) -> None:
        path = Path(src_path)
        if path.suffix.lower() not in ALLOWED_SUFFIXES:
            return
        if not path.is_file():
            return
        try:
            data = path.read_bytes()
        except OSError as exc:
            logger.warning("watch_read_failed", path=str(path), error=str(exc))
            return
        settings = get_settings()
        if len(data) > settings.max_file_size_bytes:
            return
        digest = hashlib.sha256(data).hexdigest()[:16]
        with SessionLocal() as db:
            existing = db.execute(
                select(Source).where(
                    Source.org_id == self.org_id,
                    Source.name == path.name,
                    Source.source_type == "watch",
                )
            ).scalar_one_or_none()
            if existing and existing.status in ("pending", "indexing"):
                return
            storage = get_storage()
            key = storage.save(self.org_id, path.name, data)
            file_path = (
                str(Path(settings.storage_local_path) / key)
                if settings.storage_backend == "local"
                else key
            )
            source = Source(
                id=str(uuid.uuid4()),
                org_id=self.org_id,
                name=path.name,
                source_type="watch",
                file_path=file_path,
                status="pending",
                byte_size=len(data),
                is_private=False,
            )
            db.add(source)
            db.commit()
            start_ingest_background(source.id)
            logger.info("watch_ingest_queued", source_id=source.id, path=str(path))


def register_watch(org_id: str, folder_path: str, created_by: str | None) -> WatchedFolder:
    path = Path(folder_path).expanduser().resolve()
    if not path.is_dir():
        raise ValueError("Path is not a directory")
    with SessionLocal() as db:
        row = WatchedFolder(
            id=str(uuid.uuid4()),
            org_id=org_id,
            path=str(path),
            enabled=True,
            created_by=created_by,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    _attach_observer(row)
    return row


def _attach_observer(row: WatchedFolder) -> None:
    if not row.enabled:
        return
    handler = _IngestHandler(row.org_id, row.id, Path(row.path))
    observer = Observer()
    observer.schedule(handler, row.path, recursive=True)
    observer.start()
    with _lock:
        _observers.append(observer)
    logger.info("watchdog_started", path=row.path, org_id=row.org_id)


def stop_all_watchers() -> None:
    with _lock:
        for obs in _observers:
            obs.stop()
            obs.join(timeout=2)
        _observers.clear()


def reload_watches_from_db() -> None:
    if not get_settings().folder_watch_enabled:
        return
    with SessionLocal() as db:
        rows = db.execute(
            select(WatchedFolder).where(WatchedFolder.enabled.is_(True))
        ).scalars()
        for row in rows:
            if Path(row.path).is_dir():
                try:
                    _attach_observer(row)
                except Exception as exc:
                    logger.warning("watch_start_failed", path=row.path, error=str(exc))


def list_watches(db, org_id: str) -> list[WatchedFolder]:
    return list(
        db.execute(
            select(WatchedFolder)
            .where(WatchedFolder.org_id == org_id)
            .order_by(WatchedFolder.created_at.desc())
        ).scalars()
    )


def remove_watch(db, org_id: str, watch_id: str) -> None:
    row = db.get(WatchedFolder, watch_id)
    if row is None or row.org_id != org_id:
        raise ValueError("Watch not found")
    row.enabled = False
    db.delete(row)
    db.commit()
