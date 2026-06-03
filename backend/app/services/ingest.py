"""Ingest pipeline: parse → chunk → embed → store."""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

import PyPDF2
import structlog
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.chunk import Chunk
from app.models.document import Document
from app.models.source import Source
from app.services.embeddings import embed_texts, embedding_to_json
from app.services.llm_burn import LLMBurnExceeded
from app.services.storage import get_storage

logger = structlog.get_logger()

CHUNK_CHARS_APPROX = 2000  # ~512 tokens rough estimate
OVERLAP_CHARS = 256


def _chunk_text(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_CHARS_APPROX, len(text))
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - OVERLAP_CHARS
    return chunks


def _extract_pdf_text(path: Path) -> tuple[str, int]:
    reader = PyPDF2.PdfReader(str(path))
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n\n".join(pages), len(reader.pages)


def _extract_plain(path: Path) -> tuple[str, int]:
    return path.read_text(encoding="utf-8", errors="replace"), 1


def run_ingest(db: Session, source_id: str, progress_cb=None) -> None:
    settings = get_settings()
    source = db.get(Source, source_id)
    if source is None:
        raise ValueError(f"Source {source_id} not found")

    def emit(pct: int, step: str) -> None:
        if progress_cb:
            progress_cb(pct, step)
        logger.info("ingest_progress", source_id=source_id, pct=pct, step=step)

    source.status = "processing"
    db.commit()
    emit(10, "Reading file")

    file_path = Path(source.file_path or "")
    if not file_path.exists():
        source.status = "error"
        source.error_message = "File not found on disk"
        db.commit()
        return

    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        full_text, page_count = _extract_pdf_text(file_path)
    elif suffix in {".md", ".txt"}:
        full_text, page_count = _extract_plain(file_path)
    else:
        source.status = "error"
        source.error_message = f"Unsupported format: {suffix}"
        db.commit()
        return

    emit(30, "Chunking text")
    pieces = _chunk_text(full_text)
    if not pieces:
        source.status = "error"
        source.error_message = "No extractable text"
        db.commit()
        return

    doc = db.query(Document).filter(Document.source_id == source_id).first()
    if doc is None:
        doc = Document(
            id=str(uuid.uuid4()),
            org_id=source.org_id,
            source_id=source.id,
            title=source.name,
            page_count=page_count,
        )
        db.add(doc)
    else:
        db.query(Chunk).filter(Chunk.document_id == doc.id).delete()
        doc.page_count = page_count

    emit(50, "Generating embeddings")
    try:
        vectors = embed_texts(db, source.org_id, pieces)
    except LLMBurnExceeded as e:
        source.status = "error"
        source.error_message = str(e)
        db.commit()
        return

    emit(80, "Storing index")
    for idx, (text, vec) in enumerate(zip(pieces, vectors, strict=True)):
        db.add(
            Chunk(
                id=str(uuid.uuid4()),
                org_id=source.org_id,
                document_id=doc.id,
                chunk_index=idx,
                page=1,
                text=text,
                embedding_ref=embedding_to_json(vec),
                token_count=len(text.split()),
            )
        )

    source.status = "indexed"
    source.error_message = None
    doc.metadata_json = json.dumps({"chunk_count": len(pieces)})
    db.commit()
    emit(100, "Done")
