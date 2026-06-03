from fastapi import APIRouter

from app.api.v1 import auth, billing, chat, files, sessions, sources, usage

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(sources.router, prefix="/sources", tags=["sources"])
router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
router.include_router(chat.router, tags=["chat"])
router.include_router(billing.router, prefix="/billing", tags=["billing"])
router.include_router(usage.router, prefix="/usage", tags=["usage"])
router.include_router(files.router, prefix="/files", tags=["files"])
