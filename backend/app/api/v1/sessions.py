from __future__ import annotations

import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.message import Message
from app.models.session import Session
from app.models.session_note import SessionNote
from app.models.share_link import ShareLink

router = APIRouter()


class SessionCreate(BaseModel):
    title: str = "New session"
    source_ids: list[str] = []


class SessionOut(BaseModel):
    id: str
    title: str
    source_ids: list[str]

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    citations: list | None = None

    class Config:
        from_attributes = True


class NoteCreate(BaseModel):
    content: str
    highlight_chunk_id: str | None = None


@router.get("", response_model=list[SessionOut])
def list_sessions(db: DbSession, user: CurrentUser):
    rows = db.execute(
        select(Session)
        .where(Session.org_id == user.org_id, Session.user_id == user.id)
        .order_by(Session.updated_at.desc())
    ).scalars()
    result = []
    for s in rows:
        ids = json.loads(s.source_ids_json or "[]")
        result.append(SessionOut(id=s.id, title=s.title, source_ids=ids))
    return result


@router.post("", response_model=SessionOut)
def create_session(body: SessionCreate, db: DbSession, user: CurrentUser):
    session = Session(
        id=str(uuid.uuid4()),
        org_id=user.org_id,
        user_id=user.id,
        title=body.title,
        source_ids_json=json.dumps(body.source_ids),
    )
    db.add(session)
    db.commit()
    return SessionOut(id=session.id, title=session.title, source_ids=body.source_ids)


@router.get("/{session_id}/messages", response_model=list[MessageOut])
def list_messages(session_id: str, db: DbSession, user: CurrentUser):
    session = _get_session(db, session_id, user)
    rows = db.execute(
        select(Message).where(Message.session_id == session.id).order_by(Message.created_at)
    ).scalars()
    out = []
    for m in rows:
        cites = json.loads(m.citations_json) if m.citations_json else None
        out.append(MessageOut(id=m.id, role=m.role, content=m.content, citations=cites))
    return out


@router.post("/{session_id}/notes")
def add_note(session_id: str, body: NoteCreate, db: DbSession, user: CurrentUser):
    session = _get_session(db, session_id, user)
    note = SessionNote(
        id=str(uuid.uuid4()),
        org_id=user.org_id,
        session_id=session.id,
        user_id=user.id,
        content=body.content,
        highlight_chunk_id=body.highlight_chunk_id,
    )
    db.add(note)
    db.commit()
    return {"id": note.id}


@router.post("/{session_id}/share")
def create_share(session_id: str, db: DbSession, user: CurrentUser):
    session = _get_session(db, session_id, user)
    token = secrets.token_urlsafe(32)
    link = ShareLink(
        id=str(uuid.uuid4()),
        org_id=user.org_id,
        session_id=session.id,
        token=token,
        created_by=user.id,
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )
    db.add(link)
    db.commit()
    return {"token": token, "url": f"/share/{token}"}


def public_share(token: str, db: DbSession):
    link = db.execute(select(ShareLink).where(ShareLink.token == token)).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404)
    if link.expires_at and link.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=410, detail="Share link expired")
    session = db.get(Session, link.session_id)
    messages = db.execute(
        select(Message).where(Message.session_id == link.session_id).order_by(Message.created_at)
    ).scalars()
    return {
        "session": {"id": session.id, "title": session.title if session else ""},
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "citations": json.loads(m.citations_json) if m.citations_json else [],
            }
            for m in messages
        ],
    }


def _get_session(db, session_id: str, user: CurrentUser) -> Session:
    session = db.get(Session, session_id)
    if session is None or session.org_id != user.org_id:
        raise HTTPException(status_code=404)
    return session
