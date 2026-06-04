"""Source delete and retry."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
DEV = {"X-Dev-User-Id": "00000000-0000-4000-8000-000000000001"}


def test_list_sources():
    r = client.get("/api/v1/sources", headers=DEV)
    assert r.status_code == 200


def test_admin_corpus_reset_requeue_only():
    r = client.post(
        "/api/v1/admin/corpus/reset",
        headers=DEV,
        json={"delete_all": False, "requeue_stuck": True},
    )
    assert r.status_code == 200
    assert "requeued" in r.json()
