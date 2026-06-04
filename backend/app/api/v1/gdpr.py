"""GDPR groundwork — data export and erasure."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from sqlalchemy import select

from app.core.deps import DbSession, OwnerUser
from app.models.message import Message
from app.models.org import Org
from app.models.session import Session
from app.models.session_note import SessionNote
from app.models.source import Source
from app.models.user import User
from app.services.audit import log_audit

router = APIRouter()


@router.get("/export")
def export_org_data(db: DbSession, user: OwnerUser):
    org = db.get(Org, user.org_id)
    members = db.execute(select(User).where(User.org_id == user.org_id)).scalars()
    sources = db.execute(select(Source).where(Source.org_id == user.org_id)).scalars()
    sessions = db.execute(select(Session).where(Session.org_id == user.org_id)).scalars()
    payload = {
        "org": {
            "id": org.id if org else user.org_id,
            "name": org.name if org else "",
            "tier": org.tier if org else "free",
        },
        "members": [
            {"id": m.id, "email": m.email, "role": m.role, "display_name": m.display_name}
            for m in members
        ],
        "sources": [
            {"id": s.id, "name": s.name, "status": s.status, "byte_size": s.byte_size}
            for s in sources
        ],
        "sessions": [{"id": s.id, "title": s.title, "user_id": s.user_id} for s in sessions],
    }
    log_audit(
        db,
        org_id=user.org_id,
        user_id=user.id,
        action="gdpr.export",
        resource_type="org",
        resource_id=user.org_id,
    )
    body = json.dumps(payload, indent=2)
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="ownnblm-export.json"'},
    )


@router.delete("/erase")
def erase_org_data(db: DbSession, user: OwnerUser):
    org = db.get(Org, user.org_id)
    if org is None:
        raise HTTPException(status_code=404)
    log_audit(
        db,
        org_id=user.org_id,
        user_id=user.id,
        action="gdpr.erase_requested",
        resource_type="org",
        resource_id=user.org_id,
    )
    for model in (Message, SessionNote, Session, Source, User):
        rows = db.execute(select(model).where(model.org_id == user.org_id)).scalars()  # type: ignore[attr-defined]
        for row in rows:
            db.delete(row)
    db.delete(org)
    db.commit()
    return {"ok": True, "message": "Organization data erased"}
