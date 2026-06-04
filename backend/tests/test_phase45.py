"""Phase 4/5 — admin, public API, citations, team annotations (no OpenRouter)."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.api_keys import API_KEY_PREFIX, create_api_key

DEV_USER = "00000000-0000-4000-8000-000000000001"
client = TestClient(app)
headers = {"X-Dev-User-Id": DEV_USER}


def test_admin_members_and_audit():
    r = client.get("/api/v1/admin/members", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.get("/api/v1/admin/audit", headers=headers)
    assert r.status_code == 200


def test_create_api_key_and_public_list():
    r = client.post(
        "/api/v1/admin/api-keys",
        headers=headers,
        json={"name": "test-key", "scope": "read_only"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["api_key"].startswith(API_KEY_PREFIX)
    raw = data["api_key"]

    r = client.get("/api/v1/public/sources", headers={"X-API-Key": raw})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_webhook_crud():
    r = client.post(
        "/api/v1/admin/webhooks",
        headers=headers,
        json={"url": "https://example.com/hook", "events": ["source.indexed"]},
    )
    assert r.status_code == 200
    wid = r.json()["id"]
    r = client.get("/api/v1/admin/webhooks", headers=headers)
    assert any(w["id"] == wid for w in r.json())


def test_citation_export_empty_session():
    r = client.post(
        "/api/v1/sessions",
        headers=headers,
        json={"title": "Export test", "source_ids": []},
    )
    sid = r.json()["id"]
    r = client.get(f"/api/v1/sessions/{sid}/export?format=bibtex", headers=headers)
    assert r.status_code == 200
    assert "No citations" in r.text or "@misc" in r.text


def test_team_annotation_on_session():
    r = client.post(
        "/api/v1/sessions",
        headers=headers,
        json={"title": "Annot", "source_ids": []},
    )
    sid = r.json()["id"]
    r = client.post(
        f"/api/v1/team/sessions/{sid}/annotations",
        headers=headers,
        json={"content": "Team note"},
    )
    assert r.status_code == 200
    r = client.get(f"/api/v1/team/sessions/{sid}/annotations", headers=headers)
    assert len(r.json()) >= 1


def test_share_link_with_annotations():
    r = client.post(
        "/api/v1/sessions",
        headers=headers,
        json={"title": "Share annot", "source_ids": []},
    )
    sid = r.json()["id"]
    r = client.post(f"/api/v1/sessions/{sid}/share", headers=headers)
    token = r.json()["token"]
    r = client.post(
        f"/api/v1/team/share/{token}/annotations",
        headers=headers,
        json={"content": "On shared view"},
    )
    assert r.status_code == 200
    r = client.get(f"/api/v1/team/share/{token}/annotations")
    assert len(r.json()) >= 1


def test_source_private_patch():
    r = client.get("/api/v1/sources", headers=headers)
    sources = r.json()
    if not sources:
        pytest.skip("No sources to patch")
    sid = sources[0]["id"]
    r = client.patch(
        f"/api/v1/sources/{sid}",
        headers=headers,
        json={"is_private": True},
    )
    assert r.status_code == 200
    assert r.json()["is_private"] is True


def test_gdpr_export():
    r = client.get("/api/v1/gdpr/export", headers=headers)
    assert r.status_code == 200
    payload = json.loads(r.content)
    assert "org" in payload
    assert "members" in payload


def test_openapi_docs():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    assert "/api/v1/admin/members" in spec.get("paths", {})
    assert "/api/v1/public/sources" in spec.get("paths", {})


def test_public_api_scope_blocks_ingest_with_read_only():
    from app.core.database import SessionLocal
    from app.models.user import User

    with SessionLocal() as db:
        user = db.get(User, DEV_USER)
        assert user is not None
        _, raw = create_api_key(
            db,
            org_id=user.org_id,
            name="ro-key",
            scope="read_only",
            created_by=user.id,
        )
    r = client.post(
        "/api/v1/public/sources",
        headers={"X-API-Key": raw},
        files={"file": ("t.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 403
