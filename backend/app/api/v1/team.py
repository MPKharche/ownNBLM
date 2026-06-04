from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.deps import CurrentUser, DbSession
from app.services.annotations import add_annotation, list_annotations, resolve_share

router = APIRouter()


class AnnotationCreate(BaseModel):
    content: str
    message_id: str | None = None


@router.get("/sessions/{session_id}/annotations")
def get_session_annotations(session_id: str, db: DbSession, user: CurrentUser):
    rows = list_annotations(db, session_id=session_id)
    return [_ann_out(a) for a in rows if a.org_id == user.org_id]


@router.post("/sessions/{session_id}/annotations")
def post_session_annotation(
    session_id: str, body: AnnotationCreate, db: DbSession, user: CurrentUser
):
    row = add_annotation(
        db,
        org_id=user.org_id,
        session_id=session_id,
        content=body.content,
        user=user,
        message_id=body.message_id,
    )
    return _ann_out(row)


@router.get("/share/{token}/annotations")
def share_annotations(token: str, db: DbSession):
    link = resolve_share(db, token)
    if link is None:
        raise HTTPException(status_code=404)
    rows = list_annotations(db, session_id=link.session_id, share_link_id=link.id)
    return [_ann_out(a) for a in rows]


@router.post("/share/{token}/annotations")
def post_share_annotation(token: str, body: AnnotationCreate, db: DbSession, user: CurrentUser):
    link = resolve_share(db, token)
    if link is None:
        raise HTTPException(status_code=404)
    if user.org_id != link.org_id:
        raise HTTPException(status_code=403, detail="Must be a workspace member")
    row = add_annotation(
        db,
        org_id=link.org_id,
        session_id=link.session_id,
        content=body.content,
        user=user,
        share_link_id=link.id,
        message_id=body.message_id,
    )
    return _ann_out(row)


def _ann_out(a) -> dict:
    return {
        "id": a.id,
        "content": a.content,
        "author_name": a.author_name,
        "user_id": a.user_id,
        "message_id": a.message_id,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }
