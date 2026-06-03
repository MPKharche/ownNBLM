# ownNBLM Full Stack Setup Guide

This guide walks you through setting up the complete ownNBLM application with both frontend and backend.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Development)](#quick-start-development)
3. [Production Deployment](#production-deployment)
4. [Architecture Overview](#architecture-overview)
5. [Integrating the Frontend Prototype](#integrating-the-frontend-prototype)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Python 3.11+** with pip
- **Node.js 18+** with npm/pnpm
- **PostgreSQL 15+** (for production) or SQLite (for development)
- **Git**
- **Docker & Docker Compose** (optional, for containerized deployment)

### Required API Keys

- **OpenRouter API Key**: Get from [openrouter.ai/keys](https://openrouter.ai/keys)
- Supports Claude, GPT-4, Gemini, and other models

---

## Quick Start (Development)

### 1. Clone and Setup Repository

```bash
# Create project directory
mkdir ownNBLM
cd ownNBLM

# Initialize git
git init
```

### 2. Setup Backend

```bash
# Create backend directory
mkdir -p backend/app

# Copy backend code from BACKEND_IMPLEMENTATION_PLAN.md
# Or clone from your repository

# Create virtual environment
cd backend
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install PageIndex (your local package)
pip install -e ../../PageIndex

# Setup environment variables
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY

# Run database migrations
alembic upgrade head

# Start backend server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at `http://localhost:8000`

### 3. Setup Frontend

```bash
# In a new terminal, from project root
cd frontend

# Install dependencies
pnpm install

# Update API endpoint
# Create .env.local file:
echo "VITE_API_URL=http://localhost:8000" > .env.local

# Start dev server
pnpm run dev
```

Frontend will be available at `http://localhost:5173`

### 4. Initial Configuration

1. Open `http://localhost:5173` in your browser
2. Navigate to Settings
3. Enter your OpenRouter API key
4. Select your preferred model (e.g., Claude Sonnet 4)
5. Add your first source folder

---

## Integrating the Frontend Prototype

The frontend prototype you have is production-ready and only needs backend connectivity.

### Update API Service

Replace the mock API with real backend calls:

```typescript
// src/app/services/api.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class API {
  // Replace mock implementations with real fetch calls
  
  async getSources(): Promise<Source[]> {
    const response = await fetch(`${API_BASE}/api/sources`);
    return response.json();
  }

  async addSource(path: string, label: string): Promise<Source> {
    const response = await fetch(`${API_BASE}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, label })
    });
    return response.json();
  }

  async sendMessage(sessionId: string, content: string): Promise<Message> {
    const response = await fetch(
      `${API_BASE}/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      }
    );
    return response.json();
  }

  async *streamAssistantResponse(
    sessionId: string,
    userMessage: string
  ): AsyncGenerator<{ content: string; citations?: Citation[] }> {
    const response = await fetch(
      `${API_BASE}/api/chat/sessions/${sessionId}/messages/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMessage })
      }
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // Implement other methods similarly...
}

export const api = new API();
```

### Enable CORS in Backend

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ownNBLM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Production Deployment

### Option 1: Docker Compose (Recommended)

```bash
# Create production environment file
cp .env.example .env.prod

# Edit .env.prod with production values:
# - Strong POSTGRES_PASSWORD
# - Your domain name
# - Production OPENROUTER_API_KEY

# Build and start services
docker-compose -f docker-compose.prod.yml up -d

# Setup SSL with Let's Encrypt
docker-compose -f docker-compose.prod.yml run certbot

# Reload nginx
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Option 2: VPS Manual Deployment

```bash
# On your VPS (Ubuntu/Debian)

# Install dependencies
sudo apt update
sudo apt install -y python3.11 python3-pip nodejs npm postgresql nginx

# Clone repository
git clone https://github.com/yourusername/ownNBLM.git
cd ownNBLM

# Setup PostgreSQL
sudo -u postgres createuser ownnblm
sudo -u postgres createdb ownnblm
sudo -u postgres psql -c "ALTER USER ownnblm PASSWORD 'your_password';"

# Setup backend
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn

# Setup environment
cp .env.example .env
# Edit .env with production values

# Run migrations
alembic upgrade head

# Setup systemd service
sudo nano /etc/systemd/system/ownnblm-backend.service
```

**Backend Service File:**

```ini
[Unit]
Description=ownNBLM Backend
After=network.target postgresql.service

[Service]
Type=notify
User=www-data
WorkingDirectory=/var/www/ownNBLM/backend
Environment="PATH=/var/www/ownNBLM/backend/venv/bin"
ExecStart=/var/www/ownNBLM/backend/venv/bin/gunicorn \
    app.main:app \
    -w 4 \
    -k uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Start backend
sudo systemctl enable ownnblm-backend
sudo systemctl start ownnblm-backend

# Build frontend
cd ../frontend
npm install
npm run build

# Copy to nginx
sudo cp -r dist/* /var/www/html/

# Configure nginx
sudo nano /etc/nginx/sites-available/ownnblm
```

