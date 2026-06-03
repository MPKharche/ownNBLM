# ownNBLM

Self-hosted NotebookLM alternative — multi-tenant SaaS knowledge assistant with document-grounded RAG, citations, sessions, billing, and sharing.

**Plan (source of truth):** [PLAN.md](./PLAN.md) · Cursor: `ownnblm_saas_platform_a0261da2.plan.md`

## Status: Phases 1–3 (dev-complete)

| Phase | Delivered |
|-------|-----------|
| **1** | Monorepo, ingest (chunk+embed), SSE chat, citations, corpus UI, health, Huey, PageIndex sibling dep |
| **2** | Multi-session chat, source scoping, notes API, read-only share links |
| **3** | JWT auth, usage/credits (Decimal), billing plans + Stripe checkout stub, PWA, `docker-compose.prod.yml` |

Phase 4+ (admin console, team annotations, public API) remain in PLAN.md.

## Quick start (local)

```powershell
cd ownNBLM
make sync-key          # copies OPENROUTER_API_KEY from ../PageIndex or ../ca-saas
make install
make migrate
make seed              # indexes Attention paper sample PDF (~42 chunks)
```

**Terminal 1 — API**

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — UI**

```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173** → Chat → ask e.g. *"What are Attention Residuals?"*

- Login: `admin@ownnblm.local` / `admin123`
- Dev header (no login): `X-Dev-User-Id: 00000000-0000-4000-8000-000000000001`

## Production

```powershell
# Set ENVIRONMENT=production, SECRET_KEY, DATABASE_URL, STRIPE_* in .env
docker compose -f docker-compose.prod.yml up --build
```

Frontend nginx proxies `/api` → API. Use Postgres + Redis from prod compose.

## Verified (2026-06-03)

- `pytest` — 7 passed (health, rate limits, usage, share links, **live OpenRouter chat SSE**)
- `npm run build` — production bundle + PWA service worker
- UI flows — login/register, corpus upload, SSE chat + citations, share link, billing usage
- Sample corpus: *Attention Residuals* PDF (42 chunks, embeddings via OpenRouter)
- Prod stack: `docker compose -f docker-compose.prod.yml up --build`

## API highlights

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/auth/login` | JWT login |
| `GET/POST /api/v1/sources` | Corpus upload/list |
| `POST /api/v1/sessions/{id}/chat` | Streaming RAG (SSE) |
| `GET /api/v1/usage/dashboard` | Credits & storage |
| `GET /api/v1/share/{token}` | Public read-only session |
| `GET /health` | DB, storage, OpenRouter, queue |
| `GET /metrics` | Prometheus |

## Monorepo layout

| Path | Purpose |
|------|---------|
| `backend/` | FastAPI, SQLAlchemy, LiteLLM → OpenRouter |
| `frontend/` | React 19, Vite, shadcn, Framer Motion |
| `../PageIndex` | Editable dependency |
| `scripts/sync_env_key.py` | Sync API key from sibling projects |
| `src/` | Legacy frontend prototype (pre-monorepo) |

## Documentation (legacy + design)

Earlier planning docs and the standalone UI prototype remain in the repo:

- [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) — TOC trees, hybrid retrieval, schemas
- [ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md) — vs Page Index + Grimmory
- [FULL_STACK_SETUP_GUIDE.md](./FULL_STACK_SETUP_GUIDE.md) — deployment guide
- [FULLSTACK_DEVELOPMENT_PLAN.md](./FULLSTACK_DEVELOPMENT_PLAN.md) — 14-week roadmap
- [BACKEND_IMPLEMENTATION_PLAN.md](./BACKEND_IMPLEMENTATION_PLAN.md) — backend design notes

## License

MIT — see [LICENSE](./LICENSE) if present.
