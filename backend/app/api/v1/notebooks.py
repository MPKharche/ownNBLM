"""Notebooks CRUD — each notebook owns a set of sources and multiple chat sessions."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.notebook import Notebook
from app.models.session import Session
from app.models.source import Source

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class NotebookCreate(BaseModel):
    title: str = "Untitled notebook"
    description: str | None = None
    source_ids: list[str] = []


class NotebookUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class SourceOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    name: str
    status: str
    source_type: str
    byte_size: int | None
    is_private: bool = False


class NotebookOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    title: str
    description: str | None
    source_ids: list[str]
    session_count: int


class SessionOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    title: str
    notebook_id: str | None
    source_ids: list[str]


class SessionCreate(BaseModel):
    title: str = "New session"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_notebook(db: DbSession, notebook_id: str, user: CurrentUser) -> Notebook:
    nb = db.get(Notebook, notebook_id)
    if nb is None or nb.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return nb


def _notebook_out(nb: Notebook) -> NotebookOut:
    return NotebookOut(
        id=nb.id,
        title=nb.title,
        description=nb.description,
        source_ids=[s.id for s in nb.sources],
        session_count=len(nb.sessions),
    )


# ── Notebook CRUD ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[NotebookOut])
def list_notebooks(db: DbSession, user: CurrentUser):
    rows = db.execute(
        select(Notebook)
        .where(Notebook.org_id == user.org_id)
        .order_by(Notebook.updated_at.desc())
    ).scalars().all()
    return [_notebook_out(nb) for nb in rows]


@router.post("", response_model=NotebookOut, status_code=201)
def create_notebook(body: NotebookCreate, db: DbSession, user: CurrentUser):
    nb = Notebook(
        id=str(uuid.uuid4()),
        org_id=user.org_id,
        user_id=user.id,
        title=body.title,
        description=body.description,
    )
    # Attach requested sources (must belong to this org)
    if body.source_ids:
        sources = db.execute(
            select(Source).where(
                Source.id.in_(body.source_ids),
                Source.org_id == user.org_id,
            )
        ).scalars().all()
        nb.sources = list(sources)
    db.add(nb)
    db.commit()
    db.refresh(nb)
    return _notebook_out(nb)


@router.get("/{notebook_id}", response_model=NotebookOut)
def get_notebook(notebook_id: str, db: DbSession, user: CurrentUser):
    nb = _get_notebook(db, notebook_id, user)
    return _notebook_out(nb)


@router.patch("/{notebook_id}", response_model=NotebookOut)
def update_notebook(notebook_id: str, body: NotebookUpdate, db: DbSession, user: CurrentUser):
    nb = _get_notebook(db, notebook_id, user)
    if body.title is not None:
        nb.title = body.title
    if body.description is not None:
        nb.description = body.description
    db.commit()
    db.refresh(nb)
    return _notebook_out(nb)


@router.delete("/{notebook_id}", status_code=204)
def delete_notebook(notebook_id: str, db: DbSession, user: CurrentUser):
    nb = _get_notebook(db, notebook_id, user)
    db.delete(nb)
    db.commit()


# ── Source management ─────────────────────────────────────────────────────────

@router.get("/{notebook_id}/sources", response_model=list[SourceOut])
def list_notebook_sources(notebook_id: str, db: DbSession, user: CurrentUser):
    nb = _get_notebook(db, notebook_id, user)
    return nb.sources


@router.put("/{notebook_id}/sources/{source_id}", status_code=204)
def add_source_to_notebook(notebook_id: str, source_id: str, db: DbSession, user: CurrentUser):
    nb = _get_notebook(db, notebook_id, user)
    source = db.get(Source, source_id)
    if source is None or source.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Source not found")
    if source not in nb.sources:
        nb.sources.append(source)
        db.commit()


@router.delete("/{notebook_id}/sources/{source_id}", status_code=204)
def remove_source_from_notebook(notebook_id: str, source_id: str, db: DbSession, user: CurrentUser):
    nb = _get_notebook(db, notebook_id, user)
    source = db.get(Source, source_id)
    if source and source in nb.sources:
        nb.sources.remove(source)
        db.commit()


# ── Sessions scoped to a notebook ────────────────────────────────────────────

@router.get("/{notebook_id}/sessions", response_model=list[SessionOut])
def list_notebook_sessions(notebook_id: str, db: DbSession, user: CurrentUser):
    _get_notebook(db, notebook_id, user)
    rows = db.execute(
        select(Session)
        .where(Session.notebook_id == notebook_id, Session.org_id == user.org_id)
        .order_by(Session.updated_at.desc())
    ).scalars().all()
    result = []
    for s in rows:
        ids = json.loads(s.source_ids_json or "[]")
        result.append(SessionOut(id=s.id, title=s.title, notebook_id=s.notebook_id, source_ids=ids))
    return result


@router.post("/{notebook_id}/sessions", response_model=SessionOut, status_code=201)
def create_notebook_session(
    notebook_id: str, body: SessionCreate, db: DbSession, user: CurrentUser
):
    nb = _get_notebook(db, notebook_id, user)
    # Inherit all indexed sources from the notebook as session scope
    source_ids = [s.id for s in nb.sources if s.status == "indexed"]
    session = Session(
        id=str(uuid.uuid4()),
        org_id=user.org_id,
        user_id=user.id,
        title=body.title,
        notebook_id=notebook_id,
        source_ids_json=json.dumps(source_ids),
    )
    db.add(session)
    db.commit()
    return SessionOut(
        id=session.id,
        title=session.title,
        notebook_id=session.notebook_id,
        source_ids=source_ids,
    )
