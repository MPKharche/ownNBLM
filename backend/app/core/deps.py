"""FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.auth import DEV_USER_HEADER, DEFAULT_DEV_USER_ID, get_current_user as dev_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


def get_current_user_dep(
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_dev_user_id: str | None = Header(default=None, alias=DEV_USER_HEADER),
    x_dev_user_id_query: str | None = Query(default=None, alias="x-dev-user-id"),
    access_token_query: str | None = Query(default=None, alias="access_token"),
) -> User:
    settings = get_settings()
    token = (creds.credentials if creds else None) or access_token_query
    if token:
        try:
            payload = jwt.decode(
                token,
                settings.secret_key,
                algorithms=["HS256"],
            )
            user_id = payload.get("sub")
            user = db.get(User, user_id) if user_id else None
            if user:
                return user
        except JWTError:
            pass
    if settings.is_development:
        dev_id = x_dev_user_id or x_dev_user_id_query or DEFAULT_DEV_USER_ID
        return dev_user(db, x_dev_user_id=dev_id)
    raise HTTPException(status_code=401, detail="Not authenticated")


CurrentUser = Annotated[User, Depends(get_current_user_dep)]
DbSession = Annotated[Session, Depends(get_db)]
