"""Citation export — BibTeX, RIS, Zotero-compatible RIS."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.message import Message
from app.models.session import Session as ChatSession
from app.models.source import Source


def _bib_key(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]", "", name.split(".")[0])[:20] or "source"
    return f"{base}{datetime.now(UTC).year}"


def _collect_citations(db: Session, session: ChatSession) -> list[dict]:
    messages = db.execute(
        select(Message).where(Message.session_id == session.id).order_by(Message.created_at)
    ).scalars()
    seen: set[str] = set()
    cites: list[dict] = []
    for msg in messages:
        if not msg.citations_json:
            continue
        try:
            items = json.loads(msg.citations_json)
        except json.JSONDecodeError:
            continue
        for c in items:
            sid = c.get("source_id", "")
            if sid in seen:
                continue
            seen.add(sid)
            src = db.get(Source, sid)
            cites.append(
                {
                    "source_id": sid,
                    "title": src.name if src else sid,
                    "page": c.get("page"),
                    "excerpt": c.get("excerpt", ""),
                }
            )
    return cites


def export_bibtex(db: Session, session: ChatSession) -> str:
    lines = []
    for c in _collect_citations(db, session):
        key = _bib_key(c["title"])
        lines.append(
            f"@misc{{{key},\n"
            f"  title = {{{c['title']}}},\n"
            f"  note = {{Page {c.get('page', '?')}. {c.get('excerpt', '')[:200]}}},\n"
            f"  howpublished = {{ownNBLM corpus}},\n"
            f"  year = {{{datetime.now(UTC).year}}}\n"
            f"}}"
        )
    return "\n\n".join(lines) if lines else "% No citations in session"


def export_ris(db: Session, session: ChatSession) -> str:
    blocks = []
    for c in _collect_citations(db, session):
        blocks.append(
            "\n".join(
                [
                    "TY  - GEN",
                    f"TI  - {c['title']}",
                    f"N1  - Page {c.get('page', '?')}",
                    f"AB  - {c.get('excerpt', '')[:500]}",
                    f"Y1  - {datetime.now(UTC).year}",
                    "ER  - ",
                ]
            )
        )
    return "\n\n".join(blocks) if blocks else "TY  - GEN\nTI  - No citations\nER  - "


def export_zotero(db: Session, session: ChatSession) -> str:
    return export_ris(db, session)
