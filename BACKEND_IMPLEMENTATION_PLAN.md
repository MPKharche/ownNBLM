# ownNBLM Backend Implementation Plan

## Overview
This document provides a comprehensive guide for implementing the FastAPI backend, database layer, PageIndex integration, and deployment infrastructure for ownNBLM.

**Last Updated**: 2026-05-31  
**Priority Focus**: Offline-first architecture, multi-modal processing, enhanced annotations

---

## 🎯 Core Architecture Principles

### 1. **Offline-First Design**
- Frontend maintains full copy of user data in IndexedDB
- Backend is optional sync layer, not required for core functionality
- Conflict resolution via timestamp + user choice
- Sync queue persists pending changes when offline

### 2. **Multi-Modal Processing**
- Unified pipeline for PDF, images, video, audio, code
- Specialized parsers for each format
- Everything indexed in PageIndex with metadata
- Deep citations to specific timestamps/pages/lines

### 3. **Privacy-First**
- Local processing option for sensitive data
- Encrypted sync (E2E encryption option)
- Zero-knowledge backend possible
- User controls what syncs to cloud

### 4. **Real-Time Intelligence**
- Server-Sent Events (SSE) for streaming responses
- WebSocket for real-time collaboration (Phase 3)
- Background jobs for indexing (Celery + Redis)
- Smart caching (Redis) for frequent queries

---

## 🏗️ Enhanced Architecture Components

### New Services to Add

#### 1. Multi-Modal Processing Service
```
backend/app/services/multimodal/
├── __init__.py
├── ocr_service.py          # Tesseract for scanned PDFs
├── table_extractor.py      # Extract tables from PDFs
├── audio_transcriber.py    # Whisper for audio/video
├── code_parser.py          # AST parsing for code
├── image_analyzer.py       # Vision API for diagrams
└── unified_indexer.py      # Combine all into PageIndex
```

#### 2. Enhanced Annotation Service
```
backend/app/services/annotations/
├── __init__.py
├── voice_processor.py      # Process voice notes
├── smart_tagger.py         # AI-powered tag suggestions
├── summary_generator.py    # Summarize annotations
├── spaced_repetition.py    # Schedule review reminders
└── search_service.py       # Full-text annotation search
```

#### 3. Reasoning & Intelligence Service
```
backend/app/services/intelligence/
├── __init__.py
├── chain_of_thought.py     # Multi-step reasoning
├── fact_checker.py         # Verify against corpus
├── citation_graph.py       # Build knowledge graphs
├── topic_clusterer.py      # Auto-cluster documents
└── smart_queue.py          # Predict next reading
```

---

## Project Structure

```
ownNBLM/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── config.py               # Configuration management
│   │   ├── database.py             # Database setup (SQLAlchemy)
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── source.py           # Source ORM model
│   │   │   ├── document.py         # Document ORM model
│   │   │   ├── session.py          # Session ORM model
│   │   │   ├── message.py          # Message ORM model
│   │   │   ├── annotation.py       # Annotation ORM model
│   │   │   └── index_job.py        # IndexJob ORM model
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── source.py           # Pydantic schemas
│   │   │   ├── document.py
│   │   │   ├── session.py
│   │   │   ├── message.py
│   │   │   └── annotation.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── sources.py      # Source endpoints
│   │   │   │   ├── documents.py    # Document endpoints
│   │   │   │   ├── sessions.py     # Session endpoints
│   │   │   │   ├── chat.py         # Chat/streaming endpoints
│   │   │   │   ├── annotations.py  # Annotation endpoints
│   │   │   │   └── settings.py     # Settings endpoints
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── watch_service.py    # File watching with watchdog
│   │   │   ├── ingest_service.py   # Document ingestion pipeline
│   │   │   ├── index_service.py    # PageIndex orchestration
│   │   │   ├── retrieval_agent.py  # RAG agent with OpenRouter
│   │   │   └── citation_service.py # Citation generation
│   │   ├── workers/
│   │   │   ├── __init__.py
│   │   │   └── index_worker.py     # Background indexing jobs
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── format_converter.py # DOCX/TXT to MD/PDF
│   │       └── file_utils.py       # File operations
│   ├── alembic/                    # Database migrations
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/
│   │   └── ...
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── .env.example
├── frontend/                       # Your React app (already built)
│   └── ...
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

---

## 1. Database Schema (SQLAlchemy Models)

### 1.1 `backend/app/models/source.py`

```python
from sqlalchemy import Column, String, Boolean, DateTime, Integer
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime

