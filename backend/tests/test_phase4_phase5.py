"""Phase 4/5 feature tests — auth extensions, admin, API keys, annotations."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal, Base, engine
from app.seed import run_seed

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _db():
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect, text

    from app.core.database import engine

    cfg = Config("alembic.ini")
    tables = set(inspect(engine).get_table_names())
    if "oauth_accounts" in tables:
        command.stamp(cfg, "head")
    elif "orgs" in tables:
        org_cols = {c["name"] for c in inspect(engine).get_columns("orgs")}
        command.stamp(cfg, "004" if "stripe_customer_id" in org_cols else "003")
        command.upgrade(cfg, "head")
    else:
        command.upgrade(cfg, "head")
    run_seed()
    with SessionLocal() as db:
        from app.models.user import User
        from app.services.auth_service import hash_password

        user = db.get(User, "00000000-0000-4000-8000-000000000001")
        if user:
            user.password_hash = hash_password("admin123")
            db.commit()
    yield


def _headers() -> dict:
    return {"X-Dev-User-Id": "00000000-0000-4000-8000-000000000001"}


def _login() -> dict:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ownnblm.local", "password": "admin123"},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_refresh_token():
    data = _login()
    assert "refresh_token" in data
    r = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": data["refresh_token"]},
    )
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_magic_link_dev():
    r = client.post("/api/v1/auth/magic-link", json={"email": "magic.user@example.com"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("sent") is True
    if url := body.get("magic_link_url"):
        token = url.split("magic_token=")[-1]
        v = client.post("/api/v1/auth/magic-link/verify", json={"token": token})
        assert v.status_code == 200


def test_admin_members_and_audit():
    h = _headers()
    r = client.get("/api/v1/admin/members", headers=h)
    assert r.status_code == 200
    assert len(r.json()) >= 1
    r = client.get("/api/v1/admin/audit", headers=h)
    assert r.status_code == 200


def test_workspace_invite_flow():
    import uuid

    email = f"teammate-{uuid.uuid4().hex[:8]}@example.com"
    h = _headers()
    r = client.post(
        "/api/v1/admin/invites",
        headers=h,
        json={"email": email, "role": "member"},
    )
    assert r.status_code == 200
    invite_url = r.json()["invite_url"]
    invite_token = invite_url.rstrip("/").split("/")[-1]
    acc = client.post(
        "/api/v1/auth/invites/accept",
        json={"token": invite_token, "password": "teampass123", "display_name": "Teammate"},
    )
    assert acc.status_code == 200


def test_api_key_and_public_read():
    h = _headers()
    r = client.post(
        "/api/v1/admin/api-keys",
        headers=h,
        json={"name": "test-key", "scope": "read_only"},
    )
    assert r.status_code == 200
    api_key = r.json()["api_key"]
    pub = client.get("/api/v1/public/sources", headers={"X-API-Key": api_key})
    assert pub.status_code == 200


def test_session_export_bibtex():
    h = _headers()
    sessions = client.get("/api/v1/sessions", headers=h).json()
    if not sessions:
        created = client.post(
            "/api/v1/sessions",
            headers=h,
            json={"title": "Export test", "source_ids": []},
        )
        sid = created.json()["id"]
    else:
        sid = sessions[0]["id"]
    r = client.get(f"/api/v1/sessions/{sid}/export?format=bibtex", headers=h)
    assert r.status_code == 200
