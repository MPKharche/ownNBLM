from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, OwnerUser
from app.services import folder_watch

router = APIRouter()


class WatchCreate(BaseModel):
    path: str


@router.get("")
def list_folder_watches(db: DbSession, user: CurrentUser):
    rows = folder_watch.list_watches(db, user.org_id)
    return [
        {
            "id": r.id,
            "path": r.path,
            "enabled": r.enabled,
            "last_scan_at": r.last_scan_at.isoformat() if r.last_scan_at else None,
        }
        for r in rows
    ]


@router.post("")
def add_folder_watch(body: WatchCreate, db: DbSession, user: OwnerUser):
    if not get_settings().folder_watch_enabled:
        raise HTTPException(status_code=503, detail="Folder watch disabled in config")
    try:
        row = folder_watch.register_watch(user.org_id, body.path, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"id": row.id, "path": row.path}


@router.delete("/{watch_id}")
def delete_folder_watch(watch_id: str, db: DbSession, user: OwnerUser):
    try:
        folder_watch.remove_watch(db, user.org_id, watch_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True}
