"""Shared SSE chat stream for JWT and API-key auth."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.message import Message
from app.models.org import Org
from app.models.session import Session as ChatSession
from app.services.credits import check_query_allowed, deduct_query, usage_percent
from app.services.llm import LLMRouterError, stream_chat
from app.services.llm_burn import (
    LLMBurnExceeded,
    approx_tokens,
    assert_budget,
    burn_status,
    estimate_chat_usd,
    record_spend,
)
from app.services.retrieval import retrieve


def build_messages(db: Session, session: ChatSession, user_message: str) -> tuple[list[dict], list[dict]]:
    raw = session.source_ids_json or "[]"
    try:
        source_ids = json.loads(raw)
    except json.JSONDecodeError:
        source_ids = []
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
            "source_name": c.source_name,
            "page": c.page,
            "chunk_id": c.chunk_id,
            "excerpt": c.text[:300],
        }
        for c in chunks
    ]
    system = (
        "You are ownNBLM, a precise research assistant that answers questions grounded in the user's documents.\n\n"
        "## Response format (strictly follow)\n"
        "- Always use **markdown**. Never write a wall of plain text.\n"
        "- **Comparisons / multi-attribute data** → markdown table with clear headers.\n"
        "- **Processes / steps / sequences** → numbered list.\n"
        "- **Features / items / options** → bulleted list.\n"
        "- **Definitions / key terms** → **Bold label:** explanation on same line.\n"
        "- **Technical values, IDs, codes** → `inline code`.\n"
        "- **Direct quotes from the document** → > blockquote.\n"
        "- **Responses longer than 3 sentences** → start with a `## Summary` heading.\n"
        "- Be concise. Prefer scannable structure over prose paragraphs.\n\n"
        "## Citation format\n"
        "- After each factual claim, append exactly: [source]\n"
        "- Do NOT write full source names inline — just [source] as a marker.\n"
        "- Only use [source] when the fact comes from the provided context.\n"
        "- If the context has no relevant information, say so — do not invent facts.\n\n"
        "## Context\n"
        "Answer using ONLY the context below. If empty, state the corpus has no relevant documents."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {user_message}"},
    ]
    return messages, citations


async def stream_session_chat(
    db: Session,
    *,
    session: ChatSession,
    message: str,
    user_id: str | None,
    model: str | None = None,
) -> AsyncIterator[str]:
    settings = get_settings()
    org = db.get(Org, session.org_id)
    tier = org.tier if org else "free"
    allowed, usage = check_query_allowed(db, session.org_id)
    if not allowed:
        yield f"data: {json.dumps({'event': 'error', 'message': 'Query limit reached'})}\n\n"
        return

    db.add(
        Message(
            id=str(uuid.uuid4()),
            org_id=session.org_id,
            session_id=session.id,
            role="user",
            content=message,
        )
    )
    db.commit()
    llm_messages, citations = build_messages(db, session, message)
    prompt_text = "\n".join(m["content"] for m in llm_messages)
    try:
        assert_budget(
            db,
            session.org_id,
            estimate_chat_usd(approx_tokens(prompt_text), settings.llm_max_output_tokens),
        )
    except LLMBurnExceeded as e:
        yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
        return

    assistant_id = str(uuid.uuid4())
    org_id = session.org_id
    session_db_id = session.id

    pct = usage_percent(usage)
    if pct >= 80:
        yield f"data: {json.dumps({'event': 'credit_warning', 'used': usage.queries_used, 'limit': usage.query_limit, 'pct': pct})}\n\n"

    with SessionLocal() as burn_db:
        burn = burn_status(burn_db, org_id)
    if burn["enabled"] and burn["usage_percent"] >= 80:
        yield f"data: {json.dumps({'event': 'burn_warning', 'spent_usd': burn['spent_usd'], 'budget_usd': burn['budget_usd'], 'pct': burn['usage_percent']})}\n\n"

    full_answer: list[str] = []
    try:
        async for token in stream_chat(llm_messages, org_tier=tier, model=model):
            full_answer.append(token)
            yield f"data: {json.dumps({'event': 'token', 'delta': token})}\n\n"
            await asyncio.sleep(0)
    except (LLMRouterError, LLMBurnExceeded, Exception) as e:
        yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
        return

    answer = "".join(full_answer)
    if not answer.strip():
        yield f"data: {json.dumps({'event': 'error', 'message': 'Model returned an empty response'})}\n\n"
        return

    prompt_tokens = approx_tokens("\n".join(m["content"] for m in llm_messages))
    completion_tokens = approx_tokens(answer)
    chat_model = model or settings.default_llm_model

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
        if user_id:
            from app.services.audit import log_audit

            log_audit(
                save_db,
                org_id=org_id,
                user_id=user_id,
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
