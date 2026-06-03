"""Chunk retrieval with cosine similarity."""

from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chunk import Chunk
from app.models.document import Document
from app.models.source import Source
from app.services.embeddings import embed_texts, embedding_from_json


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


def retrieve(
    db: Session,
    org_id: str,
    query: str,
    source_ids: list[str] | None = None,
    top_k: int = 8,
) -> list[RetrievedChunk]:
    query_vec = embed_texts([query])[0]
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
                text=chunk.text[:1200],
                score=score,
                source_name=source.name,
            )
        )
    scored.sort(key=lambda c: c.score, reverse=True)
    return scored[:top_k]
