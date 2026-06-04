"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app import __version__
from app.core.rate_limit import limiter
from app.api.health import router as health_router
from app.api.v1 import router as v1_router
from app.core.config import get_settings
from app.core.database import Base, engine, get_db
from app.models import (  # noqa: F401 — register ORM tables
    ApiKey,
    AuditEvent,
    Chunk,
    Document,
    LlmSpendEvent,
    MagicLinkToken,
    Message,
    OAuthAccount,
    Org,
    RefreshToken,
    Session,
    SessionAnnotation,
    SessionNote,
    ShareLink,
    Source,
    User,
    WebhookSubscription,
    WorkspaceInvite,
    WorkspaceUsage,
)

settings = get_settings()

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()
        if settings.is_development
        else structlog.processors.JSONRenderer(),
    ],
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.sentry_dsn:
        import sentry_sdk  # noqa: PLC0415

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment)
    yield


app = FastAPI(
    title="ownNBLM API",
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://([a-z0-9-]+\.)*vercel\.app" if settings.is_production else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    import uuid

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


app.include_router(health_router)
app.include_router(v1_router)


@app.get("/api/v1/share/{token}")
def public_share_route(token: str, db=Depends(get_db)):
    from app.api.v1.sessions import public_share

    return public_share(token, db)


Instrumentator().instrument(app).expose(app, endpoint="/metrics")


@app.get("/")
def root():
    return {"name": "ownNBLM", "version": __version__}
