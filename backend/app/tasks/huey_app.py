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
    from app.services.ingest_runner import _ingest_job

    _ingest_job(source_id)


@huey.task()
def ping_task() -> str:
    return "pong"
