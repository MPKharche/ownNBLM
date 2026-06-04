"""Rate limits — per IP (auth) and per workspace (chat, ingest)."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.auth import DEV_USER_HEADER
from app.core.deps import AuthContext, get_auth_context

# slowapi on app (health / global); route limits use dependency below (APIRouter-safe)
limiter = Limiter(key_func=get_remote_address)

AUTH_LIMIT = 5
CHAT_LIMIT = 60
INGEST_LIMIT = 10
_WINDOW_SEC = 60

_hits: dict[str, list[float]] = defaultdict(list)


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


def _enforce(key: str, max_calls: int) -> None:
    now = time.time()
    bucket = _hits[key]
    bucket[:] = [t for t in bucket if now - t < _WINDOW_SEC]
    if len(bucket) >= max_calls:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    bucket.append(now)


def enforce_auth_rate(request: Request) -> None:
    _enforce(f"auth:{get_remote_address(request)}", AUTH_LIMIT)


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
ChatRateLimit = Annotated[None, Depends(enforce_workspace_chat_rate)]
IngestRateLimit = Annotated[None, Depends(enforce_workspace_ingest_rate)]
