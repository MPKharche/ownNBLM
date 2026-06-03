# Frontend-Backend Integration Checklist

This checklist helps you connect the prototype frontend to the real backend.

---

## Prerequisites

- ✅ Backend running on `http://localhost:8000`
- ✅ Frontend development server ready
- ✅ PostgreSQL/SQLite database initialized
- ✅ OpenRouter API key configured

---

## 1. Update Frontend API Client

### Location: `src/app/services/api.ts`

Replace the `MockAPI` class with real HTTP calls. Here's a quick reference:

### Sources API

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async getSources(): Promise<Source[]> {
  const res = await fetch(`${API_BASE}/api/sources`);
  if (!res.ok) throw new Error('Failed to fetch sources');
  return res.json();
}

async addSource(path: string, label: string): Promise<Source> {
  const res = await fetch(`${API_BASE}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, label })
  });
  return res.json();
}

async updateSource(id: string, updates: Partial<Source>): Promise<Source> {
  const res = await fetch(`${API_BASE}/api/sources/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

async deleteSource(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/sources/${id}`, { method: 'DELETE' });
}

async rescanSource(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/sources/${id}/rescan`, { method: 'POST' });
}
```

### Documents API

```typescript
async getDocuments(sourceId?: string): Promise<Document[]> {
  const url = sourceId 
    ? `${API_BASE}/api/documents?source_id=${sourceId}`
    : `${API_BASE}/api/documents`;
  const res = await fetch(url);
  return res.json();
}

async getDocument(id: string): Promise<Document | null> {
  const res = await fetch(`${API_BASE}/api/documents/${id}`);
  if (res.status === 404) return null;
  return res.json();
}
```

### Sessions API

```typescript
async getSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/api/sessions`);
  return res.json();
}

async createSession(name: string, docIds: string[]): Promise<Session> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, doc_ids: docIds })
  });
  return res.json();
}

async deleteSession(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' });
}
```

### Messages API

```typescript
async getMessages(sessionId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
  return res.json();
}

async sendMessage(sessionId: string, content: string): Promise<Message> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  return res.json();
}
```

### Streaming Chat (SSE)

```typescript
async *streamAssistantResponse(
  sessionId: string,
  userMessage: string
): AsyncGenerator<{ content: string; citations?: Citation[] }> {
  const res = await fetch(
    `${API_BASE}/api/chat/sessions/${sessionId}/messages/stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: userMessage })
    }
  );

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          yield parsed;
        } catch (e) {
          console.warn('Failed to parse SSE data:', data);
        }
      }
    }
  }
}
```

### Annotations API

```typescript
async getAnnotations(sessionId: string): Promise<Annotation[]> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/annotations`);
  return res.json();
}

async createAnnotation(
  sessionId: string,
  docId: string,
  type: Annotation['type'],
  content: string,
  anchor: Annotation['anchor']
): Promise<Annotation> {
  const res = await fetch(`${API_BASE}/api/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, doc_id: docId, type, content, anchor })
  });
  return res.json();
}

async deleteAnnotation(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/annotations/${id}`, { method: 'DELETE' });
}
```

### Settings API

```typescript
async getSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/api/settings`);
  return res.json();
}

async saveSettings(settings: Partial<AppSettings>): Promise<void> {
  await fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
}
```

---

## 2. Environment Configuration

### Frontend `.env.local`

```bash
VITE_API_URL=http://localhost:8000
```

### Backend `.env`

```bash
# Database
DATABASE_URL=sqlite:///./ownnblm.db
# Or for PostgreSQL:
# DATABASE_URL=postgresql://ownnblm:password@localhost:5432/ownnblm

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openrouter/anthropic/claude-sonnet-4

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# PageIndex
WORKSPACE_ROOT=./pageindex_workspace

# File Watching
WATCH_INTERVAL=60
```

---

## 3. Backend CORS Configuration

### Location: `backend/app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

