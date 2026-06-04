# ownNBLM — Post-MVP roadmap (Phase 4+)

**Status (June 2026):** Production is **paused** (maintenance page). **Phase 4+ and Phase 5 are implemented** in `main` (backend + `/admin` UI, auth, public API). Resume prod to expose them publicly.

---

## Phase 4 — Identity & workspace auth

**PLAN todo:** `auth-better-auth`  
**Goal:** Replace minimal JWT email/password with full auth UX and team onboarding.

| Deliverable | Notes |
|-------------|--------|
| Better Auth integration | Email/password, session cookies or JWT, secure refresh |
| Google OAuth | Social login; account linking |
| Magic link | Passwordless option for researchers |
| Workspace invites | Pending-invite table, email flow, owner/member roles |
| Org on login | `org_id` + tier on every session; no dev headers in prod |

**Out of UI until done:** No “Phase 4” labels, no disabled Google button — feature ships complete or hidden.

**Acceptance:** Sign up/login via Google + email; invite second user to Team workspace; existing corpus/chat unchanged.

---

## Phase 4 — Business-tier dedicated runtime

**PLAN todo:** `hybrid-provisioner`  
**Goal:** Business ($79/mo) orgs run on isolated stacks, not shared Postgres row-only tenancy.

| Deliverable | Notes |
|-------------|--------|
| Portainer (or equivalent) provisioner | `POST /api/stacks` from signup webhook |
| Per-org Compose template | API + worker + Postgres + Redis + MinIO |
| Traefik routing | `{org-slug}.ownnblm.com` → dedicated stack |
| Tenant resolver | `app/core/tenancy.py` routes DB + storage by org tier |

**Acceptance:** New Business org gets subdomain; data isolated from shared pool; migrate-down path documented.

---

## Phase 4 — Admin console

**PLAN todo:** `admin-console`  
**Goal:** Workspace owners self-serve members, keys, and billing without support.

| Deliverable | Notes |
|-------------|--------|
| Member management | List, invite, remove, role change |
| Per-member storage view | Usage breakdown by user |
| API key rotation | Org-scoped keys for integrations (precursor to public API) |
| Stripe Customer Portal link | Embedded or redirect from admin |
| Audit log | `audit_events`: session access, ingest, billing changes |

**Acceptance:** Owner can remove member, open billing portal, see last 30 days audit entries.

---

## Phase 4 — Team collaboration

**PLAN todo:** `team-annotations`  
**Goal:** Team tier value beyond shared login — corpus and sessions are collaborative.

| Deliverable | Notes |
|-------------|--------|
| Shared sources default | Workspace-visible corpus; optional private source flag |
| Async annotations | Comments on shared read-only sessions |
| Weekly digest email | Resend/Postmark: query count + topic summary |

**Acceptance:** Two members see same indexed source; annotation on share link visible to team; digest sends in staging.

---

## Phase 5 — Public API v1

**PLAN todo:** `public-api`  
**Goal:** Developer and integration ICP; same backend, explicit external contract.

| Deliverable | Notes |
|-------------|--------|
| Versioned REST surface | Documented `/api/v1/` subset (ingest, sessions, chat, citations) |
| API key management | Scopes: read-only, ingest, full |
| Outbound webhooks | `session.answer_generated`, `source.indexed` |
| OpenAPI | Hosted docs (e.g. `docs.ownnblm.com`) |
| Citation export | Zotero / BibTeX / RIS from session |

**Acceptance:** API key can create source + run chat; webhook receives `source.indexed`; OpenAPI matches live routes.

---

## Resume production (when ready)

1. **VPS:** `bash /opt/ownnblm/scripts/vps_restart_api.sh` (or restore `docker-compose.vps.yml` app service and `git pull`).
2. **Vercel:** Restore app `vercel.json` (frontend build + API rewrites to VPS) from commit before pause, or from `frontend/vercel.json` + root monorepo config in git history.
3. **Verify:** `powershell -File scripts/e2e_prod_smoke.ps1`

---

## Explicit non-goals (unchanged)

See `PLAN.md` — white-label, native apps, HIPAA, real-time co-editing remain deferred.
