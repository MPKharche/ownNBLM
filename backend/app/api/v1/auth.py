from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from app.core.deps import DbSession
from app.services.auth_service import authenticate, create_access_token, register_user

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
    token_type: str = "bearer"
    user_id: str
    org_id: str
    email: str


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DbSession):
    user = authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        org_id=user.org_id,
        email=user.email,
    )


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: DbSession):
    try:
        user = register_user(
            db, body.email, body.password, body.org_name, body.display_name
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        org_id=user.org_id,
        email=user.email,
    )
