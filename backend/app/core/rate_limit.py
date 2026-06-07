"""Rate limits — per IP (auth) and per workspace (chat, ingest)."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import Settings, get_settings

DEV_USER_HEADER = "x-dev-user-id"
from app.core.deps import AuthContext, get_auth_context
from app.models.user import User

limiter = Limiter(key_func=get_remote_address)

AUTH_LIMIT = 5
CHAT_LIMIT = 60
INGEST_LIMIT = 10
REFRESH_LIMIT = 20
GLOBAL_API_LIMIT = 120
_WINDOW_SEC = 60

_hits: dict[str, list[float]] = defaultdict(list)


def apply_rate_limit_settings(settings: Settings | None = None) -> None:
    global AUTH_LIMIT, CHAT_LIMIT, INGEST_LIMIT, REFRESH_LIMIT, GLOBAL_API_LIMIT
    s = settings or get_settings()
    AUTH_LIMIT = s.auth_rate_limit_per_minute
    CHAT_LIMIT = s.chat_rate_limit_per_minute
    INGEST_LIMIT = s.ingest_rate_limit_per_minute
    REFRESH_LIMIT = s.auth_refresh_rate_limit_per_minute
    GLOBAL_API_LIMIT = s.api_global_rate_limit_per_minute


def workspace_rate_key(request: Request, user: User | None = None) -> str:
    ip = get_remote_address(request)
    if user:
        return f"ws:{user.org_id}:{ip}"
    dev = request.headers.get(DEV_USER_HEADER) or request.query_params.get("x-dev-user-id")
    if dev:
        return f"ws:{dev}:{ip}"
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return f"tok:{auth[7:16]}:{ip}"
    return f"ip:{ip}"


def _enforce(key: str, max_calls: int, *, window_sec: int | None = None) -> None:
    window = window_sec if window_sec is not None else _WINDOW_SEC
    now = time.time()
    bucket = _hits[key]
    bucket[:] = [t for t in bucket if now - t < window]
    if len(bucket) >= max_calls:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(window)},
        )
    bucket.append(now)


def enforce_auth_rate(request: Request) -> None:
    _enforce(f"auth:{get_remote_address(request)}", AUTH_LIMIT)


def enforce_refresh_rate(request: Request) -> None:
    _enforce(f"refresh:{get_remote_address(request)}", REFRESH_LIMIT)


def enforce_magic_verify_rate(request: Request) -> None:
    _enforce(f"magic_verify:{get_remote_address(request)}", AUTH_LIMIT)


def enforce_global_api_rate(request: Request) -> None:
    if not request.url.path.startswith("/api/"):
        return
    if request.url.path in ("/health", "/metrics"):
        return
    _enforce(f"global:{get_remote_address(request)}", GLOBAL_API_LIMIT)


def enforce_workspace_chat_rate(
    request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> None:
    if ctx.user is None:
        return
    _enforce(workspace_rate_key(request, ctx.user), CHAT_LIMIT)


def enforce_workspace_ingest_rate(
    request: Request, ctx: AuthContext = Depends(get_auth_context)
) -> None:
    if ctx.user is None:
        return
    _enforce(workspace_rate_key(request, ctx.user), INGEST_LIMIT)


AuthRateLimit = Annotated[None, Depends(enforce_auth_rate)]
RefreshRateLimit = Annotated[None, Depends(enforce_refresh_rate)]
MagicVerifyRateLimit = Annotated[None, Depends(enforce_magic_verify_rate)]
ChatRateLimit = Annotated[None, Depends(enforce_workspace_chat_rate)]
IngestRateLimit = Annotated[None, Depends(enforce_workspace_ingest_rate)]