class Source(Base):
    __tablename__ = "sources"
    
    id = Column(String, primary_key=True, index=True)
    path = Column(String, nullable=False, unique=True)
    label = Column(String, nullable=False)
    watch_enabled = Column(Boolean, default=True)
    last_scan_at = Column(DateTime, nullable=True)
    status = Column(String, default='idle')  # idle, scanning, indexing, error
    document_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    documents = relationship("Document", back_populates="source", cascade="all, delete-orphan")
```

### 1.2 `backend/app/models/document.py`

```python
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
import enum

class DocumentFormat(str, enum.Enum):
    PDF = "pdf"
    MD = "md"
    DOCX = "docx"
    TXT = "txt"

class IndexStatus(str, enum.Enum):
    PENDING = "pending"
    INDEXED = "indexed"
    ERROR = "error"

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String, primary_key=True, index=True)
    source_id = Column(String, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    relative_path = Column(String, nullable=False)
    format = Column(Enum(DocumentFormat), nullable=False)
    page_count = Column(Integer, nullable=True)
    index_status = Column(Enum(IndexStatus), default=IndexStatus.PENDING)
    file_size = Column(Integer, nullable=False)  # bytes
    file_hash = Column(String, nullable=True)  # SHA256 for change detection
    pageindex_workspace_ref = Column(String, nullable=True)  # Path to PageIndex workspace
    last_modified = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    indexed_at = Column(DateTime, nullable=True)
    
    # Relationships
    source = relationship("Source", back_populates="documents")
    annotations = relationship("Annotation", back_populates="document", cascade="all, delete-orphan")
```

### 1.3 `backend/app/models/session.py`

```python
from sqlalchemy import Column, String, DateTime, Integer, JSON, Enum
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
import enum

class SessionMode(str, enum.Enum):
    CORPUS = "corpus"
    SCOPED = "scoped"

class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    mode = Column(Enum(SessionMode), nullable=False)
    doc_ids = Column(JSON, default=list)  # List of document IDs for scoped sessions
    created_at = Column(DateTime, default=datetime.utcnow)
    last_message_at = Column(DateTime, default=datetime.utcnow)
    message_count = Column(Integer, default=0)
    
    # Relationships
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
    annotations = relationship("Annotation", back_populates="session", cascade="all, delete-orphan")
```

### 1.4 `backend/app/models/message.py`

```python
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
import enum

class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"

class Message(Base):
    __tablename__ = "messages"
    
    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    citations = Column(JSON, nullable=True)  # List of citation objects
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    session = relationship("Session", back_populates="messages")
```

### 1.5 `backend/app/models/annotation.py`

```python
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
import enum

class AnnotationType(str, enum.Enum):
    NOTE = "note"
    HIGHLIGHT = "highlight"
    BOOKMARK = "bookmark"

class Annotation(Base):
    __tablename__ = "annotations"
    
    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    doc_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    type = Column(Enum(AnnotationType), nullable=False)
    content = Column(Text, nullable=False)
    anchor = Column(JSON, nullable=False)  # {page?: int, lineStart?: int, lineEnd?: int}
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    session = relationship("Session", back_populates="annotations")
    document = relationship("Document", back_populates="annotations")
```

### 1.6 `backend/app/models/index_job.py`

```python
from sqlalchemy import Column, String, DateTime, Float, Text, Enum
from app.database import Base
from datetime import datetime
import enum

class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class IndexJob(Base):
    __tablename__ = "index_jobs"
    
    id = Column(String, primary_key=True, index=True)
    doc_id = Column(String, nullable=False, index=True)
    status = Column(Enum(JobStatus), default=JobStatus.QUEUED)
    progress = Column(Float, default=0.0)  # 0.0 to 1.0
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)
```

---

## 2. Core Services

### 2.1 Watch Service (`backend/app/services/watch_service.py`)

```python
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import hashlib
import os
from typing import Dict, Set
from app.models.source import Source
from app.models.document import Document
from app.services.ingest_service import IngestService
from sqlalchemy.orm import Session as DBSession

