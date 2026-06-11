# Hosting — paused (local only)

## Current state (June 2026)

| Layer | Status |
|-------|--------|
| **Public site** | [frontend-jet-ten-16.vercel.app](https://frontend-jet-ten-16.vercel.app) — maintenance page |
| **VPS API** | Stopped (`docker compose -f docker-compose.vps.yml down`); volumes retained |
Production is on hold until a backend can handle ingest, chat SSE, and Postgres reliably.

## Why not Vercel as the backend?

The API is a **FastAPI** app with:

- Long-running **ingest** (PDF parse, chunk, embed) in background threads
- **SSE chat** streams (minutes-long connections)
- **Postgres** + Alembic migrations
- Optional **folder watch**, Huey task queue, file storage on disk

Vercel serverless is built for short-lived HTTP handlers (typically ≤60s, no persistent processes). Moving here would mean a **new architecture**, not a config change:

- Database: Neon / Supabase / Vercel Postgres
- Files: R2 / Vercel Blob
- Ingest + embeddings: background jobs (Inngest, QStash, or a small always-on worker elsewhere)
- Chat: streaming within serverless limits or edge-compatible design

That is a separate project phase. For local work, use `.env` (dev secrets) — production `.env` on the VPS is separate and may use different keys.

## Local operation

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

```powershell
cd frontend
npm run dev
```

See [README](../README.md#local-development). Templates: `.env.example` (local) · `.env.production.example` (VPS).

## Resume production (when ready)

Pick a backend that can stay up under load (not the previous undersized VPS unless upgraded):

1. `powershell -File scripts/unpause_prod.ps1`
2. Start API on chosen host; point `vercel.app.json` rewrites at it
3. `Copy-Item vercel.app.json vercel.json` and `npx vercel deploy --prod` from repo root

See [PROD_RESUME.md](./PROD_RESUME.md) for billing/email/migrate checklist.
