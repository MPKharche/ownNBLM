"""Run ingest in a background thread with SSE progress events."""

from __future__ import annotations

import json
import threading

import structlog

from app.core.database import SessionLocal
from app.core.events import publish
from app.models.document import Document
from app.models.source import Source
from app.services.ingest import run_ingest

logger = structlog.get_logger()


def _ingest_job(source_id: str) -> None:
    channel = f"ingest:{source_id}"

    def progress_cb(pct: int, step: str) -> None:
        publish(
            channel,
            {
                "event": "ingest_progress",
                "source_id": source_id,
                "pct": pct,
                "step": step,
            },
        )

    with SessionLocal() as db:
        try:
            run_ingest(db, source_id, progress_cb=progress_cb)
            chunks = 0
            doc = db.query(Document).filter(Document.source_id == source_id).first()
            if doc and doc.metadata_json:
                try:
                    chunks = json.loads(doc.metadata_json).get("chunk_count", 0)
                except json.JSONDecodeError:
                    pass
            publish(
                channel,
                {
                    "event": "ingest_done",
                    "source_id": source_id,
                    "pct": 100,
                    "chunks": chunks,
                },
            )
        except Exception as e:
            logger.exception("ingest_failed", source_id=source_id)
            reason = str(e)
            with SessionLocal() as err_db:
                src = err_db.get(Source, source_id)
                if src:
                    if src.error_message:
                        reason = src.error_message
                    else:
                        src.status = "error"
                        src.error_message = reason[:500]
                        err_db.commit()
            publish(
                channel,
                {"event": "ingest_error", "source_id": source_id, "reason": reason},
            )


def start_ingest_background(source_id: str) -> None:
    threading.Thread(target=_ingest_job, args=(source_id,), daemon=True).start()
