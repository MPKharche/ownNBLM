from __future__ import annotations

import asyncio
import json
import uuid

import structlog
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.deps import CurrentUser, DbSession
from app.models.message import Message
from app.models.org import Org
from app.models.session import Session as ChatSession
from app.services.credits import check_query_allowed, deduct_query, usage_percent
from app.services.llm import LLMRouterError, stream_chat
from app.services.retrieval import retrieve

logger = structlog.get_logger()
router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    model: str | None = None


def _build_messages(db: Session, session: ChatSession, user_message: str) -> tuple[list[dict], list[dict]]:
    raw = session.source_ids_json or "[]"
    try:
        source_ids = json.loads(raw)
    except json.JSONDecodeError:
        source_ids = []
    # Empty list = search full corpus (same as None)
    scope = source_ids if source_ids else None
    chunks = retrieve(db, session.org_id, user_message, source_ids=scope)
    if chunks:
        context = "\n\n---\n\n".join(
            f"[{c.source_name} p.{c.page or '?'}] {c.text}" for c in chunks
        )
    else:
        context = "(No indexed documents in scope. Answer from general knowledge and say corpus is empty.)"
    citations = [
        {
            "source_id": c.source_id,
            "page": c.page,
            "chunk_id": c.chunk_id,
            "excerpt": c.text[:300],
        }
        for c in chunks
    ]
    system = (
        "You are ownNBLM, a research assistant. Answer using the provided context when available. "
        "Cite sources inline as [source]. Be concise."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {user_message}"},
    ]
    return messages, citations


def _sse_error(message: str) -> StreamingResponse:
    async def gen():
        yield f"data: {json.dumps({'event': 'error', 'message': message})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/sessions/{session_id}/chat")
async def chat_sse(session_id: str, body: ChatRequest, db: DbSession, user: CurrentUser):
    session = db.get(ChatSession, session_id)
    if session is None or session.org_id != user.org_id:
        raise HTTPException(status_code=404)

    org = db.get(Org, user.org_id)
    tier = org.tier if org else "free"
    allowed, usage = check_query_allowed(db, user.org_id)
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail={
                "message": "Query limit reached",
                "upgrade_url": "/billing",
                "used": usage.queries_used,
                "limit": usage.query_limit,
            },
        )

    try:
        db.add(
            Message(
                id=str(uuid.uuid4()),
                org_id=user.org_id,
                session_id=session.id,
                role="user",
                content=body.message,
            )
        )
        db.commit()
        llm_messages, citations = _build_messages(db, session, body.message)
    except Exception as e:
        logger.exception("chat_prepare_failed", session_id=session_id)
        return _sse_error(str(e))

    assistant_id = str(uuid.uuid4())
    org_id = user.org_id
    session_db_id = session.id

    async def event_stream():
        pct = usage_percent(usage)
        if pct >= 80:
            yield f"data: {json.dumps({'event': 'credit_warning', 'used': usage.queries_used, 'limit': usage.query_limit, 'pct': pct})}\n\n"

        full_answer: list[str] = []
        try:
            async for token in stream_chat(llm_messages, org_tier=tier, model=body.model):
                full_answer.append(token)
                yield f"data: {json.dumps({'event': 'token', 'delta': token})}\n\n"
                await asyncio.sleep(0)
        except (LLMRouterError, Exception) as e:
            logger.warning("chat_stream_failed", error=str(e))
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
            return

        answer = "".join(full_answer)
        if not answer.strip():
            yield f"data: {json.dumps({'event': 'error', 'message': 'Model returned an empty response'})}\n\n"
            return

        with SessionLocal() as save_db:
            save_db.add(
                Message(
                    id=assistant_id,
                    org_id=org_id,
                    session_id=session_db_id,
                    role="assistant",
                    content=answer,
                    citations_json=json.dumps(citations),
                )
            )
            deduct_query(save_db, org_id)
            save_db.commit()

        yield f"data: {json.dumps({'event': 'done', 'message_id': assistant_id, 'citations': citations})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
