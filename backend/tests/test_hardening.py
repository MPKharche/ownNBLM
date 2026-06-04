"""Hardening: Razorpay webhook, folder watch API, public export."""

from __future__ import annotations

import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
DEV = {"X-Dev-User-Id": "00000000-0000-4000-8000-000000000001"}


def test_billing_provider_endpoint():
    r = client.get("/api/v1/billing/provider")
    assert r.status_code == 200
    assert "provider" in r.json()


def test_razorpay_webhook_rejects_bad_sig_or_unconfigured():
    body = json.dumps({"event": "payment_link.paid", "payload": {}}).encode()
    r = client.post(
        "/api/v1/billing/webhooks/razorpay",
        content=body,
        headers={"X-Razorpay-Signature": "bad", "Content-Type": "application/json"},
    )
    assert r.status_code in (400, 503)


def test_watch_folders_list():
    r = client.get("/api/v1/watch", headers=DEV)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_api_reference_redirect():
    r = client.get("/reference", follow_redirects=False)
    assert r.status_code in (307, 302)
    assert "/redoc" in r.headers.get("location", "")
