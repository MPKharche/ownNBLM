"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app import __version__
from app.core.rate_limit import apply_rate_limit_settings, enforce_global_api_rate, limiter
from app.core.security_headers import SecurityHeadersMiddleware
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
    Notebook,
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
apply_rate_limit_settings(settings)

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
    if settings.is_development:
        Base.metadata.create_all(bind=engine)
    if settings.sentry_dsn:
        import sentry_sdk  # noqa: PLC0415

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment)
    import threading

    if settings.folder_watch_enabled:

        def _start_watches() -> None:
            from app.services.folder_watch import reload_watches_from_db

            reload_watches_from_db()

        threading.Thread(target=_start_watches, daemon=True).start()

    def _recover_ingest() -> None:
        from app.core.database import SessionLocal
        from app.services.source_lifecycle import recover_stuck_sources

        with SessionLocal() as db:
            n = recover_stuck_sources(db, force=True)
            db.commit()
            if n:
                structlog.get_logger().info("ingest_recovered_on_startup", count=n)

    threading.Thread(target=_recover_ingest, daemon=True).start()
    yield
    from app.services.folder_watch import stop_all_watchers

    stop_all_watchers()


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

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def global_rate_limit_middleware(request: Request, call_next):
    enforce_global_api_rate(request)
    return await call_next(request)


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


@app.get("/reference")
def api_reference_redirect():
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/redoc")
