from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.services.storage import get_storage

router = APIRouter()


@router.get("/download")
def download_file(
    user: CurrentUser,
    key: str = Query(...),
):
    settings = get_settings()
    if settings.storage_backend == "local":
        from pathlib import Path

        path = Path(settings.storage_local_path) / key
        if not path.exists() or not str(path).startswith(str(Path(settings.storage_local_path))):
            raise HTTPException(status_code=404)
        return FileResponse(path)
    from fastapi.responses import Response

    storage = get_storage()
    data = storage.read(key)
    return Response(content=data, media_type="application/octet-stream")
