"""Huey task queue — SQLite backend for Phase 1."""

from pathlib import Path

from huey import SqliteHuey

from app.core.config import get_settings

settings = get_settings()
_huey_dir = Path("./data")
_huey_dir.mkdir(parents=True, exist_ok=True)
huey = SqliteHuey(filename=str(_huey_dir / "huey.db"))


@huey.task(retries=3, retry_delay=2)
def ingest_source_task(source_id: str) -> None:
    from app.core.database import SessionLocal
    from app.core.events import publish
    from app.services.ingest import run_ingest

    def progress_cb(pct: int, step: str) -> None:
        publish(
            f"ingest:{source_id}",
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
            publish(
                f"ingest:{source_id}",
                {"event": "ingest_done", "source_id": source_id},
            )
        except Exception as e:
            publish(
                f"ingest:{source_id}",
                {"event": "ingest_error", "source_id": source_id, "reason": str(e)},
            )
            raise


@huey.task()
def ping_task() -> str:
    return "pong"
