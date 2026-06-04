"""FastAPI dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.auth import DEV_USER_HEADER, DEFAULT_DEV_USER_ID, get_current_user as dev_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User
from app.services.api_keys import scope_allows, verify_api_key

bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    user: User | None
    api_key: ApiKey | None
    org_id: str
    auth_type: str  # jwt | api_key | dev

    @property
    def actor_id(self) -> str | None:
        if self.user:
            return self.user.id
        if self.api_key:
            return self.api_key.created_by
        return None


def get_auth_context(
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    x_dev_user_id: str | None = Header(default=None, alias=DEV_USER_HEADER),
    x_dev_user_id_query: str | None = Query(default=None, alias="x-dev-user-id"),
    access_token_query: str | None = Query(default=None, alias="access_token"),
) -> AuthContext:
    settings = get_settings()
    token = (creds.credentials if creds else None) or access_token_query
    if token:
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
            user_id = payload.get("sub")
            user = db.get(User, user_id) if user_id else None
            if user:
                return AuthContext(user=user, api_key=None, org_id=user.org_id, auth_type="jwt")
        except JWTError:
            pass

    if x_api_key:
        key_row = verify_api_key(db, x_api_key.strip())
        if key_row:
            user = db.get(User, key_row.created_by)
            return AuthContext(
                user=user,
                api_key=key_row,
                org_id=key_row.org_id,
                auth_type="api_key",
            )
        raise HTTPException(status_code=401, detail="Invalid API key")

    if settings.is_development:
        dev_id = x_dev_user_id or x_dev_user_id_query or DEFAULT_DEV_USER_ID
        user = dev_user(db, x_dev_user_id=dev_id)
        return AuthContext(user=user, api_key=None, org_id=user.org_id, auth_type="dev")

    raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user_dep(ctx: AuthContext = Depends(get_auth_context)) -> User:
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="User session required")
    return ctx.user


def require_scope(action: str):
    def _dep(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if ctx.api_key and not scope_allows(ctx.api_key.scope, action):
            raise HTTPException(status_code=403, detail=f"API key scope insufficient for {action}")
        return ctx

    return _dep


def require_owner(user: User = Depends(get_current_user_dep)) -> User:
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Owner role required")
    return user


CurrentUser = Annotated[User, Depends(get_current_user_dep)]
OwnerUser = Annotated[User, Depends(require_owner)]
DbSession = Annotated[Session, Depends(get_db)]
AuthCtx = Annotated[AuthContext, Depends(get_auth_context)]
