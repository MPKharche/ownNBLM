# ownNBLM

Self-hosted NotebookLM alternative — multi-tenant SaaS knowledge assistant with document-grounded RAG, citations, sessions, billing, and sharing.

## Production (June 2026)

| | |
|--|--|
| **Public URL** | [frontend-jet-ten-16.vercel.app](https://frontend-jet-ten-16.vercel.app) — maintenance page |
| **API host** | VPS `195.35.6.159:8010` — **stopped** (`docker compose -f docker-compose.vps.yml down`) |
| **Vercel config** | `vercel.json` → `pause-site` (no API proxy) |
| **Live app config** | Saved in `vercel.app.json` for resume |
| **Billing** | Razorpay — registration pending ([docs/BILLING_RAZORPAY.md](./docs/BILLING_RAZORPAY.md)) |
| **Email** | Resend configured on VPS for magic links ([docs/PROD_RESUME.md](./docs/PROD_RESUME.md)) |

Production is **on hold** until a backend can handle ingest, chat SSE, and Postgres reliably. See [docs/HOSTING.md](./docs/HOSTING.md).

## Local development

Secrets stay in **`.env`** (gitignored) on your machine. Production uses a **separate** `.env` on the VPS — keys and URLs may differ; see [`.env.production.example`](./.env.production.example).

```powershell
make sync-key    # optional: copy OPENROUTER_API_KEY from ../PageIndex
make install
make migrate
make seed
```

**Terminal 1 — API** (`8001` if port 8000 is blocked on Windows):

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

**Terminal 2 — UI**

```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173** · Login: `admin@ownnblm.local` / `admin123`

### Resume production

1. `powershell -File scripts/unpause_prod.ps1`
2. `Copy-Item vercel.app.json vercel.json` → `cd frontend && npx vercel deploy --prod`
3. On VPS: `bash scripts/vps_restart_api.sh` after `git pull`
4. Smoke test: `powershell -File scripts/e2e_prod_smoke.ps1`

Full checklist: [docs/PROD_RESUME.md](./docs/PROD_RESUME.md)

### Pause production

```powershell
powershell -File scripts/pause_prod.ps1
```

## Stack (when running)

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite, shadcn — deployed on Vercel |
| **API** | FastAPI, SQLAlchemy, LiteLLM → OpenRouter |
| **Data** | Postgres + Redis + local/S3 file storage |
| **Deploy** | `docker-compose.prod.yml` / `docker-compose.vps.yml` |

## API (production)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/auth/login` | JWT login |
| `GET/POST /api/v1/sources` | Corpus upload/list |
| `POST /api/v1/sessions/{id}/chat` | Streaming RAG (SSE) |
| `GET /api/v1/usage/dashboard` | Credits & storage |
| `GET /api/v1/share/{token}` | Public read-only session |
| `GET /health` | DB, storage, LLM, queue |

## Documentation

- [PLAN.md](./PLAN.md) — platform plan and production status
- [ROADMAP.md](./ROADMAP.md) — Phase 4+ scope
- [docs/HOSTING.md](./docs/HOSTING.md) — why production is paused
- [docs/PROD_RESUME.md](./docs/PROD_RESUME.md) — resume checklist

## License

MIT
