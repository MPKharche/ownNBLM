"""Load repo-root .env before tests."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
# Integration tests call live OpenRouter — disable burn cap unless test opts in.
os.environ.setdefault("LLM_BUDGET_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "development")

# Avoid flaky 429s when the phase4 suite exercises many auth endpoints in one minute.
from app.core import rate_limit as _rate_limit  # noqa: E402

_rate_limit.AUTH_LIMIT = 500
_rate_limit._hits.clear()


def _repair_stamped_006_schema(engine) -> None:
    """Fix DBs stamped at 006 before org payment columns were applied."""
    from sqlalchemy import inspect, text  # noqa: PLC0415

    tables = set(inspect(engine).get_table_names())
    if "orgs" not in tables:
        return
    org_cols = {c["name"] for c in inspect(engine).get_columns("orgs")}
    stmts = []
    if "payment_provider" not in org_cols:
        stmts.append("ALTER TABLE orgs ADD COLUMN payment_provider VARCHAR(32)")
    if "razorpay_customer_id" not in org_cols:
        stmts.append("ALTER TABLE orgs ADD COLUMN razorpay_customer_id VARCHAR(64)")
    if "payment_subscription_id" not in org_cols:
        stmts.append("ALTER TABLE orgs ADD COLUMN payment_subscription_id VARCHAR(64)")
    if not stmts:
        return
    with engine.begin() as conn:
        for sql in stmts:
            conn.execute(text(sql))


def pytest_sessionstart(session):
    """Ensure SQLite test DB schema includes latest migrations."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect, text

    from app.core.database import engine

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    tables = set(inspect(engine).get_table_names())
    if not tables:
        command.upgrade(cfg, "head")
        return
    org_cols = {c["name"] for c in inspect(engine).get_columns("orgs")} if "orgs" in tables else set()
    if "payment_provider" not in org_cols:
        _repair_stamped_006_schema(engine)
    tables = set(inspect(engine).get_table_names())
    if "watched_folders" not in tables and "alembic_version" in tables:
        with engine.begin() as conn:
            conn.execute(text("UPDATE alembic_version SET version_num = '005'"))
        command.upgrade(cfg, "head")
    elif "watched_folders" not in tables:
        command.upgrade(cfg, "head")

    _reset_dev_org_query_usage()


def _reset_dev_org_query_usage() -> None:
    """Avoid flaky 402 when integration tests share one SQLite DB."""
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.core.database import SessionLocal
    from app.models.usage import WorkspaceUsage

    dev_org = "00000000-0000-4000-8000-000000000010"
    period = f"{datetime.now(UTC).year}-{datetime.now(UTC).month:02d}"
    with SessionLocal() as db:
        row = db.execute(
            select(WorkspaceUsage).where(
                WorkspaceUsage.org_id == dev_org,
                WorkspaceUsage.period == period,
            )
        ).scalar_one_or_none()
        if row is not None and row.queries_used >= row.query_limit:
            row.queries_used = 0
            db.commit()
