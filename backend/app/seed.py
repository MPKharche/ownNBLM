"""Idempotent dev seed — default org, admin user, sample PDF source stub.

Run: python -m app.seed (from backend/) or `make seed` from repo root.
Requires OPENROUTER_API_KEY in environment or .env.
"""

from __future__ import annotations

import json
import shutil
import sys
import uuid
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.models.document import Document
from app.models.org import Org
from app.models.source import Source
from app.models.user import User

# Deterministic IDs for idempotent re-runs
DEV_ORG_ID = "00000000-0000-4000-8000-000000000010"
DEV_USER_ID = "00000000-0000-4000-8000-000000000001"
DEV_ORG_SLUG = "my-research"
DEV_USER_EMAIL = "admin@ownnblm.local"
DEV_USER_PASSWORD = "admin123"  # dev only — rejected in production auth (Phase 3)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _fixtures_pdf() -> Path:
    return _repo_root() / "fixtures" / "sample_research_paper.pdf"


def _require_openrouter_key() -> None:
    settings = get_settings()
    if not settings.openrouter_api_key:
            print(
                "ERROR: OPENROUTER_API_KEY is not set.\n"
                "Copy .env.example to .env and add your key from https://openrouter.ai",
                file=sys.stderr,
            )
            sys.exit(1)


from app.services.auth_service import hash_password
from app.services.credits import get_or_create_usage
from app.services.ingest import run_ingest


def _ensure_sample_pdf() -> Path:
    pdf = _fixtures_pdf()
    if pdf.exists():
        return pdf
    pdf.parent.mkdir(parents=True, exist_ok=True)
    # Minimal valid PDF placeholder until full ingest pipeline indexes content
    pdf.write_bytes(
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
        b"xref\n0 4\ntrailer<</Root 1 0 R>>\nstartxref\n%%EOF\n"
    )
    return pdf


def run_seed() -> None:
    settings = get_settings()
    if settings.environment == "production":
        print("ERROR: seed must not run in production.", file=sys.stderr)
        sys.exit(1)

    _require_openrouter_key()
    Base.metadata.create_all(bind=engine)

    storage_dir = Path(settings.storage_local_path)
    storage_dir.mkdir(parents=True, exist_ok=True)

    sample_pdf = _ensure_sample_pdf()
    dest_pdf = storage_dir / "sample_research_paper.pdf"
    if not dest_pdf.exists() or dest_pdf.stat().st_size != sample_pdf.stat().st_size:
        shutil.copy2(sample_pdf, dest_pdf)

    with SessionLocal() as db:
        org = db.get(Org, DEV_ORG_ID)
        if org is None:
            org = Org(
                id=DEV_ORG_ID,
                name="My Research",
                slug=DEV_ORG_SLUG,
                tier="free",
            )
            db.add(org)
            print("Created org: My Research")
        else:
            print("Org already exists: My Research")

        user = db.get(User, DEV_USER_ID)
        if user is None:
            user = User(
                id=DEV_USER_ID,
                org_id=DEV_ORG_ID,
                email=DEV_USER_EMAIL,
                password_hash=hash_password(DEV_USER_PASSWORD),
                display_name="Admin",
                role="owner",
            )
            db.add(user)
            print(f"Created user: {DEV_USER_EMAIL} / {DEV_USER_PASSWORD}")
        else:
            print(f"User already exists: {DEV_USER_EMAIL}")

        existing_source = db.execute(
            select(Source).where(Source.org_id == DEV_ORG_ID, Source.name == sample_pdf.name)
        ).scalar_one_or_none()

        if existing_source is None:
            source_id = str(uuid.uuid4())
            source = Source(
                id=source_id,
                org_id=DEV_ORG_ID,
                name=sample_pdf.name,
                source_type="upload",
                file_path=str(dest_pdf),
                status="pending",
                byte_size=dest_pdf.stat().st_size,
            )
            db.add(source)
            print(f"Registered sample source: {sample_pdf.name}")
            db.commit()
            print("Running ingest (embeddings via OpenRouter)...")
            run_ingest(db, source_id)
            print("Sample source indexed.")
        else:
            print(f"Sample source already registered: {existing_source.name}")
            if existing_source.status != "indexed":
                print("Re-running ingest...")
                run_ingest(db, existing_source.id)

        get_or_create_usage(db, DEV_ORG_ID)
        db.commit()

    print("\nSeed complete.")
    print(f"  Dev header: {DEV_USER_HEADER}= {DEV_USER_ID}")
    print(f"  Login:      {DEV_USER_EMAIL} / {DEV_USER_PASSWORD}")
    print("  Open http://localhost:5173 after `make dev`")


DEV_USER_HEADER = "X-Dev-User-Id"


if __name__ == "__main__":
    run_seed()
