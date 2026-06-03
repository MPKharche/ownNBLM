# Full-Stack Development Plan - ownNBLM

## 🎯 Overview

This document outlines the complete roadmap for transforming ownNBLM from a frontend prototype to a production-ready full-stack application with real backend infrastructure, database persistence, and cloud deployment.

## ✅ Completed Frontend Features

### Phase 1: UI/UX Foundation ✓
- [x] Modern design system with Inter font
- [x] Consistent color palette (Indigo/Purple theme)
- [x] Smooth animations and transitions
- [x] Responsive layouts
- [x] Dark/Light mode support

### Phase 2: Core Features ✓
- [x] Session management menu
- [x] Sources panel for document organization
- [x] Annotations panel (highlights, notes, comments)
- [x] Real-time sync across components
- [x] LocalStorage persistence
- [x] Immersive reading mode

### Phase 3: Authentication ✓
- [x] Username/password authentication UI
- [x] Google OAuth integration (UI ready)
- [x] Auth context and state management
- [x] Protected routes
- [x] User menu and logout

---

## 🚀 Backend Development Phases

### Phase 1: Infrastructure Setup (Weeks 1-2)

#### 1.1 Technology Stack Selection
**Backend Framework:**
- **Primary Choice:** Node.js + Express.js + TypeScript
- **Alternative:** Python + FastAPI (if AI/ML heavy)

**Database:**
- **Primary:** PostgreSQL (structured data, relations)
- **Vector DB:** Pinecone / Weaviate / ChromaDB (document embeddings)
- **Cache:** Redis (sessions, temporary data)

**Cloud Infrastructure:**
- **Hosting:** AWS / Google Cloud / Azure
- **Options:**
  - AWS: EC2, RDS, S3, Lambda
  - GCP: Cloud Run, Cloud SQL, Cloud Storage
  - Azure: App Service, Azure Database

**File Storage:**
- **AWS S3** or **Google Cloud Storage** for document uploads

#### 1.2 Development Environment
```bash
# Backend structure
/backend
  /src
    /controllers   # API route handlers
    /services      # Business logic
    /models        # Database models
    /middleware    # Auth, validation, etc.
    /routes        # API routes
    /utils         # Helpers
    /config        # Environment configs
  /tests
  /migrations      # Database migrations
  package.json
  tsconfig.json
  .env.example
```

#### 1.3 Database Schema Design

**Users Table:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255), -- nullable for OAuth users
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  oauth_provider VARCHAR(50), -- 'google', 'github', etc.
  oauth_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP
);
```

**Sources Table:**
```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  label VARCHAR(255) NOT NULL,
  watch_enabled BOOLEAN DEFAULT true,
  last_scan_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'idle',
  document_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Documents Table:**
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  relative_path TEXT NOT NULL,
  format VARCHAR(50) NOT NULL,
  file_size BIGINT,
  page_count INTEGER,
  index_status VARCHAR(50) DEFAULT 'pending',
  storage_url TEXT, -- S3/GCS URL
  embedding_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_modified TIMESTAMP
);
```

**Document Chunks Table (for embeddings):**
```sql
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  embedding_vector vector(1536), -- OpenAI ada-002 dimension
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON document_chunks 
  USING ivfflat (embedding_vector vector_cosine_ops); -- pgvector
```

**Sessions Table:**
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  mode VARCHAR(50) NOT NULL, -- 'corpus' or 'scoped'
  doc_ids UUID[], -- Array of document IDs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP,
  message_count INTEGER DEFAULT 0
);
```

**Messages Table:**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  citations JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Message Annotations Tables:**
```sql
CREATE TABLE message_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  color VARCHAR(50) NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE message_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  offset INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE message_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  offset INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Document Annotations Table:**
```sql
CREATE TABLE document_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'highlight', 'note', 'bookmark'
  content TEXT,
  page_number INTEGER,
  line_start INTEGER,
  line_end INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Phase 2: Core Backend Services (Weeks 3-5)

#### 2.1 Authentication Service
- Implement JWT-based authentication
- Password hashing with bcrypt
- Google OAuth 2.0 integration
- Session management
- Token refresh mechanism
- Password reset flow

