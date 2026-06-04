from __future__ import annotations

import asyncio
import json
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.deps import AuthContext, DbSession, require_scope
from app.core.rate_limit import ChatRateLimit
from app.core.config import get_settings
from app.models.message import Message
from app.models.org import Org
from app.models.session import Session as ChatSession
from app.services.credits import check_query_allowed, deduct_query, usage_percent
from app.services.llm import LLMRouterError, stream_chat
from app.services.llm_burn import (
    LLMBurnExceeded,
    approx_tokens,
    assert_budget,
    estimate_chat_usd,
    record_spend,
)
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
async def chat_sse(
    session_id: str,
    body: ChatRequest,
    db: DbSession,
    _rate: ChatRateLimit,
    ctx: AuthContext = Depends(require_scope("full")),
):
    if ctx.user is None:
        raise HTTPException(status_code=401, detail="User context required")
    user = ctx.user
    session = db.get(ChatSession, session_id)
    if session is None or session.org_id != user.org_id:
        raise HTTPException(status_code=404)

    settings = get_settings()
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
        prompt_text = "\n".join(m["content"] for m in llm_messages)
        assert_budget(
            db,
            user.org_id,
            estimate_chat_usd(approx_tokens(prompt_text), settings.llm_max_output_tokens),
        )
    except LLMBurnExceeded as e:
        logger.warning("chat_burn_cap", org_id=user.org_id, error=str(e))
        return _sse_error(str(e))
    except Exception as e:
        logger.exception("chat_prepare_failed", session_id=session_id)
        return _sse_error(str(e))

    assistant_id = str(uuid.uuid4())
    org_id = user.org_id
    session_db_id = session.id

    async def event_stream():
        from app.services.llm_burn import burn_status

        pct = usage_percent(usage)
        if pct >= 80:
            yield f"data: {json.dumps({'event': 'credit_warning', 'used': usage.queries_used, 'limit': usage.query_limit, 'pct': pct})}\n\n"

        with SessionLocal() as burn_db:
            burn = burn_status(burn_db, org_id)
        if burn["enabled"] and burn["usage_percent"] >= 80:
            yield f"data: {json.dumps({'event': 'burn_warning', 'spent_usd': burn['spent_usd'], 'budget_usd': burn['budget_usd'], 'pct': burn['usage_percent']})}\n\n"

        full_answer: list[str] = []
        try:
            async for token in stream_chat(llm_messages, org_tier=tier, model=body.model):
                full_answer.append(token)
                yield f"data: {json.dumps({'event': 'token', 'delta': token})}\n\n"
                await asyncio.sleep(0)
        except (LLMRouterError, LLMBurnExceeded, Exception) as e:
            logger.warning("chat_stream_failed", error=str(e))
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
            return

        answer = "".join(full_answer)
        if not answer.strip():
            yield f"data: {json.dumps({'event': 'error', 'message': 'Model returned an empty response'})}\n\n"
            return

        prompt_tokens = approx_tokens("\n".join(m["content"] for m in llm_messages))
        completion_tokens = approx_tokens(answer)
        chat_model = body.model or settings.default_llm_model

        with SessionLocal() as save_db:
            record_spend(
                save_db,
                org_id,
                estimate_chat_usd(prompt_tokens, completion_tokens),
                kind="chat",
                model=chat_model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
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
            from app.services.audit import log_audit

            log_audit(
                save_db,
                org_id=org_id,
                user_id=user.id,
                action="session.chat",
                resource_type="session",
                resource_id=session_db_id,
                metadata={"message_id": assistant_id},
            )

        from app.services.webhooks import dispatch_webhook

        dispatch_webhook(
            org_id,
            "session.answer_generated",
            {
                "session_id": session_db_id,
                "message_id": assistant_id,
                "answer_preview": answer[:500],
            },
        )

        yield f"data: {json.dumps({'event': 'done', 'message_id': assistant_id, 'citations': citations})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
