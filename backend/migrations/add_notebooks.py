"""
Migration: add notebooks + notebook_sources tables, add notebook_id to sessions.

Run manually (SQLite / dev):
    python backend/migrations/add_notebooks.py

Or for Postgres in prod, use Alembic:
    alembic revision --autogenerate -m "add_notebooks"
    alembic upgrade head
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import engine, Base
from app.models import (  # noqa: F401 — ensure all tables registered
    Notebook,
    Source,
    Session,
    Org,
    User,
)
from sqlalchemy import text, inspect


def run():
    inspector = inspect(engine)
    existing = inspector.get_table_names()

    with engine.begin() as conn:
        # 1. Create notebooks table
        if "notebooks" not in existing:
            conn.execute(text("""
                CREATE TABLE notebooks (
                    id VARCHAR(36) PRIMARY KEY,
                    org_id VARCHAR(36) NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL DEFAULT 'Untitled notebook',
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """))
            conn.execute(text("CREATE INDEX ix_notebooks_org_id ON notebooks(org_id)"))
            conn.execute(text("CREATE INDEX ix_notebooks_user_id ON notebooks(user_id)"))
            print("[OK] Created table: notebooks")
        else:
            print("[--] Skipped: notebooks (already exists)")

        # 2. Create notebook_sources join table
        if "notebook_sources" not in existing:
            conn.execute(text("""
                CREATE TABLE notebook_sources (
                    notebook_id VARCHAR(36) NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
                    source_id VARCHAR(36) NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    PRIMARY KEY (notebook_id, source_id)
                )
            """))
            print("[OK] Created table: notebook_sources")
        else:
            print("[--] Skipped: notebook_sources (already exists)")

        # 3. Add notebook_id column to sessions (nullable FK)
        session_cols = [c["name"] for c in inspector.get_columns("sessions")]
        if "notebook_id" not in session_cols:
            conn.execute(text(
                "ALTER TABLE sessions ADD COLUMN notebook_id VARCHAR(36) REFERENCES notebooks(id) ON DELETE SET NULL"
            ))
            conn.execute(text("CREATE INDEX ix_sessions_notebook_id ON sessions(notebook_id)"))
            print("[OK] Added column: sessions.notebook_id")
        else:
            print("[--] Skipped: sessions.notebook_id (already exists)")

    print("\nMigration complete.")


if __name__ == "__main__":
    run()
