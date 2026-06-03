"""Chunk retrieval with cosine similarity."""

from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.chunk import Chunk
from app.models.document import Document
from app.models.source import Source
from app.services.embeddings import embed_texts, embedding_from_json
from app.services.llm_burn import approx_tokens, assert_budget, estimate_embed_usd


@dataclass
class RetrievedChunk:
    chunk_id: str
    source_id: str
    document_id: str
    page: int | None
    text: str
    score: float
    source_name: str


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _has_indexed_chunks(db: Session, org_id: str, source_ids: list[str] | None) -> bool:
    stmt = (
        select(func.count())
        .select_from(Chunk)
        .join(Document, Chunk.document_id == Document.id)
        .join(Source, Document.source_id == Source.id)
        .where(Chunk.org_id == org_id, Source.status == "indexed")
    )
    if source_ids:
        stmt = stmt.where(Source.id.in_(source_ids))
    return db.execute(stmt).scalar_one() > 0


def retrieve(
    db: Session,
    org_id: str,
    query: str,
    source_ids: list[str] | None = None,
    top_k: int | None = None,
) -> list[RetrievedChunk]:
    settings = get_settings()
    top_k = top_k if top_k is not None else settings.llm_retrieval_top_k
    max_chars = settings.llm_max_chunk_chars

    if not _has_indexed_chunks(db, org_id, source_ids):
        return []

    embed_tokens = approx_tokens(query)
    assert_budget(db, org_id, estimate_embed_usd(embed_tokens))

    query_vec = embed_texts(db, org_id, [query])[0]
    stmt = (
        select(Chunk, Document, Source)
        .join(Document, Chunk.document_id == Document.id)
        .join(Source, Document.source_id == Source.id)
        .where(Chunk.org_id == org_id, Source.status == "indexed")
    )
    if source_ids:
        stmt = stmt.where(Source.id.in_(source_ids))

    scored: list[RetrievedChunk] = []
    for chunk, doc, source in db.execute(stmt).all():
        vec = embedding_from_json(chunk.embedding_ref)
        if not vec:
            continue
        score = _cosine(query_vec, vec)
        scored.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                source_id=source.id,
                document_id=doc.id,
                page=chunk.page,
                text=chunk.text[:max_chars],
                score=score,
                source_name=source.name,
            )
        )
    scored.sort(key=lambda c: c.score, reverse=True)
    return scored[:top_k]
