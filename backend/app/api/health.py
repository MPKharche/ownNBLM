"""GET /health — database, storage, OpenRouter, task queue."""

import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app import __version__
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services.llm_burn import burn_status
from app.tasks.huey_app import huey

router = APIRouter(tags=["health"])


def _check_database() -> str:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "error"


def _check_storage() -> str:
    settings = get_settings()
    if settings.storage_backend != "local":
        return "skipped"
    path = settings.storage_local_path
    try:
        from pathlib import Path

        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        return "ok" if p.is_dir() else "error"
    except Exception:
        return "error"


async def _check_llm_provider() -> str:
    settings = get_settings()
    provider = settings.llm_provider.lower()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider == "anthropic":
                if not settings.anthropic_api_key:
                    return "missing_key"
                resp = await client.post(
                    f"{settings.anthropic_base_url.rstrip('/')}/v1/messages",
                    headers={
                        "x-api-key": settings.anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-sonnet-4-20250514",
                        "max_tokens": 8,
                        "messages": [{"role": "user", "content": "ping"}],
                    },
                )
                return "ok" if resp.status_code == 200 else "error"

            if not settings.openrouter_api_key:
                return "missing_key"
            resp = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            )
            return "ok" if resp.status_code == 200 else "error"
    except Exception:
        return "error"


def _check_task_queue() -> str:
    try:
        # Huey SQLite backend is healthy if the broker storage exists
        _ = huey.storage
        return "ok"
    except Exception:
        return "error"


@router.get("/health")
async def health():
    settings = get_settings()
    db_status = _check_database()
    storage_status = _check_storage()
    llm_status = await _check_llm_provider()
    queue_status = _check_task_queue()
    burn = None
    if settings.llm_budget_enabled:
        with SessionLocal() as db:
            burn = burn_status(db, "*")

    checks = {
        "database": db_status,
        "storage": storage_status,
        "llm": llm_status,
        "openrouter": llm_status if settings.llm_provider.lower() != "anthropic" else "skipped",
        "task_queue": queue_status,
    }
    all_ok = all(v in ("ok", "skipped") for v in checks.values())
    return {
        "status": "ok" if all_ok else "degraded",
        "checks": checks,
        "llm_burn": burn,
        "version": __version__,
        "environment": settings.environment,
    }
