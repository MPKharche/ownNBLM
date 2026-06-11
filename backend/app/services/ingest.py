"""Ingest pipeline: parse → chunk → embed → store.

PDF extraction strategy (applied in order until text is found):
  1. PyMuPDF (fitz)  — fast, handles most native-text PDFs
  2. pdfplumber      — catches rotated/structured PDFs fitz misses
  3. OCR via Tesseract + pdf2image — for scanned/image-only PDFs
"""

from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path

import structlog
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.chunk import Chunk
from app.models.document import Document
from app.models.source import Source
from app.services.embeddings import embed_texts, embedding_to_json
from app.services.llm_burn import LLMBurnExceeded

logger = structlog.get_logger()

CHUNK_CHARS_APPROX = 2000
OVERLAP_CHARS = 256

# Tesseract binary — check common Windows install locations if not on PATH
_TESS_CANDIDATES = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Users\Public\Tesseract-OCR\tesseract.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
]


def _configure_tesseract() -> bool:
    """Point pytesseract at the Tesseract binary. Returns True if found."""
    try:
        import pytesseract
        # If it already works (is on PATH), skip
        try:
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            pass
        for candidate in _TESS_CANDIDATES:
            if Path(candidate).exists():
                pytesseract.pytesseract.tesseract_cmd = candidate
                try:
                    pytesseract.get_tesseract_version()
                    return True
                except Exception:
                    continue
        return False
    except ImportError:
        return False


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


# ── Extraction tiers ──────────────────────────────────────────────────────────

def _try_fitz(path: Path) -> tuple[list[tuple[str, int]], int] | None:
    """Tier 1: PyMuPDF — best for native-text PDFs."""
    try:
        import fitz  # type: ignore
        doc = fitz.open(str(path))
        total = len(doc)
        pages: list[tuple[str, int]] = []
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text")
            if text and text.strip():
                pages.append((text, i))
        doc.close()
        if pages:
            return pages, total
        return None
    except Exception as e:
        logger.debug("fitz_extraction_failed", error=str(e))
        return None


def _try_pdfplumber(path: Path) -> tuple[list[tuple[str, int]], int] | None:
    """Tier 2: pdfplumber — better for tables/structured layouts."""
    try:
        import pdfplumber  # type: ignore
        pages: list[tuple[str, int]] = []
        with pdfplumber.open(str(path)) as pdf:
            total = len(pdf.pages)
            for i, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                if text.strip():
                    pages.append((text, i))
        if pages:
            return pages, total
        return None
    except Exception as e:
        logger.debug("pdfplumber_extraction_failed", error=str(e))
        return None


def _try_ocr(path: Path, emit_cb=None) -> tuple[list[tuple[str, int]], int] | None:
    """Tier 3: OCR — render pages via PyMuPDF (no Poppler needed), then OCR with Tesseract."""
    if not _configure_tesseract():
        logger.warning("ocr_unavailable", reason="Tesseract not found")
        return None
    try:
        import fitz  # type: ignore  — PyMuPDF, renders pages to images
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
        import io

        if emit_cb:
            emit_cb(35, "OCR: rendering pages…")

        doc = fitz.open(str(path))
        total = len(doc)
        pages: list[tuple[str, int]] = []

        for i, page in enumerate(doc, start=1):
            if emit_cb:
                pct = 35 + int(55 * (i / total))
                emit_cb(pct, f"OCR: reading page {i}/{total}…")
            # Render at 200 DPI — matrix scale = 200/72 ≈ 2.78
            mat = fitz.Matrix(200 / 72, 200 / 72)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            text = pytesseract.image_to_string(img, lang="eng")
            if text and text.strip():
                pages.append((text, i))

        doc.close()
        if pages:
            return pages, total
        return None
    except Exception as e:
        logger.warning("ocr_extraction_failed", error=str(e))
        return None


def _extract_pdf(path: Path, emit_cb=None) -> tuple[list[tuple[str, int]], int]:
    """Try all three tiers in order. Raises ValueError if all fail."""
    if emit_cb:
        emit_cb(15, "Extracting text (native)…")
    result = _try_fitz(path)
    if result:
        return result

    if emit_cb:
        emit_cb(25, "Retrying with pdfplumber…")
    result = _try_pdfplumber(path)
    if result:
        return result

    if emit_cb:
        emit_cb(30, "Running OCR on image-based PDF…")
    result = _try_ocr(path, emit_cb)
    if result:
        return result

    raise ValueError("No extractable text found. PDF may be encrypted, corrupt, or contain only unsupported content.")


def _extract_plain(path: Path) -> tuple[list[tuple[str, int]], int]:
    text = path.read_text(encoding="utf-8", errors="replace")
    return [(text, 1)], 1


# ── Main ingest entry point ───────────────────────────────────────────────────

def run_ingest(db: Session, source_id: str, progress_cb=None) -> None:
    source = db.get(Source, source_id)
    if source is None:
        raise ValueError(f"Source {source_id} not found")

    def emit(pct: int, step: str) -> None:
        if progress_cb:
            progress_cb(pct, step)
        logger.info("ingest_progress", source_id=source_id, pct=pct, step=step)

    source.status = "processing"
    db.commit()
    emit(10, "Reading file…")

    file_path = Path(source.file_path or "")
    if not file_path.exists():
        source.status = "error"
        source.error_message = "File not found on disk"
        db.commit()
        return

    suffix = file_path.suffix.lower()
    try:
        if suffix == ".pdf":
            page_texts, page_count = _extract_pdf(file_path, emit_cb=emit)
        elif suffix in {".md", ".txt"}:
            page_texts, page_count = _extract_plain(file_path)
        else:
            source.status = "error"
            source.error_message = f"Unsupported format: {suffix}"
            db.commit()
            return
    except ValueError as e:
        source.status = "error"
        source.error_message = str(e)
        db.commit()
        return

    emit(60, "Chunking text…")
    pieces_with_pages: list[tuple[str, int]] = []
    for page_text, page_num in page_texts:
        for chunk_text in _chunk_text(page_text):
            pieces_with_pages.append((chunk_text, page_num))

    if not pieces_with_pages:
        source.status = "error"
        source.error_message = "No text could be extracted after all attempts."
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

    emit(70, "Generating embeddings…")
    pieces = [t for t, _ in pieces_with_pages]
    try:
        vectors = embed_texts(db, source.org_id, pieces)
    except LLMBurnExceeded as e:
        source.status = "error"
        source.error_message = str(e)
        db.commit()
        return

    emit(90, "Storing index…")
    for idx, ((text, page_num), vec) in enumerate(zip(pieces_with_pages, vectors, strict=True)):
        db.add(
            Chunk(
                id=str(uuid.uuid4()),
                org_id=source.org_id,
                document_id=doc.id,
                chunk_index=idx,
                page=page_num,
                text=text,
                embedding_ref=embedding_to_json(vec),
                token_count=len(text.split()),
            )
        )

    source.status = "indexed"
    source.error_message = None
    doc.metadata_json = json.dumps({"chunk_count": len(pieces), "extraction_method": "auto"})
    db.commit()
    emit(100, "Done")