class DocumentChangeHandler(FileSystemEventHandler):
    def __init__(self, source_id: str, db: DBSession, ingest_service: IngestService):
        self.source_id = source_id
        self.db = db
        self.ingest_service = ingest_service
        self.supported_extensions = {'.pdf', '.md', '.docx', '.txt', '.doc'}
    
    def on_created(self, event):
        if not event.is_directory and self._is_supported(event.src_path):
            self.ingest_service.queue_document(self.source_id, event.src_path)
    
    def on_modified(self, event):
        if not event.is_directory and self._is_supported(event.src_path):
            # Check if file hash changed
            if self._file_changed(event.src_path):
                self.ingest_service.queue_document(self.source_id, event.src_path, is_update=True)
    
    def on_deleted(self, event):
        if not event.is_directory:
            self.ingest_service.remove_document(self.source_id, event.src_path)
    
    def _is_supported(self, path: str) -> bool:
        return os.path.splitext(path)[1].lower() in self.supported_extensions
    
    def _file_changed(self, path: str) -> bool:
        # Compare file hash with database
        new_hash = self._compute_hash(path)
        doc = self.db.query(Document).filter(
            Document.source_id == self.source_id,
            Document.relative_path == os.path.relpath(path, self.source.path)
        ).first()
        return not doc or doc.file_hash != new_hash
    
    def _compute_hash(self, path: str) -> str:
        sha256 = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

class WatchService:
    def __init__(self):
        self.observers: Dict[str, Observer] = {}
    
    def start_watching(self, source: Source, db: DBSession, ingest_service: IngestService):
        if source.id in self.observers:
            return
        
        event_handler = DocumentChangeHandler(source.id, db, ingest_service)
        observer = Observer()
        observer.schedule(event_handler, source.path, recursive=True)
        observer.start()
        self.observers[source.id] = observer
    
    def stop_watching(self, source_id: str):
        if source_id in self.observers:
            self.observers[source_id].stop()
            self.observers[source_id].join()
            del self.observers[source_id]
    
    def stop_all(self):
        for observer in self.observers.values():
            observer.stop()
        for observer in self.observers.values():
            observer.join()
        self.observers.clear()
```

### 2.2 Ingest Service (`backend/app/services/ingest_service.py`)

```python
import os
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session as DBSession
from app.models.document import Document, DocumentFormat, IndexStatus
from app.models.index_job import IndexJob, JobStatus
from app.utils.format_converter import FormatConverter
from app.services.index_service import IndexService