**Nginx Configuration:**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /var/www/html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE Streaming
    location /api/chat {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ownnblm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Setup SSL with Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Sources  │  │   Chat   │  │ Sessions │  │ Settings │   │
│  │  Panel   │  │Interface │  │  Panel   │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST API / SSE
┌───────────────────────────┴─────────────────────────────────┐
│                    FastAPI Backend                           │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Watch   │  │  Ingest   │  │  Index   │  │Retrieval │  │
│  │ Service  │→ │  Service  │→ │ Service  │→ │  Agent   │  │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘  │
└───────────┬─────────────────────────┬───────────────────────┘
            │                         │
    ┌───────┴────────┐       ┌────────┴────────┐
    │   PostgreSQL   │       │   PageIndex     │
    │   (Metadata)   │       │  (Workspaces)   │
    └────────────────┘       └─────────────────┘
                                      │
                              ┌───────┴───────┐
                              │  OpenRouter   │
                              │ (LLM API)     │
                              └───────────────┘
```

### Data Flow

1. **Document Ingestion**
   - User adds source folder → WatchService monitors
   - New file detected → IngestService queues
   - Format conversion (DOCX/TXT → MD)
   - PageIndex creates hierarchical tree
   - Metadata stored in PostgreSQL

2. **Chat Query**
   - User sends question → ChatInterface
   - Backend receives via POST `/api/chat/sessions/{id}/messages/stream`
   - RetrievalAgent initiates agentic loop:
     - Analyze query
     - Search document trees (PageIndex)
     - Extract relevant pages/sections
     - Generate answer with citations
   - Stream response via SSE
   - Frontend renders markdown + citations

3. **Citation Click**
   - User clicks citation → DocumentViewer opens
   - Backend serves file with `/api/documents/{id}/file`
   - Viewer scrolls to anchor (page/line)

---

## File Structure Reference

```
ownNBLM/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Settings
│   │   ├── database.py          # SQLAlchemy setup
│   │   ├── models/              # ORM models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── api/routes/          # API endpoints
│   │   ├── services/            # Business logic
│   │   └── utils/               # Helpers
│   ├── alembic/                 # DB migrations
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx          # Main component
│   │   │   ├── types.ts         # TypeScript types
│   │   │   ├── components/      # UI components
│   │   │   └── services/        # API client
│   │   ├── styles/
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── pageindex_workspace/         # PageIndex data
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

---

## Troubleshooting

### Backend Won't Start

```bash
# Check Python version
python --version  # Should be 3.11+

# Check database connection
psql -U ownnblm -d ownnblm -h localhost

# Check logs
tail -f backend/logs/app.log

# Verify environment variables
cat .env
```

### Frontend API Errors

```bash
# Check CORS configuration in backend
# Verify VITE_API_URL in .env.local

# Test API directly
curl http://localhost:8000/api/sources

# Check browser console for errors
# Check Network tab in DevTools
```

### Document Indexing Fails

```bash
# Check PageIndex installation
python -c "import pageindex; print(pageindex.__version__)"

# Check workspace permissions
ls -la pageindex_workspace/

# Check OpenRouter API key
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"

# View indexing logs
tail -f backend/logs/indexing.log
```

### File Watching Not Working

```bash
# Test watchdog
python -c "from watchdog.observers import Observer; print('OK')"

# Check folder permissions
ls -la /path/to/watched/folder

# On Windows, try running as Administrator

# For external drives, increase polling interval in settings
```

### Docker Issues

```bash
# Check Docker status
docker ps

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Check volumes
docker volume ls
```

---

## Performance Optimization

### Backend

1. **Enable Redis caching** for PageIndex trees
2. **Use connection pooling** for PostgreSQL
3. **Configure Gunicorn workers** based on CPU cores
4. **Enable response compression** in nginx

### Frontend

1. **Lazy load** document viewer components
2. **Virtual scrolling** for long message lists
3. **Debounce** search inputs
4. **Code splitting** with React.lazy

### Database

```sql
-- Add indexes for common queries
CREATE INDEX idx_documents_source_id ON documents(source_id);
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_annotations_session_id ON annotations(session_id);
```

---

## Monitoring

### Health Check Endpoint

```python
# backend/app/api/routes/health.py
@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "database": await check_db_connection(),
        "pageindex": await check_pageindex_service(),
        "openrouter": await check_openrouter_api()
    }
```

### Logging

```python
# backend/app/main.py
import logging
from logging.handlers import RotatingFileHandler

# Configure logging
handler = RotatingFileHandler(
    "logs/app.log",
    maxBytes=10485760,  # 10MB
    backupCount=5
)
logging.basicConfig(
    handlers=[handler],
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

---

## Next Steps After Setup

1. **Add Sample Documents**: Test with your own PDFs, DOCX, MD files
2. **Configure OpenRouter Model**: Try different models for different use cases
3. **Create Scoped Sessions**: Test with specific document subsets
4. **Add Annotations**: Bookmark and highlight important sections
5. **Export Capabilities**: Implement session export to Markdown/PDF

---

## Additional Resources

- [PageIndex Documentation](https://pageindex.ai/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [React Router Documentation](https://reactrouter.com/)

---

## Support

For issues and questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review backend logs in `backend/logs/`
- Check browser console for frontend errors
- Verify environment variables are set correctly

---

**You now have everything needed to build and deploy ownNBLM!** Start with the Quick Start guide above, then move to production deployment when ready.