app = FastAPI(title="ownNBLM API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(','),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 4. API Route Mapping

### Backend Routes Structure

```python
# backend/app/api/routes/__init__.py

from fastapi import APIRouter
from app.api.routes import sources, documents, sessions, chat, annotations, settings

api_router = APIRouter(prefix="/api")

api_router.include_router(sources.router, tags=["sources"])
api_router.include_router(documents.router, tags=["documents"])
api_router.include_router(sessions.router, tags=["sessions"])
api_router.include_router(chat.router, tags=["chat"])
api_router.include_router(annotations.router, tags=["annotations"])
api_router.include_router(settings.router, tags=["settings"])
```

### Expected Endpoints

```
POST   /api/sources
GET    /api/sources
PATCH  /api/sources/{id}
DELETE /api/sources/{id}
POST   /api/sources/{id}/rescan

GET    /api/documents
GET    /api/documents/{id}
GET    /api/documents/{id}/file

GET    /api/sessions
POST   /api/sessions
DELETE /api/sessions/{id}

GET    /api/sessions/{id}/messages
POST   /api/sessions/{id}/messages
POST   /api/chat/sessions/{id}/messages/stream

GET    /api/sessions/{id}/annotations
POST   /api/annotations
DELETE /api/annotations/{id}

GET    /api/settings
PUT    /api/settings
```

---

## 5. Error Handling

### Frontend Error Handler

```typescript
// src/app/utils/errorHandler.ts

export async function handleApiError(error: any) {
  if (error.response) {
    // Server responded with error
    const message = error.response.data?.detail || 'Server error';
    console.error('API Error:', message);
    return message;
  } else if (error.request) {
    // Request made but no response
    console.error('Network Error: No response from server');
    return 'Unable to connect to server. Is the backend running?';
  } else {
    // Something else happened
    console.error('Error:', error.message);
    return error.message;
  }
}

// Usage in API client
try {
  const response = await fetch(...);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
} catch (error) {
  const message = await handleApiError(error);
  // Show user-friendly error
  toast.error(message);
  throw error;
}
```

### Backend Error Responses

```python
# backend/app/api/routes/sources.py

from fastapi import HTTPException

@router.post("/sources")
async def create_source(source: SourceCreate, db: Session = Depends(get_db)):
    try:
        # Check if path exists
        if not os.path.exists(source.path):
            raise HTTPException(
                status_code=400,
                detail=f"Path does not exist: {source.path}"
            )
        
        # Create source
        result = await source_service.create(db, source)
        return result
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create source: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
```

---

## 6. Testing Integration

### Test Backend Health

```bash
# Check if backend is running
curl http://localhost:8000/health

# Test sources endpoint
curl http://localhost:8000/api/sources

# Test with CORS
curl -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://localhost:8000/api/sources
```

### Test Frontend API Calls

```typescript
// src/app/services/api.test.ts

import { api } from './api';

async function testConnection() {
  try {
    const sources = await api.getSources();
    console.log('✅ Connection successful:', sources);
  } catch (error) {
    console.error('❌ Connection failed:', error);
  }
}

testConnection();
```

---

## 7. Type Synchronization

Make sure TypeScript types match backend Pydantic schemas:

### Frontend Types (`src/app/types.ts`)

```typescript
export interface Source {
  id: string;
  path: string;
  label: string;
  watch_enabled: boolean;  // Note: snake_case from backend
  last_scan_at: string | null;
  status: 'idle' | 'scanning' | 'indexing' | 'error';
  document_count: number;
}
```

### Backend Schema (`backend/app/schemas/source.py`)

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class SourceBase(BaseModel):
    path: str
    label: str
    watch_enabled: bool = True

class SourceCreate(SourceBase):
    pass

class SourceUpdate(BaseModel):
    label: Optional[str] = None
    watch_enabled: Optional[bool] = None

class SourceResponse(SourceBase):
    id: str
    last_scan_at: Optional[datetime] = None
    status: str = "idle"
    document_count: int = 0
    
    class Config:
        from_attributes = True  # For SQLAlchemy models
```

---

## 8. Real-Time Updates

### WebSocket Connection (Optional Enhancement)

For real-time status updates:

```typescript
// src/app/services/websocket.ts

class WebSocketService {
  private ws: WebSocket | null = null;

  connect() {
    this.ws = new WebSocket('ws://localhost:8000/ws');
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'index_progress') {
        // Update UI with indexing progress
        updateIndexProgress(data.doc_id, data.progress);
      }
      
      if (data.type === 'source_updated') {
        // Refresh sources list
        refreshSources();
      }
    };
  }
}
```

---

## 9. Deployment Checklist

### Development

- [ ] Backend running on `http://localhost:8000`
- [ ] Frontend running on `http://localhost:5173`
- [ ] CORS configured for `localhost:5173`
- [ ] Database initialized with migrations
- [ ] OpenRouter API key set in backend `.env`
- [ ] Test API calls from frontend

### Production

- [ ] Frontend built with `pnpm run build`
- [ ] Backend configured with PostgreSQL
- [ ] CORS configured for production domain
- [ ] HTTPS certificates installed
- [ ] Environment variables set correctly
- [ ] Nginx reverse proxy configured
- [ ] Health check endpoint responding

---

## 10. Troubleshooting

### Common Issues

**CORS errors in browser console:**
```
Access to fetch at 'http://localhost:8000/api/sources' from origin 
'http://localhost:5173' has been blocked by CORS policy
```
**Fix:** Check `CORS_ORIGINS` in backend `.env` includes `http://localhost:5173`

**SSE streaming not working:**
```
EventSource failed: net::ERR_INCOMPLETE_CHUNKED_ENCODING
```
**Fix:** Disable response buffering in nginx:
```nginx
location /api/chat {
    proxy_pass http://localhost:8000;
    proxy_buffering off;
}
```

**API returns 404:**
```
GET http://localhost:8000/api/sources 404 (Not Found)
```
**Fix:** Check that API router is included in main FastAPI app

**WebSocket connection refused:**
```
WebSocket connection to 'ws://localhost:8000/ws' failed
```
**Fix:** Implement WebSocket endpoint in backend or remove WebSocket code

---

## Next Steps

1. ✅ Replace `MockAPI` with real HTTP calls in `src/app/services/api.ts`
2. ✅ Configure environment variables
3. ✅ Enable CORS in backend
4. ✅ Test each API endpoint
5. ✅ Implement error handling
6. ✅ Add loading states and optimistic updates
7. ✅ Deploy to production

---

**Once integrated, your ownNBLM application will be fully functional!**

For detailed backend implementation, see [BACKEND_IMPLEMENTATION_PLAN.md](./BACKEND_IMPLEMENTATION_PLAN.md).