**Tech Stack:**
- `passport.js` for authentication strategies
- `jsonwebtoken` for JWT
- `bcrypt` for password hashing
- `express-session` + Redis for sessions

#### 2.2 User Management API
```typescript
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/google
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
PUT    /api/users/profile
PUT    /api/users/password
DELETE /api/users/account
```

#### 2.3 Sources & Documents API
```typescript
// Sources
GET    /api/sources
POST   /api/sources
GET    /api/sources/:id
PUT    /api/sources/:id
DELETE /api/sources/:id
POST   /api/sources/:id/scan

// Documents
GET    /api/documents
GET    /api/documents/:id
POST   /api/documents/upload
DELETE /api/documents/:id
GET    /api/documents/:id/content
```

#### 2.4 File Upload & Processing Service
- Multipart file upload handling
- File validation (type, size)
- S3/GCS upload
- PDF parsing (pdf-parse, pdfjs)
- Text extraction
- Metadata extraction

**Libraries:**
- `multer` for file uploads
- `aws-sdk` or `@google-cloud/storage`
- `pdf-parse` for PDF processing
- `mammoth` for DOCX files

---

### Phase 3: AI/RAG Implementation (Weeks 6-8)

#### 3.1 Document Embedding Service
- Chunk documents into semantic segments
- Generate embeddings using OpenAI API
- Store vectors in vector database
- Batch processing for large documents

**Implementation:**
```typescript
// Embedding pipeline
1. Document uploaded → S3
2. Extract text → chunks (1000 chars with overlap)
3. Generate embeddings → OpenAI ada-002
4. Store in vector DB (Pinecone/Weaviate)
5. Update document status
```

#### 3.2 RAG (Retrieval-Augmented Generation) System
- Vector similarity search
- Context retrieval
- Prompt engineering
- Citation extraction
- Response streaming

**Tech Stack:**
- OpenAI API (GPT-4, GPT-3.5-turbo)
- LangChain (optional, for RAG orchestration)
- Vector database client (Pinecone SDK, etc.)

**API Endpoints:**
```typescript
POST   /api/chat/message
GET    /api/chat/sessions
POST   /api/chat/sessions
GET    /api/chat/sessions/:id/messages
DELETE /api/chat/sessions/:id
```

#### 3.3 Real-time Streaming
- Server-Sent Events (SSE) for streaming responses
- WebSocket alternative for bidirectional communication

```typescript
// Streaming implementation
POST /api/chat/stream
  → Returns SSE stream
  → Chunks: {content, citations, done}
```

---

### Phase 4: Advanced Features (Weeks 9-11)

#### 4.1 Annotations API
```typescript
// Highlights
POST   /api/messages/:id/highlights
DELETE /api/highlights/:id

// Notes
POST   /api/messages/:id/notes
PUT    /api/notes/:id
DELETE /api/notes/:id

// Comments
POST   /api/messages/:id/comments
PUT    /api/comments/:id
DELETE /api/comments/:id

// Document annotations
POST   /api/documents/:id/annotations
GET    /api/documents/:id/annotations
DELETE /api/annotations/:id
```

#### 4.2 Search & Filters
- Full-text search across messages
- Filter by date, source, session
- Search within documents
- Advanced query syntax

**Tech:**
- PostgreSQL full-text search
- Elasticsearch (optional, for advanced search)

#### 4.3 Export & Sharing
- Export sessions as markdown/PDF
- Share session links
- Export annotations
- Backup data

```typescript
GET    /api/sessions/:id/export?format=md|pdf
POST   /api/sessions/:id/share
GET    /api/export/user-data
```

#### 4.4 Analytics & Insights
- User activity tracking
- Session statistics
- Document usage analytics
- Learning patterns

---

### Phase 5: DevOps & Deployment (Weeks 12-14)

#### 5.1 CI/CD Pipeline
```yaml
# GitHub Actions example
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    - Build Docker images
    - Run tests
    - Deploy to staging
    - Integration tests
    - Deploy to production
```

#### 5.2 Infrastructure as Code
**Terraform/CloudFormation:**
- Database provisioning
- S3 buckets
- Load balancers
- Auto-scaling groups
- CDN (CloudFront/Cloud CDN)

