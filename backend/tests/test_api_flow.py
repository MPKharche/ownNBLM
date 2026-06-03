"""Integration smoke tests — requires OPENROUTER_API_KEY in .env."""

import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY required",
)

DEV_USER = "00000000-0000-4000-8000-000000000001"
client = TestClient(app)
headers = {"X-Dev-User-Id": DEV_USER}


def test_list_sources():
    r = client.get("/api/v1/sources", headers=headers)
    assert r.status_code == 200


def test_usage_dashboard():
    r = client.get("/api/v1/usage/dashboard", headers=headers)
    assert r.status_code == 200
    assert "queries_used" in r.json()


def test_create_session_and_chat():
    r = client.post(
        "/api/v1/sessions",
        headers=headers,
        json={"title": "Test", "source_ids": []},
    )
    assert r.status_code == 200
    sid = r.json()["id"]
    r = client.post(
        f"/api/v1/sessions/{sid}/chat",
        headers=headers,
        json={"message": "What is in the sample document?"},
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
