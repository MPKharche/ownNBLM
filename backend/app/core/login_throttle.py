"""Brute-force protection for password login (per IP + email)."""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import HTTPException, Request
from slowapi.util import get_remote_address

from app.core.config import get_settings

_failures: dict[str, list[float]] = defaultdict(list)
_lockouts: dict[str, float] = {}


def _settings():
    s = get_settings()
    return s.auth_login_max_failures, s.auth_login_lockout_minutes * 60


def _keys(request: Request, email: str) -> tuple[str, str]:
    ip = get_remote_address(request)
    norm = email.strip().lower()
    return f"ip:{ip}", f"email:{norm}"


def assert_login_allowed(request: Request, email: str) -> None:
    max_failures, lockout_sec = _settings()
    now = time.time()
    for key in _keys(request, email):
        until = _lockouts.get(key)
        if until and now < until:
            raise HTTPException(
                status_code=429,
                detail="Too many failed sign-in attempts. Try again later.",
            )
        if until and now >= until:
            _lockouts.pop(key, None)
            _failures.pop(key, None)


def record_failed_login(request: Request, email: str) -> None:
    max_failures, lockout_sec = _settings()
    now = time.time()
    for key in _keys(request, email):
        bucket = _failures[key]
        bucket[:] = [t for t in bucket if now - t < lockout_sec]
        bucket.append(now)
        if len(bucket) >= max_failures:
            _lockouts[key] = now + lockout_sec


def clear_failed_login(request: Request, email: str) -> None:
    for key in _keys(request, email):
        _failures.pop(key, None)
        _lockouts.pop(key, None)