#### 5.3 Monitoring & Logging
- Application logs: Winston/Pino
- Error tracking: Sentry
- APM: New Relic / Datadog
- Uptime monitoring: Pingdom
- Log aggregation: CloudWatch / Stackdriver

#### 5.4 Security Hardening
- Rate limiting (express-rate-limit)
- CORS configuration
- Helmet.js for HTTP headers
- SQL injection prevention
- XSS protection
- CSRF tokens
- Input validation (Joi, Zod)

#### 5.5 Performance Optimization
- Redis caching
- Database query optimization
- CDN for static assets
- Image optimization
- Lazy loading
- Connection pooling
- Load balancing

---

## 📊 Development Timeline

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1-2 | Infrastructure | Database, backend setup, CI/CD |
| 3-5 | Core Backend | Auth, CRUD APIs, file upload |
| 6-8 | AI/RAG | Embeddings, chat, streaming |
| 9-11 | Advanced Features | Annotations API, search, export |
| 12-14 | DevOps | Production deployment, monitoring |

**Total Duration:** ~14 weeks (3.5 months)

---

## 🛠 Technology Stack Summary

### Frontend (Current)
- React + TypeScript
- Tailwind CSS v4
- React Router
- LocalStorage (to be replaced)

### Backend (To Implement)
- Node.js + Express + TypeScript
- PostgreSQL (primary database)
- Pinecone/Weaviate (vector database)
- Redis (caching & sessions)
- AWS S3 / Google Cloud Storage

### AI/ML
- OpenAI API (GPT-4, embeddings)
- LangChain (optional)
- Vector similarity search

### DevOps
- Docker + Docker Compose
- GitHub Actions (CI/CD)
- AWS/GCP/Azure (hosting)
- Terraform (IaC)
- Nginx (reverse proxy)

### Monitoring
- Sentry (error tracking)
- Datadog/New Relic (APM)
- CloudWatch/Stackdriver (logs)

---

## 💰 Cost Estimates (Monthly)

### Infrastructure
- Database (PostgreSQL): $50-200
- Vector DB (Pinecone): $70-300
- Redis (ElastiCache): $50-100
- Storage (S3): $20-100
- Compute (EC2/Cloud Run): $100-500
- CDN: $20-100

### AI/ML
- OpenAI API:
  - Embeddings: $0.0001/1K tokens
  - GPT-4: $0.03/1K input + $0.06/1K output
  - Est: $500-2000/month (usage-based)

### Services
- Monitoring (Sentry): $26+
- Domain + SSL: $15-50
- Email service: $10-50

**Total: $800-3500/month** (scales with usage)

---

## 🎯 Success Metrics

### Technical
- API response time < 200ms (p95)
- Uptime > 99.9%
- Chat response latency < 2s
- Document processing < 30s per PDF

### Business
- User registration rate
- Daily active users (DAU)
- Session completion rate
- Document upload volume
- Query accuracy (user feedback)

---

## 🚧 Migration Strategy

### Phase 1: Parallel Run
1. Deploy backend with API
2. Keep LocalStorage as fallback
3. Add feature flags
4. Gradual user migration

### Phase 2: Data Migration
1. Export LocalStorage data
2. Import to PostgreSQL via API
3. Verify data integrity
4. Switch to backend-only

### Phase 3: Cleanup
1. Remove LocalStorage code
2. Remove mock data
3. Full backend integration
4. Performance optimization

---

## 📚 Additional Resources

### Documentation Needed
- API documentation (OpenAPI/Swagger)
- Database schema docs
- Deployment guide
- User onboarding guide
- Admin dashboard
- Troubleshooting guide

### Testing Strategy
- Unit tests (Jest)
- Integration tests (Supertest)
- E2E tests (Playwright)
- Load testing (k6, Artillery)
- Security testing (OWASP)

---

## 🎉 Next Steps

1. **Set up backend repository**
2. **Initialize database** (PostgreSQL + pgvector)
3. **Implement authentication** (JWT + Google OAuth)
4. **Build file upload service** (S3 + processing)
5. **Integrate OpenAI API** (embeddings + chat)
6. **Deploy to staging environment**
7. **User testing & iteration**
8. **Production launch**

---

**Status:** Ready for backend implementation 🚀
