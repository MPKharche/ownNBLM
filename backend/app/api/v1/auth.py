from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.core.deps import DbSession
from app.core.rate_limit import AuthRateLimit
from app.services.auth_service import (
    authenticate,
    refresh_access_token,
    register_user,
    token_response,
)
from app.services.magic_link import request_magic_link, verify_magic_link
from app.services.oauth_google import login_or_register_google

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    org_name: str = "My Workspace"
    display_name: str = ""


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    org_id: str
    email: str
    role: str = "member"


class RefreshRequest(BaseModel):
    refresh_token: str


class GoogleAuthRequest(BaseModel):
    id_token: str


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkVerifyRequest(BaseModel):
    token: str


class AcceptInviteRequest(BaseModel):
    token: str
    password: str = ""
    display_name: str = ""


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DbSession, _rate: AuthRateLimit):
    user = authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(**token_response(user, db))


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: DbSession, _rate: AuthRateLimit):
    try:
        user = register_user(
            db, body.email, body.password, body.org_name, body.display_name
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return TokenResponse(**token_response(user, db))


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: DbSession):
    pair = refresh_access_token(db, body.refresh_token)
    if pair is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    access, refresh_tok = pair
    from sqlalchemy import select
    from jose import jwt

    settings = get_settings()
    payload = jwt.decode(access, settings.secret_key, algorithms=["HS256"])
    from app.models.user import User

    user = db.get(User, payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenResponse(
        access_token=access,
        refresh_token=refresh_tok,
        user_id=user.id,
        org_id=user.org_id,
        email=user.email,
        role=user.role,
    )


@router.post("/google", response_model=TokenResponse)
def google_auth(body: GoogleAuthRequest, db: DbSession, _rate: AuthRateLimit):
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    try:
        user, access, refresh = login_or_register_google(db, body.id_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user_id=user.id,
        org_id=user.org_id,
        email=user.email,
        role=user.role,
    )


@router.post("/magic-link")
def magic_link_request(body: MagicLinkRequest, db: DbSession, _rate: AuthRateLimit):
    _, link, email_sent = request_magic_link(db, str(body.email))
    settings = get_settings()
    out: dict = {"sent": email_sent}
    if settings.is_development and link:
        out["magic_link_url"] = link
    if not email_sent and not settings.is_development:
        out["detail"] = "Email not configured — set RESEND_API_KEY on the API host"
    return out


@router.post("/magic-link/verify", response_model=TokenResponse)
def magic_link_verify(body: MagicLinkVerifyRequest, db: DbSession):
    try:
        access, refresh = verify_magic_link(db, body.token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    from jose import jwt

    settings = get_settings()
    from app.models.user import User

    payload = jwt.decode(access, settings.secret_key, algorithms=["HS256"])
    user = db.get(User, payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user_id=user.id,
        org_id=user.org_id,
        email=user.email,
        role=user.role,
    )


@router.post("/invites/accept", response_model=TokenResponse)
def accept_invite(body: AcceptInviteRequest, db: DbSession):
    from app.services.auth_service import hash_password
    from app.services.invites import accept_invite as do_accept

    pwd_hash = hash_password(body.password) if body.password else None
    try:
        user = do_accept(
            db,
            body.token,
            password_hash=pwd_hash,
            display_name=body.display_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return TokenResponse(**token_response(user, db))