class IngestService:
    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)
        self.converter = FormatConverter()
    
    def queue_document(self, source_id: str, file_path: str, is_update: bool = False):
        """Queue a document for ingestion and indexing"""
        db = get_db()  # Get DB session from context
        
        try:
            # Get file info
            stat = os.stat(file_path)
            file_hash = self._compute_hash(file_path)
            relative_path = os.path.relpath(file_path, source.path)
            
            # Determine format
            ext = os.path.splitext(file_path)[1].lower()
            format_map = {'.pdf': DocumentFormat.PDF, '.md': DocumentFormat.MD, 
                         '.docx': DocumentFormat.DOCX, '.txt': DocumentFormat.TXT}
            doc_format = format_map.get(ext)
            
            if not doc_format:
                return
            
            # Check if document exists
            doc = db.query(Document).filter(
                Document.source_id == source_id,
                Document.relative_path == relative_path
            ).first()
            
            if doc and doc.file_hash == file_hash:
                return  # No changes
            
            # Create or update document
            if not doc:
                doc = Document(
                    id=f"doc-{hashlib.md5(file_path.encode()).hexdigest()}",
                    source_id=source_id,
                    name=os.path.basename(file_path),
                    relative_path=relative_path,
                    format=doc_format,
                    file_size=stat.st_size,
                    file_hash=file_hash,
                    last_modified=datetime.fromtimestamp(stat.st_mtime),
                    index_status=IndexStatus.PENDING
                )
                db.add(doc)
            else:
                doc.file_hash = file_hash
                doc.file_size = stat.st_size
                doc.last_modified = datetime.fromtimestamp(stat.st_mtime)
                doc.index_status = IndexStatus.PENDING
            
            db.commit()
            
            # Queue index job
            job = IndexJob(
                id=f"job-{doc.id}-{int(datetime.now().timestamp())}",
                doc_id=doc.id,
                status=JobStatus.QUEUED
            )
            db.add(job)
            db.commit()
            
        except Exception as e:
            db.rollback()
            raise e
    
    def remove_document(self, source_id: str, file_path: str):
        """Remove deleted document from database"""
        db = get_db()
        relative_path = os.path.relpath(file_path, source.path)
        doc = db.query(Document).filter(
            Document.source_id == source_id,
            Document.relative_path == relative_path
        ).first()
        
        if doc:
            db.delete(doc)
            db.commit()
    
    def _compute_hash(self, path: str) -> str:
        sha256 = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
```

### 2.3 Format Converter (`backend/app/utils/format_converter.py`)

```python
import mammoth
from pathlib import Path
import re

class FormatConverter:
    def docx_to_markdown(self, docx_path: str) -> str:
        """Convert DOCX to Markdown preserving headings"""
        with open(docx_path, "rb") as docx_file:
            result = mammoth.convert_to_markdown(docx_file)
            return result.value
    
    def txt_to_markdown(self, txt_path: str) -> str:
        """Convert plain text to Markdown with synthetic sections"""
        with open(txt_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Split by blank lines and create sections
        paragraphs = re.split(r'\n\s*\n', content)
        sections = []
        
        for i, para in enumerate(paragraphs, 1):
            if para.strip():
                # Use first few words as heading
                first_line = para.strip().split('\n')[0]
                heading = ' '.join(first_line.split()[:5])
                sections.append(f"## {heading}\n\n{para.strip()}")
        
        return '\n\n'.join(sections)
```

### 2.4 Index Service (PageIndex Wrapper)

```python
from pathlib import Path
from pageindex import PageIndexClient
import os

class IndexService:
    def __init__(self, workspace_root: str, openrouter_key: str):
        self.workspace_root = Path(workspace_root)
        self.client = PageIndexClient(
            workspace=str(self.workspace_root),
            api_key=openrouter_key
        )
    
    def index_document(self, doc: Document, source_path: str) -> str:
        """Index a document with PageIndex, returns workspace ref"""
        file_path = os.path.join(source_path, doc.relative_path)
        
        if doc.format == DocumentFormat.PDF:
            result = self.client.index_pdf(file_path)
        elif doc.format == DocumentFormat.MD:
            result = self.client.index_markdown(file_path)
        elif doc.format == DocumentFormat.DOCX:
            # Convert to MD first
            md_content = FormatConverter().docx_to_markdown(file_path)
            temp_md = self.workspace_root / f"{doc.id}.md"
            temp_md.write_text(md_content)
            result = self.client.index_markdown(str(temp_md))
            temp_md.unlink()
        elif doc.format == DocumentFormat.TXT:
            md_content = FormatConverter().txt_to_markdown(file_path)
            temp_md = self.workspace_root / f"{doc.id}.md"
            temp_md.write_text(md_content)
            result = self.client.index_markdown(str(temp_md))
            temp_md.unlink()
        
        return result['workspace_ref']
    
    def get_document_tree(self, workspace_ref: str):
        """Get PageIndex tree structure for a document"""
        return self.client.get_structure(workspace_ref)
    
    def get_page_content(self, workspace_ref: str, pages: list):
        """Extract specific pages/sections"""
        return self.client.get_content(workspace_ref, pages)
```

### 2.5 Retrieval Agent (`backend/app/services/retrieval_agent.py`)

```python
from typing import AsyncGenerator, List, Dict
from app.services.index_service import IndexService
from litellm import acompletion
import json

class RetrievalAgent:
    def __init__(self, index_service: IndexService, model: str, api_key: str):
        self.index_service = index_service
        self.model = model
        self.api_key = api_key
        self.tools = self._build_tools()
    
    def _build_tools(self):
        return [
            {
                "type": "function",
                "function": {
                    "name": "get_document_structure",
                    "description": "Get the hierarchical structure of a document to understand its organization",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "doc_id": {"type": "string", "description": "Document ID"}
                        },
                        "required": ["doc_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_page_content",
                    "description": "Extract specific pages or sections from a document",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "doc_id": {"type": "string"},
                            "pages": {"type": "array", "items": {"type": "integer"}}
                        },
                        "required": ["doc_id", "pages"]
                    }
                }
            }
        ]
    
    async def stream_response(
        self, 
        messages: List[Dict], 
        doc_scope: List[str] = None
    ) -> AsyncGenerator[Dict, None]:
        """Stream agent response with tool calls"""
        
        # Initial system prompt
        system = """You are a helpful research assistant with access to a corpus of documents.
        Answer questions by retrieving relevant content from the documents.
        Always cite your sources with specific page numbers."""
        
        conversation = [{"role": "system", "content": system}] + messages
        
        while True:
            response = await acompletion(
                model=f"openrouter/{self.model}",
                messages=conversation,
                tools=self.tools,
                stream=True,
                api_key=self.api_key
            )
            
            # Process streaming response
            async for chunk in response:
                if chunk.choices[0].delta.content:
                    yield {"type": "content", "content": chunk.choices[0].delta.content}
                
                if chunk.choices[0].delta.tool_calls:
                    # Execute tool call
                    tool_call = chunk.choices[0].delta.tool_calls[0]
                    result = await self._execute_tool(tool_call, doc_scope)
                    
                    # Add tool result to conversation
                    conversation.append({
                        "role": "assistant",
                        "tool_calls": [tool_call]
                    })
                    conversation.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result)
                    })
                    
                    # Continue generation
                    break
            
            # Check if done
            if chunk.choices[0].finish_reason == "stop":
                break
    
    async def _execute_tool(self, tool_call, doc_scope):
        """Execute PageIndex tool"""
        func_name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)
        
        if func_name == "get_document_structure":
            doc = get_document(args["doc_id"])
            return self.index_service.get_document_tree(doc.pageindex_workspace_ref)
        
        elif func_name == "get_page_content":
            doc = get_document(args["doc_id"])
            return self.index_service.get_page_content(
                doc.pageindex_workspace_ref,
                args["pages"]
            )
