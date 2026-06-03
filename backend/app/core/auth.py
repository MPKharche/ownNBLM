"""Dev-mode auth stub — production uses Better Auth (Phase 3)."""

from fastapi import Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User

DEV_USER_HEADER = "x-dev-user-id"
DEFAULT_DEV_USER_ID = "00000000-0000-4000-8000-000000000001"


def get_current_user(
    db: Session,
    x_dev_user_id: str | None = Header(default=None, alias=DEV_USER_HEADER),
) -> User:
    settings = get_settings()
    user_id = x_dev_user_id or DEFAULT_DEV_USER_ID

    if not settings.is_development and x_dev_user_id:
        raise HTTPException(status_code=401, detail="Dev auth header not allowed in production")

    user = db.get(User, user_id)
    if user is None:
        if settings.is_development:
            raise HTTPException(
                status_code=401,
                detail=f"Unknown dev user {user_id}. Run `make seed` first.",
            )
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
