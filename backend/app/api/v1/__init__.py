from fastapi import APIRouter

from app.api.v1 import admin, auth, billing, chat, files, gdpr, public_api, sessions, sources, team, usage

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(sources.router, prefix="/sources", tags=["sources"])
router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
router.include_router(chat.router, tags=["chat"])
router.include_router(billing.router, prefix="/billing", tags=["billing"])
router.include_router(usage.router, prefix="/usage", tags=["usage"])
router.include_router(files.router, prefix="/files", tags=["files"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])
router.include_router(team.router, prefix="/team", tags=["team"])
router.include_router(public_api.router, prefix="/public", tags=["public-api"])
router.include_router(gdpr.router, prefix="/gdpr", tags=["gdpr"])