```

---

## 3. FastAPI Routes

### 3.1 Chat Endpoint with SSE Streaming

```python
# backend/app/api/routes/chat.py

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.services.retrieval_agent import RetrievalAgent
from app.schemas.message import MessageCreate
import json

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.post("/sessions/{session_id}/messages/stream")
async def stream_chat(
    session_id: str,
    message: MessageCreate,
    agent: RetrievalAgent = Depends(get_agent)
):
    async def event_stream():
        # Get session context
        session = get_session(session_id)
        messages = get_messages(session_id)
        
        # Convert to LLM format
        llm_messages = [{"role": m.role, "content": m.content} for m in messages]
        llm_messages.append({"role": "user", "content": message.content})
        
        # Stream response
        full_content = ""
        citations = []
        
        async for chunk in agent.stream_response(llm_messages, session.doc_ids):
            if chunk["type"] == "content":
                full_content += chunk["content"]
                yield f"data: {json.dumps({'content': chunk['content']})}\n\n"
            elif chunk["type"] == "citation":
                citations.append(chunk["citation"])
        
        # Send final citations
        if citations:
            yield f"data: {json.dumps({'citations': citations})}\n\n"
        
        # Save to database
        save_message(session_id, "assistant", full_content, citations)
        
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

## 4. Deployment

### 4.1 `docker-compose.yml` (Development)

