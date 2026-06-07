# ownNBLM

Self-hosted NotebookLM alternative — multi-tenant SaaS knowledge assistant with document-grounded RAG, citations, sessions, billing, and sharing.

**Plan (source of truth):** [PLAN.md](./PLAN.md) · Cursor: `ownnblm_saas_platform_a0261da2.plan.md`

## Status

| Layer | State |
|-------|--------|
| **MVP (Phases 1–3)** | Complete in `main` — local dev and CI |
| **Production** | **On hold** — [maintenance page](https://frontend-jet-ten-16.vercel.app); VPS API stopped; **local dev only** ([HOSTING.md](./docs/HOSTING.md)) |
| **Phase 4+ / 5** | Implemented — [ROADMAP.md](./ROADMAP.md); Admin UI at `/admin` when app is running |

| Phase | Delivered (MVP) |
|-------|-----------------|
| **1** | Monorepo, ingest (chunk+embed), SSE chat, citations, corpus UI, health, Huey |
| **2** | Multi-session chat, source scoping, notes API, read-only share links |
| **3** | JWT auth, usage/credits (Decimal), billing (Razorpay default; Stripe optional), PWA |

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

## Production (on hold — local only)

| | |
|--|--|
| **Public URL** | [frontend-jet-ten-16.vercel.app](https://frontend-jet-ten-16.vercel.app) — maintenance page (no live app or API) |
| **API** | VPS stopped; not suitable for current load. **Vercel cannot host this FastAPI stack** without a full redesign ([HOSTING.md](./docs/HOSTING.md)) |
| **Use now** | Local Quick start above (`uvicorn` + `npm run dev` on localhost) |

**Pause:** `powershell -File scripts/pause_prod.ps1` · **Resume (later):** `scripts/unpause_prod.ps1` + `vercel.app.json` · Choose a stronger backend (Render, Fly, larger VPS, etc.) before going public again.

## Billing (India-first)

Default provider is **Razorpay** (INR plans, international cards). Stripe is optional via `PAYMENT_PROVIDER=stripe`. Setup: [docs/BILLING_RAZORPAY.md](./docs/BILLING_RAZORPAY.md). Copy keys from [.env.example](./.env.example).

## Verified (2026-06-03)

- `pytest` — 20 passed (health, Phase 4/5, hardening, live OpenRouter chat SSE when keyed)
- `npm run test` + `npm run build` — Vitest + production bundle + PWA
- Playwright smoke — `cd e2e && npm run test` (starts API + UI via config)
- UI flows — login/register, corpus upload, SSE chat + citations, share link, billing usage + **LLM burn meter**
- Sample corpus: *Attention Residuals* PDF (42 chunks, embeddings via OpenRouter)
- Prod stack: `docker compose -f docker-compose.prod.yml up --build`

## LLM burn control

Default cap: **$0.005 (0.5¢) per 48 hours** (global). Configure in `.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_BUDGET_ENABLED` | `true` | Enforce rolling USD cap |
| `LLM_BUDGET_USD` | `0.005` | Max spend per window |
| `LLM_BUDGET_WINDOW_HOURS` | `48` | Rolling window |
| `LLM_BUDGET_SCOPE` | `global` | `global` or `org` |
| `LLM_MAX_OUTPUT_TOKENS` | `512` | Chat output cap (quality-safe) |
| `LLM_RETRIEVAL_TOP_K` | `5` | Chunks per query (was 8) |
| `LLM_MAX_CHUNK_CHARS` | `800` | Context per chunk (was 1200) |

Burn is tracked on `/api/v1/usage/dashboard` and `/health` (`llm_burn`). Chat and ingest block when cap is reached.

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

## Documentation

- [PLAN.md](./PLAN.md) — platform plan, MVP todos, production status
- [ROADMAP.md](./ROADMAP.md) — **Phase 4+** (Better Auth/OAuth, dedicated Business containers, admin console, team annotations, public API v1)

Legacy / design references:

- [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) — TOC trees, hybrid retrieval, schemas
- [ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md) — vs Page Index + Grimmory
- [FULL_STACK_SETUP_GUIDE.md](./FULL_STACK_SETUP_GUIDE.md) — deployment guide
- [FULLSTACK_DEVELOPMENT_PLAN.md](./FULLSTACK_DEVELOPMENT_PLAN.md) — 14-week roadmap
- [BACKEND_IMPLEMENTATION_PLAN.md](./BACKEND_IMPLEMENTATION_PLAN.md) — backend design notes

## License

MIT — see [LICENSE](./LICENSE) if present.