```yaml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: ownnblm
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: ownnblm
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
  
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app
      - ./pageindex_workspace:/workspace
      - ./user_documents:/documents
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://ownnblm:devpassword@db:5432/ownnblm
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      WORKSPACE_ROOT: /workspace
    depends_on:
      - db
  
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    command: npm run dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:8000

volumes:
  postgres_data:
```

### 4.2 `docker-compose.prod.yml` (Production)

```yaml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ownnblm
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always
  
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    command: gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
    volumes:
      - pageindex_workspace:/workspace
      - user_documents:/documents:ro
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/ownnblm
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      OPENROUTER_MODEL: ${OPENROUTER_MODEL}
      WORKSPACE_ROOT: /workspace
    depends_on:
      - db
    restart: always
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./frontend/dist:/usr/share/nginx/html
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    depends_on:
      - backend
    restart: always
  
  certbot:
    image: certbot/certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    command: certonly --webroot --webroot-path=/var/www/certbot --email ${ADMIN_EMAIL} --agree-tos --no-eff-email -d ${DOMAIN}

volumes:
  postgres_data:
  pageindex_workspace:
  user_documents:
```

### 4.3 Windows Local Install Script

```python
# install.py
import os
import sys
import subprocess
from pathlib import Path

def install_ownnblm():
    """Install ownNBLM on Windows"""
    
    # Check Python version
    if sys.version_info < (3, 11):
        print("Error: Python 3.11+ required")
        sys.exit(1)
    
    # Create workspace
    home = Path.home()
    workspace = home / ".ownnblm"
    workspace.mkdir(exist_ok=True)
    
    # Create subdirectories
    (workspace / "workspace").mkdir(exist_ok=True)
    (workspace / "logs").mkdir(exist_ok=True)
    
    # Install backend dependencies
    print("Installing dependencies...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-e", "backend"])
    
    # Create SQLite database
    from backend.app.database import Base, engine
    Base.metadata.create_all(bind=engine)
    
    print(f"\n✓ ownNBLM installed to {workspace}")
    print("\nNext steps:")
    print("1. Set OPENROUTER_API_KEY environment variable")
    print("2. Run: ownnblm serve")

if __name__ == "__main__":
    install_ownnblm()
```

---

## 5. Next Steps

### Phase 1 Implementation Order:

1. **Database Setup** (Week 1)
   - Implement all SQLAlchemy models
   - Set up Alembic migrations
   - Create initial seed data

2. **Core Services** (Week 2-3)
   - Implement IngestService with format converters
   - Build IndexService with PageIndex integration
   - Create WatchService with watchdog

3. **API Routes** (Week 3-4)
   - Build CRUD endpoints for sources, documents, sessions
   - Implement streaming chat endpoint with SSE
   - Add annotation endpoints

4. **Retrieval Agent** (Week 4-5)
   - Port agentic loop from PageIndex demo
   - Integrate OpenRouter via LiteLLM
   - Implement citation extraction

5. **Testing & Integration** (Week 5-6)
   - End-to-end testing
   - Frontend-backend integration
   - Performance optimization

### Key Dependencies:

```txt
# backend/requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy==2.0.36
alembic==1.14.0
psycopg2-binary==2.9.10
pydantic==2.10.3
python-dotenv==1.0.1
watchdog==6.0.0
mammoth==1.8.0
litellm==1.56.3
pageindex==0.2.0  # Your local package
aiofiles==24.1.0
python-multipart==0.0.20
```

---

## 6. Environment Variables

```bash
# .env.example

# Database
DATABASE_URL=sqlite:///./ownnblm.db  # Local dev
# DATABASE_URL=postgresql://user:pass@localhost:5432/ownnblm  # Production

# OpenRouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openrouter/anthropic/claude-sonnet-4

# PageIndex
WORKSPACE_ROOT=./pageindex_workspace

# Application
SECRET_KEY=your_secret_key_here
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# File Watching
WATCH_INTERVAL=60

# Logging
LOG_LEVEL=INFO
```

---

This implementation plan provides a complete blueprint for building the ownNBLM backend. Start with Phase 1, implement incrementally, and test each component before moving to the next.
