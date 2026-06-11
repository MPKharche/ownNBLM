# ownNBLM â€” Agile Delivery Document v1.0

**Project:** ownNBLM (Self-hosted NotebookLM Alternative)
**Stack:** React 19 + Vite + shadcn/ui + FastAPI + SQLAlchemy + LiteLLM/OpenRouter + Huey + SQLite/Postgres
**Document Owner:** Product / QA Architecture
**Last Updated:** 2026-06-11
**Sprint Cycle:** 2-week sprints

---

## Table of Contents

1. [Sprint 1 â€” Launch Readiness](#sprint-1--launch-readiness)
2. [Sprint 2 â€” Core Loop Polish](#sprint-2--core-loop-polish)
3. [Sprint 3 â€” Differentiation](#sprint-3--differentiation)
4. [Sprint 4 â€” Scale & Monetization](#sprint-4--scale--monetization)
5. [Master Regression Suite](#master-regression-suite)
6. [Release Gate Checklists](#release-gate-checklists)

---

## Sprint 1 â€” Launch Readiness

**Sprint Goal:** Ship a production-worthy baseline â€” clean UI copy, working session titles, real-time feedback, persistent preferences, credit alerts, and safe destructive-action dialogs.

**Stories:** S1-01 through S1-06

---

### S1-01 â€” Remove Scaffold Copy from Dashboard

**User Story**
As a **first-time user**, I want to see a meaningful dashboard with real app content, so that I am not confused by placeholder developer text when I first open the app.

**Persona:** First-time user / Product owner demoing to stakeholders

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The user navigates to `/` or `/dashboard` after login | The DashboardPage renders | No text matching "Phase 1 scaffold", "TODO", "scaffold", "placeholder", "lorem ipsum", or any dev-comment copy is visible in the DOM or rendered output |
| AC2 | The user is a new tenant with no data | The DashboardPage renders | The page displays a real empty-state component (e.g., "No sources uploaded yet â€” go to Corpus to add your first document") instead of hardcoded static strings |
| AC3 | The user is an existing tenant with sessions and sources | The DashboardPage renders | SectionCards and ChartAreaInteractive reflect real data (session count, source count, credit usage) fetched from the API, not hardcoded numbers |
| AC4 | A developer inspects `DashboardPage.tsx` line 22 and surrounding block | Code review | All hardcoded scaffold strings are removed; any templated copy is stored in a `constants/copy.ts` file or i18n key, not inline JSX strings |

**Success Metrics**

- 0 occurrences of "scaffold", "Phase 1", or "TODO" in rendered HTML of `/dashboard` (automated scan in CI)
- Lighthouse accessibility score on DashboardPage â‰¥ 90 (no empty heading/aria violations from removed copy)
- 0 stakeholder-reported confusion events about placeholder copy in first 30 days post-launch

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S1-01-01 | Unit | Scaffold copy absence in DashboardPage component | 1. Import `DashboardPage` in Jest. 2. Render with `@testing-library/react`. 3. Run `queryByText(/scaffold/i)`, `queryByText(/phase 1/i)`, `queryByText(/TODO/i)`. | All three queries return `null` | All assertions pass |
| TC-S1-01-02 | Unit | SectionCards receives real prop data | 1. Mock API call `GET /api/v1/dashboard/stats`. 2. Render `DashboardPage`. 3. Assert `SectionCards` receives non-null, non-empty `stats` prop. | `SectionCards` renders with live stat values | Prop assertions pass |
| TC-S1-01-03 | Integration | Dashboard API endpoint returns valid stats | 1. Seed test DB with 2 sessions, 3 sources. 2. `GET /api/v1/dashboard/stats` with valid JWT. 3. Assert response shape: `{ sessions: 2, sources: 3, credits_used: number }`. | 200 response with correct counts | HTTP 200, JSON schema valid |
| TC-S1-01-04 | E2E | Dashboard renders without scaffold text (Playwright) | 1. Login as test user. 2. Navigate to `/`. 3. `expect(page.locator('text=Phase 1 scaffold')).not.toBeVisible()`. 4. `expect(page.locator('text=TODO')).not.toBeVisible()`. | Neither selector matches any visible element | Playwright assertions pass |
| TC-S1-01-05 | Manual | Stakeholder walk-through of dashboard | 1. Login as a demo user. 2. Visually inspect all dashboard sections. 3. Check SectionCards, chart, and any headline text. | No developer copy visible anywhere on the page | QA sign-off: zero placeholder text sighted |
| TC-S1-01-06 | Manual | Empty-state dashboard (new tenant) | 1. Create a fresh tenant account. 2. Navigate to `/`. 3. Verify meaningful empty-state message is shown. | Contextual empty-state with CTA to Corpus or Chat page | QA sign-off: CTA present and correct |

**Regression Scope**

- `frontend/src/pages/DashboardPage.tsx` â€” direct file changed
- `frontend/src/components/SectionCards.*` â€” prop contract may change if hardcoded defaults removed
- `frontend/src/components/ChartAreaInteractive.*` â€” may need real data wiring
- `GET /api/v1/dashboard/stats` â€” new or existing endpoint must be verified
- Route `/` and `/dashboard` â€” navigation flow must still resolve correctly after changes

---

### S1-02 â€” Auto-Title Sessions After First Reply

**User Story**
As a **knowledge worker**, I want my chat sessions to be automatically titled based on the first assistant reply, so that I can identify past conversations at a glance without manually renaming every session.

**Persona:** Knowledge worker / returning user managing multiple sessions

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A session is newly created with the default title "New Chat" (or equivalent) | The first assistant message is fully streamed and complete | The session title in the sidebar updates to a short, meaningful title derived from the first assistant reply (â‰¤ 60 chars) |
| AC2 | The title update occurs | The user is viewing the session list in the sidebar | The title change is visible without requiring a page refresh (optimistic update or SSE/websocket push) |
| AC3 | The backend receives `PATCH /api/v1/sessions/{id}` | The payload contains `{ "title": "<auto-generated>" }` | The session record in the database is updated; subsequent `GET /api/v1/sessions` returns the new title |
| AC4 | The session already has a user-defined custom title | The first (or any subsequent) assistant reply arrives | The auto-title logic does NOT overwrite the custom title |
| AC5 | The LLM call to generate a title fails or times out | After 5 seconds without a title response | The session retains its previous title ("New Chat") and no error is surfaced to the user |

**Success Metrics**

- â‰¥ 95% of new sessions receive an auto-title within 3 seconds of first assistant reply completion
- 0% regression on existing manually-renamed sessions having their title overwritten
- Title length â‰¤ 60 characters in â‰¥ 99% of cases (truncation fallback enforced)

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S1-02-01 | Unit | `generateSessionTitle` utility produces â‰¤ 60 char string | 1. Import title utility. 2. Pass a 500-word assistant reply. 3. Assert `result.length <= 60`. | Truncated or summarized title â‰¤ 60 chars | Assertion passes |
| TC-S1-02-02 | Unit | Auto-title does not overwrite custom title | 1. Create session object with `title = "My Custom Title"`, `title_is_custom = true`. 2. Call auto-title logic. 3. Assert title unchanged. | Title remains "My Custom Title" | Assertion passes |
| TC-S1-02-03 | Unit | `PATCH /api/v1/sessions/{id}` called after first reply | 1. Mock `ChatPage` state. 2. Simulate `isFirstReply = true` + stream end. 3. Assert `api.patchSession` was called once with correct payload. | `patchSession` called with `{ title: string }` | Mock call count = 1 |
| TC-S1-02-04 | Integration | PATCH sessions endpoint updates title in DB | 1. Create session via `POST /api/v1/sessions`. 2. `PATCH /api/v1/sessions/{id}` with `{ "title": "Test Title" }`. 3. `GET /api/v1/sessions/{id}`. | GET returns `{ title: "Test Title" }` | HTTP 200, title matches |
| TC-S1-02-05 | Integration | Title generation LLM call is backgrounded via Huey | 1. Send first user message in test session. 2. Monitor Huey task queue. 3. Assert a `generate_session_title` task is enqueued. | Task appears in Huey queue with correct session ID | Task enqueued within 1s of stream completion |
| TC-S1-02-06 | E2E | Session title appears in sidebar after first reply (Playwright) | 1. Login. 2. Create new session. 3. Send first message. 4. Wait for SSE stream to complete. 5. Assert sidebar title is no longer "New Chat". | Sidebar shows meaningful title | `expect(sidebar.sessionTitle).not.toBe('New Chat')` passes |
| TC-S1-02-07 | E2E | Custom title not overwritten | 1. Create session, rename it "My Research". 2. Send a message. 3. Wait for reply. 4. Assert sidebar still shows "My Research". | Title unchanged | Playwright assertion passes |
| TC-S1-02-08 | Manual | Title quality review | 1. Send 10 varied first messages across different topics. 2. Review auto-generated titles for coherence and relevance. | Titles are descriptive, not generic ("The user asked...") | QA and PM sign-off: titles are meaningful |

**Regression Scope**

- `frontend/src/pages/ChatPage.tsx` lines 73â€“100 (SSE event handler, session state)
- `backend/app/api/v1/sessions.py` â€” `PATCH /api/v1/sessions/{id}` endpoint
- `frontend/src/lib/api.ts` â€” `patchSession` function
- Session list sidebar component (title display)
- Huey task queue configuration â€” new task must be registered
- `GET /api/v1/sessions` â€” list endpoint must not regress

---

### S1-03 â€” Typing Indicator During SSE Stream

**User Story**
As a **chat user**, I want to see a visual typing indicator while the assistant is generating a response, so that I know the system is processing my query and have not sent a message into a void.

**Persona:** Chat user / any authenticated user

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The user submits a chat message | The SSE stream begins (first byte received from `/api/v1/chat/stream`) | A typing indicator (three animated dots or equivalent shadcn/Framer Motion animation) appears in the chat message area |
| AC2 | The SSE stream is active | The user observes the chat area | The typing indicator is visible until the SSE `[DONE]` event or stream close event is received |
| AC3 | The SSE stream completes or errors | The stream end event fires | The typing indicator is removed and replaced by the full assistant message (on success) or an error message (on failure) |
| AC4 | The user sends a message | The typing indicator is visible | The chat input field is disabled and the send button is in a loading state, preventing duplicate submissions |
| AC5 | The network is slow (> 3s to first token) | The user is waiting | The typing indicator remains visible throughout the wait â€” it does not disappear before the first token arrives |

**Success Metrics**

- Typing indicator appears within 100ms of SSE stream initiation (measured via Playwright network throttling test)
- 0% of sessions where indicator persists after stream completion (no stuck states)
- User satisfaction: "The chat feels responsive" rated â‰¥ 4/5 in post-launch feedback

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S1-03-01 | Unit | `isStreaming` state drives indicator visibility | 1. Render `ChatPage` with `isStreaming = true`. 2. Assert typing indicator component is in the DOM. 3. Re-render with `isStreaming = false`. 4. Assert indicator is gone. | Indicator present/absent based on state | Both assertions pass |
| TC-S1-03-02 | Unit | Send button disabled during stream | 1. Render `ChatPage` with `isStreaming = true`. 2. Assert submit button has `disabled` attribute. 3. Assert textarea has `disabled` attribute. | Both elements disabled | Both assertions pass |
| TC-S1-03-03 | Unit | Indicator removed on stream error | 1. Mock SSE stream that fires error event. 2. Assert `isStreaming` becomes `false`. 3. Assert typing indicator not in DOM. | Indicator removed on error | Assertions pass |
| TC-S1-03-04 | Integration | SSE stream lifecycle events trigger state changes | 1. Mount ChatPage against real dev server. 2. Send message. 3. Assert indicator visible between `message_start` and `[DONE]` SSE events. | State transitions match SSE lifecycle | Visual state matches event log |
| TC-S1-03-05 | E2E | Typing indicator visible in browser (Playwright) | 1. Login. 2. Navigate to `/chat`. 3. Type and submit a message. 4. `await expect(page.locator('[data-testid="typing-indicator"]')).toBeVisible()`. 5. Wait for stream to complete. 6. `await expect(page.locator('[data-testid="typing-indicator"]')).not.toBeVisible()`. | Indicator appears then disappears | Both Playwright assertions pass |
| TC-S1-03-06 | E2E | Input disabled during stream (Playwright) | 1. Submit message. 2. While stream active: `expect(page.locator('textarea')).toBeDisabled()`. | Textarea is disabled | Assertion passes |
| TC-S1-03-07 | Manual | Slow network typing indicator persistence | 1. Open Chrome DevTools â†’ Network â†’ throttle to "Slow 3G". 2. Submit a message. 3. Verify typing indicator appears immediately and persists. | Indicator visible throughout slow response | QA sign-off: no blank waiting period |
| TC-S1-03-08 | Manual | Animation quality review | 1. Submit message in production build. 2. Inspect typing indicator animation (Framer Motion). 3. Check for jank, flicker, or incorrect z-index. | Smooth, correctly positioned animation | QA sign-off: animation acceptable |

**Regression Scope**

- `frontend/src/pages/ChatPage.tsx` â€” streaming state management (lines around 73)
- SSE event handler logic â€” `onmessage`, `onerror`, `onopen` callbacks
- Chat input component â€” disabled state management
- `backend/app/services/chat_stream.py` â€” SSE event format must remain unchanged
- Send button / form submit handler â€” must not allow double-submit

---

### S1-04 â€” Persist Theme Preference to localStorage

**User Story**
As a **user with a dark mode preference**, I want my theme setting to be saved across browser sessions, so that I do not have to re-select dark mode every time I reload the app.

**Persona:** Any authenticated or unauthenticated user

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The user selects "Dark" theme via the theme toggle | The toggle is clicked | `localStorage.setItem('ownNBLM_theme', 'dark')` is called and the dark theme class is applied to `<html>` or `<body>` |
| AC2 | The user has previously set theme to "dark" | The user reloads the page or opens a new tab | The dark theme is applied immediately on initial render without a flash of light theme (FOIT) |
| AC3 | The user has previously set theme to "light" | The user reloads | The light theme is applied on load; no dark theme flash |
| AC4 | No theme preference exists in localStorage | The app loads for the first time | The system default (via `prefers-color-scheme` media query) is used as fallback |
| AC5 | The user sets theme to "system" | The toggle is set to system | The app follows the OS-level `prefers-color-scheme` and stores `'system'` in localStorage; if the OS changes, the app updates |

**Success Metrics**

- 0 flash-of-incorrect-theme (FOIT) events measurable in Playwright screenshot comparison
- Theme preference persists across 100% of page reloads in automated test
- `localStorage` key `ownNBLM_theme` present after theme selection in 100% of E2E runs

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S1-04-01 | Unit | Theme stored in localStorage on toggle | 1. Render theme toggle. 2. Click "dark". 3. Assert `localStorage.getItem('ownNBLM_theme') === 'dark'`. | localStorage updated | Assertion passes |
| TC-S1-04-02 | Unit | Theme read from localStorage on init | 1. Set `localStorage.setItem('ownNBLM_theme', 'dark')`. 2. Mount `App`. 3. Assert `document.documentElement.classList.contains('dark')`. | Dark class applied | Assertion passes |
| TC-S1-04-03 | Unit | System fallback when localStorage empty | 1. Clear localStorage. 2. Mock `window.matchMedia('(prefers-color-scheme: dark)').matches = true`. 3. Mount `App`. 4. Assert dark class applied. | System default respected | Assertion passes |
| TC-S1-04-04 | Unit | App.tsx line 41 â€” theme initialization logic | 1. Inspect `App.tsx:41`. 2. Assert the initialization reads localStorage before first render. 3. Assert no async gap that would cause FOIT. | Synchronous theme init | Code review + unit test passes |
| TC-S1-04-05 | E2E | Theme persists after reload (Playwright) | 1. Navigate to app. 2. Click dark mode toggle. 3. `page.reload()`. 4. Assert `html` element has class `dark`. | Dark mode persists | Playwright class assertion passes |
| TC-S1-04-06 | E2E | No flash of light theme on reload in dark mode | 1. Set theme to dark. 2. Reload page with Playwright screenshot at t=0ms. 3. Assert screenshot background is dark. | No white flash at load | Screenshot pixel check passes |
| TC-S1-04-07 | Manual | Theme toggle across routes | 1. Set dark mode on `/chat`. 2. Navigate to `/corpus`. 3. Navigate to `/billing`. 4. Each route should maintain dark mode. | Dark mode consistent across routes | QA sign-off |
| TC-S1-04-08 | Manual | System theme respects OS dark mode | 1. Set OS to dark mode. 2. Set app theme to "System". 3. Reload. 4. Verify dark mode active. 5. Change OS to light. 6. Verify app switches. | App follows OS | QA sign-off |

**Regression Scope**

- `frontend/src/App.tsx` line 41 and surrounding theme initialization block
- `frontend/src/lib/api.ts` â€” if theme state was previously managed here, must be migrated cleanly
- All page components using theme-dependent CSS classes
- shadcn/ui components using `dark:` Tailwind variants
- `AppShell.tsx` â€” may have its own theme logic that needs to be reconciled

---

### S1-05 â€” Surface credit_warning and burn_warning as Sonner Toasts

**User Story**
As a **subscription holder**, I want to see a non-intrusive toast notification when I am running low on credits or burning them at an unusual rate, so that I can take action before my session is interrupted.

**Persona:** Paying user / subscription holder

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The backend emits a `credit_warning` SSE event during a chat stream | The event is received in `ChatPage.tsx` | A Sonner `toast.warning("You are running low on credits â€” X credits remaining")` is displayed with an "Upgrade" action button linking to `/billing` |
| AC2 | The backend emits a `burn_warning` SSE event | The event is received | A Sonner `toast.warning("High credit burn rate detected â€” check your usage")` is displayed |
| AC3 | The same `credit_warning` fires multiple times in one session | The user is in an ongoing chat | The toast is shown at most once per session (deduplication), not on every `credit_warning` event |
| AC4 | A credit toast is shown | The user clicks the "Upgrade" CTA inside the toast | The user is navigated to `/billing` |
| AC5 | The user dismisses the toast | They click the X or the toast auto-expires | The toast is removed and does not reappear unless a new session starts |

**Success Metrics**

- 100% of `credit_warning` SSE events result in a visible toast in E2E tests
- 0% of sessions with duplicate toast spam (deduplication confirmed)
- Time from SSE event receipt to toast visible â‰¤ 200ms (Playwright timing assertion)

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S1-05-01 | Unit | `credit_warning` event triggers Sonner toast | 1. Mock SSE event stream emitting `{ type: 'credit_warning', credits_remaining: 50 }`. 2. Assert `toast.warning` called with matching message. | `toast.warning` called once | Mock call count = 1 |
| TC-S1-05-02 | Unit | `burn_warning` event triggers Sonner toast | 1. Mock SSE event emitting `{ type: 'burn_warning' }`. 2. Assert `toast.warning` called. | `toast.warning` called | Assertion passes |
| TC-S1-05-03 | Unit | Deduplication â€” second `credit_warning` in same session | 1. Emit `credit_warning` event twice. 2. Assert `toast.warning` called exactly once. | Called once, not twice | Mock call count = 1 |
| TC-S1-05-04 | Unit | Toast CTA navigates to `/billing` | 1. Render toast with action. 2. Click CTA button. 3. Assert `navigate('/billing')` called. | Navigation triggered | Mock navigate called |
| TC-S1-05-05 | Integration | `chat_stream.py` emits well-formed `credit_warning` event | 1. Stub LLM with a mock that triggers credit threshold. 2. Initiate stream. 3. Capture SSE events. 4. Assert `data: {"type": "credit_warning", "credits_remaining": N}` present in event stream. | Event emitted with correct shape | Event present in captured stream |
| TC-S1-05-06 | Integration | `chat_stream.py` emits well-formed `burn_warning` event | 1. Stub burn-rate threshold trigger. 2. Initiate stream. 3. Assert `burn_warning` event in stream. | Event present | Assertion passes |
| TC-S1-05-07 | E2E | Toast appears in browser on credit_warning (Playwright) | 1. Mock backend to emit `credit_warning`. 2. Navigate to `/chat`. 3. Send message. 4. `await expect(page.locator('[data-sonner-toast]')).toBeVisible()`. | Toast visible | Playwright assertion passes |
| TC-S1-05-08 | Manual | Toast visual quality | 1. Trigger `credit_warning` manually via dev toggle. 2. Inspect toast styling, dismiss behavior, CTA legibility. | Toast well-styled, not blocking chat content | QA sign-off |

**Regression Scope**

- `frontend/src/pages/ChatPage.tsx` lines 73+ (SSE event handler â€” must add cases for new event types)
- `backend/app/services/chat_stream.py` â€” SSE event emission logic (must not regress existing `content`, `done`, `error` events)
- Sonner `<Toaster>` mount in `App.tsx` or `AppShell.tsx` â€” must be present
- `/billing` route â€” CTA navigation target must remain valid
- Credit balance state in any existing credit display component

---

### S1-06 â€” Replace confirm()/alert() with shadcn AlertDialog

**User Story**
As a **corpus manager**, I want destructive actions (like deleting a source) to show a styled confirmation dialog instead of a browser native alert, so that the experience feels polished and branded rather than like a broken old web app.

**Persona:** Corpus manager / any user performing destructive actions

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The user clicks "Delete Source" on `CorpusPage.tsx` | The delete action is triggered (currently uses `confirm()` at line 66) | A shadcn `AlertDialog` opens with title "Delete Source?", description text, a "Cancel" button, and a "Delete" button (destructive variant) |
| AC2 | The user clicks "Cancel" in the AlertDialog | The dialog is open | The dialog closes, no deletion occurs, the source remains in the list |
| AC3 | The user clicks "Delete" in the AlertDialog | The dialog is open | The delete API call is made (`DELETE /api/v1/sources/{id}`), the dialog closes, and the source is removed from the UI |
| AC4 | Any other `confirm()` or `alert()` call in `CorpusPage.tsx` (e.g., line 77) | The user triggers the associated action | The same AlertDialog pattern is used â€” no native `window.confirm` or `window.alert` calls remain in the file |
| AC5 | The AlertDialog is open | The user presses the Escape key | The dialog closes without performing the destructive action |

**Success Metrics**

- 0 occurrences of `window.confirm` or `window.alert` in `CorpusPage.tsx` after the change (grep CI check)
- AlertDialog appears in â‰¤ 50ms of user action (Playwright timing)
- 0 accidental deletions reported in first 30 days post-launch

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S1-06-01 | Unit | Delete button opens AlertDialog | 1. Render `CorpusPage` with a mocked source. 2. Click delete icon on source. 3. Assert `AlertDialog` is in the DOM with `open={true}`. | AlertDialog open | Assertion passes |
| TC-S1-06-02 | Unit | Cancel button closes dialog, no API call | 1. Open AlertDialog. 2. Click "Cancel". 3. Assert dialog `open={false}`. 4. Assert `deleteSource` API mock NOT called. | Dialog closed, no delete | Both assertions pass |
| TC-S1-06-03 | Unit | Confirm button calls delete API | 1. Open AlertDialog. 2. Click "Delete". 3. Assert `deleteSource` mock called once with correct source ID. | API called once | Mock call count = 1 |
| TC-S1-06-04 | Unit | Escape key closes dialog | 1. Open AlertDialog. 2. Fire `keydown Escape`. 3. Assert dialog closed. | Dialog closed | Assertion passes |
| TC-S1-06-05 | Unit | No `window.confirm` or `window.alert` in CorpusPage | 1. Import `CorpusPage.tsx` source as string. 2. Assert no match for `/window\.confirm|window\.alert|confirm\(|alert\(/`. | No native dialogs | Regex assertion passes |
| TC-S1-06-06 | Integration | Delete source via AlertDialog removes from DB | 1. Seed source in DB. 2. Simulate AlertDialog confirm flow. 3. `GET /api/v1/sources` â€” assert source not present. | Source deleted | HTTP 200, source absent from list |
| TC-S1-06-07 | E2E | AlertDialog appears and functions (Playwright) | 1. Upload a source on `/corpus`. 2. Click delete. 3. `await expect(page.locator('[role="alertdialog"]')).toBeVisible()`. 4. Click "Delete". 5. Assert source row removed from list. | Dialog shown, source deleted | Playwright assertions pass |
| TC-S1-06-08 | Manual | Visual and UX review of AlertDialog | 1. Trigger delete on a source. 2. Check dialog styling, button colors (destructive = red), focus trap, backdrop. | Matches shadcn design system | QA sign-off |

**Regression Scope**

- `frontend/src/pages/CorpusPage.tsx` lines 66 and 77 â€” direct change sites
- `DELETE /api/v1/sources/{id}` endpoint â€” must still function correctly
- Source list state management â€” optimistic removal must work after dialog confirmation
- Any other pages using `window.confirm` or `window.alert` (grep check recommended across all `pages/` and `components/`)
- shadcn `AlertDialog` component availability in the component library

---

## Sprint 2 â€” Core Loop Polish

**Sprint Goal:** Elevate the core user loop â€” guide new users through onboarding, make citations useful and readable, improve session management, streamline multi-file uploads, improve chat ergonomics, and secure the admin panel.

**Stories:** S2-01 through S2-06

---

### S2-01 â€” Onboarding Empty-State Visual Stepper

**User Story**
As a **new user**, I want to see a clear visual step-by-step guide when the chat page is empty, so that I understand exactly what I need to do to get value from the app without reading documentation.

**Persona:** New user (first session, no sources uploaded)

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A user has no sessions and no sources uploaded | They navigate to `/chat` | A visual stepper is rendered showing: Step 1 "Upload a Document" (link to /corpus), Step 2 "Start a Chat Session", Step 3 "Ask Your First Question" â€” with icons and completion states |
| AC2 | The user completes Step 1 (uploads a source) | They return to `/chat` | Step 1 is marked as complete (checkmark icon, muted text) and Step 2 is highlighted as the current step |
| AC3 | The user starts a new session | They click "New Chat" | The stepper recognizes this and updates Step 2 to complete, highlighting Step 3 |
| AC4 | The user has sent at least one message in any session | They navigate to `/chat` | The empty-state stepper is not shown; the normal session list and chat area are displayed |
| AC5 | The stepper is visible | The user clicks "Upload a Document" (Step 1 link) | They are navigated to `/corpus` |

**Success Metrics**

- â‰¥ 80% of new users complete Step 1 (upload first source) within 5 minutes of first login (funnel analytics)
- â‰¥ 70% of users who see the stepper complete all 3 steps within the first session
- Bounce rate from `/chat` for new users decreases by â‰¥ 20% compared to baseline

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S2-01-01 | Unit | Stepper renders for zero-source user | 1. Render `ChatPage` with mocked `sources = []` and `sessions = []`. 2. Assert `OnboardingStepper` component present. | Stepper rendered | Assertion passes |
| TC-S2-01-02 | Unit | Stepper hidden when user has sources | 1. Render `ChatPage` with `sources = [mockSource]`. 2. Assert `OnboardingStepper` not in DOM. | Stepper absent | `queryByTestId('onboarding-stepper')` returns null |
| TC-S2-01-03 | Unit | Step 1 marked complete when sources present | 1. Render stepper with `stepsCompleted = [1]`. 2. Assert Step 1 has checkmark class/icon. 3. Assert Step 2 has active/current class. | Correct step states | Assertions pass |
| TC-S2-01-04 | Unit | Step 1 link navigates to `/corpus` | 1. Click Step 1 link. 2. Assert `navigate('/corpus')` called. | Navigation triggered | Mock called |
| TC-S2-01-05 | Integration | Stepper state derived from API data | 1. Test user with 0 sources, 0 sessions. 2. Mount `ChatPage`. 3. Assert stepper visible. 4. Add source via API. 5. Remount. 6. Assert Step 1 complete. | State reflects API | Visual state matches DB state |
| TC-S2-01-06 | E2E | Full onboarding flow (Playwright) | 1. New user login. 2. Navigate to `/chat`. 3. Assert stepper visible. 4. Click Step 1 link â†’ `/corpus`. 5. Upload file. 6. Navigate back to `/chat`. 7. Assert Step 1 complete in stepper. | Stepper advances correctly | Playwright assertions at each step pass |
| TC-S2-01-07 | Manual | Stepper visual design review | 1. View stepper as new user. 2. Check icons, typography, colors, spacing match design system. 3. Check responsive layout. | Polished, on-brand appearance | QA and design sign-off |
| TC-S2-01-08 | Manual | Accessibility check on stepper | 1. Use screen reader on stepper. 2. Assert step labels are announced. 3. Check focus order. | WCAG 2.1 AA compliant | QA accessibility sign-off |

**Regression Scope**

- `frontend/src/pages/ChatPage.tsx` â€” empty-state rendering logic
- Session list sidebar â€” must not be affected when stepper is shown
- `/corpus` route â€” navigation target must remain valid
- `GET /api/v1/sources` and `GET /api/v1/sessions` â€” called to determine stepper state

---

### S2-02 â€” Citation Chips Show Source Filename + Page

**User Story**
As a **researcher**, I want citation chips in chat responses to display the source document name and page number instead of an opaque UUID, so that I can immediately identify which document a fact came from.

**Persona:** Researcher / power user reviewing sourced answers

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The LLM returns a citation referencing chunk `abc-123-uuid` | The citation chip is rendered | The chip displays the source filename (e.g., "report.pdf") and page number (e.g., "p. 12") instead of "abc-123-uuid" |
| AC2 | The source has no page number metadata (e.g., a plain text file) | The citation chip is rendered | The chip shows only the filename without a page reference (no "p. undefined" or "p. null") |
| AC3 | The user clicks a citation chip | The chip is rendered | The `source-excerpt-panel.tsx` opens and shows the correct source excerpt for that chunk |
| AC4 | A source file has a very long filename (> 40 chars) | The chip is rendered | The filename is truncated with an ellipsis at 40 chars; the full filename is shown in a tooltip on hover |
| AC5 | The chunk data has been deleted | The citation chip is rendered for a historical message | The chip shows "[Deleted source]" gracefully instead of throwing a render error |

**Success Metrics**

- 0 citation chips displaying raw UUIDs in production (automated Playwright scan)
- Filename + page resolution latency â‰¤ 50ms additional overhead per chip (performance test)
- User research: "I understand where this information came from" rated â‰¥ 4/5 after change

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S2-02-01 | Unit | Citation chip displays filename and page | 1. Render `CitationChip` with `chunk = { id: 'uuid', source_filename: 'report.pdf', page_number: 12 }`. 2. Assert text contains "report.pdf" and "p. 12". | Correct text rendered | Assertions pass |
| TC-S2-02-02 | Unit | Citation chip without page number | 1. Render with `page_number = null`. 2. Assert "p." text not present. 3. Assert filename present. | No null page rendered | Assertions pass |
| TC-S2-02-03 | Unit | Long filename truncated at 40 chars | 1. Render with `source_filename = "a".repeat(50) + ".pdf"`. 2. Assert displayed text is â‰¤ 43 chars (40 + "..."). | Truncated | Assertion passes |
| TC-S2-02-04 | Unit | Deleted source renders gracefully | 1. Render with `chunk = null`. 2. Assert chip renders "[Deleted source]" without throwing. | Graceful fallback | No error thrown, fallback text shown |
| TC-S2-02-05 | Unit | Click opens source excerpt panel | 1. Render chip. 2. Click. 3. Assert `onChipClick` called with chunk ID. | Handler called | Mock call count = 1 |
| TC-S2-02-06 | Integration | Chunk API returns filename and page | 1. `GET /api/v1/chunks/{id}`. 2. Assert response includes `source_filename` and `page_number`. | Fields present | Schema validation passes |
| TC-S2-02-07 | E2E | Chat response shows readable citations (Playwright) | 1. Ask a question with known source. 2. Assert citation chip shows filename text (not UUID pattern `/[a-f0-9-]{36}/`). | No UUID visible | Playwright regex check passes |
| TC-S2-02-08 | Manual | Citation chip visual review | 1. Ask questions across multiple sources. 2. Check chips display correct filenames and page numbers. 3. Check tooltip on long filenames. | Correct data, readable | QA sign-off |

**Regression Scope**

- `frontend/src/components/citation-chips.tsx` â€” direct change site
- `frontend/src/components/source-excerpt-panel.tsx` â€” chip click must still open panel
- `GET /api/v1/chunks/{id}` â€” must return `source_filename` and `page_number` fields
- Chat message rendering in `ChatPage.tsx` â€” citation data model may change
- Any LLM response parser that extracts citation references from raw text

---

### S2-03 â€” Session List: Date, Source Count, Rename

**User Story**
As a **returning user with many sessions**, I want each session in the sidebar to show its last-active date and source count, and I want to be able to rename sessions inline, so that I can manage my research history efficiently.

**Persona:** Returning user / power user with multiple research projects

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The session list renders | Any session entry is visible | Each session item shows: session title, relative date (e.g., "2 days ago"), and source count (e.g., "3 sources") |
| AC2 | The user hovers over a session item | The hover state is active | A rename icon (pencil) appears inline in the session item |
| AC3 | The user clicks the rename icon | The pencil icon is clicked | The session title transforms into an inline text input pre-filled with the current title |
| AC4 | The user types a new title and presses Enter | The input is focused with new text | `PATCH /api/v1/sessions/{id}` is called with the new title; the input returns to display mode showing the new title; the `title_is_custom` flag is set to `true` in the DB |
| AC5 | The user presses Escape during inline rename | The input is focused | The input reverts to the original title without making an API call |

**Success Metrics**

- Session items render date + source count within 200ms of list load (no perceptible lag)
- Rename action completes (API round-trip + UI update) within 500ms
- 0 regressions on auto-title logic (auto-title must not overwrite `title_is_custom = true` sessions)

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S2-03-01 | Unit | Session item renders date and source count | 1. Render session list item with `{ last_active: '2024-01-10', source_count: 3 }`. 2. Assert "2 days ago" (or equivalent relative date) in DOM. 3. Assert "3 sources" in DOM. | Both metadata items present | Assertions pass |
| TC-S2-03-02 | Unit | Rename icon appears on hover | 1. Render session item. 2. Simulate `mouseenter`. 3. Assert rename button/icon visible. | Icon appears | Assertion passes |
| TC-S2-03-03 | Unit | Click rename enters edit mode | 1. Click rename icon. 2. Assert `<input>` element in DOM with `value = session.title`. | Input present with correct value | Assertions pass |
| TC-S2-03-04 | Unit | Enter key saves rename | 1. Enter edit mode. 2. Change input value to "New Name". 3. Fire `keydown Enter`. 4. Assert `patchSession` mock called with `{ title: 'New Name', title_is_custom: true }`. | API called with new title | Mock call with correct payload |
| TC-S2-03-05 | Unit | Escape key cancels rename | 1. Enter edit mode. 2. Change input value. 3. Fire `keydown Escape`. 4. Assert `patchSession` NOT called. 5. Assert original title displayed. | No API call, original title shown | Both assertions pass |
| TC-S2-03-06 | Integration | PATCH sessions sets title_is_custom flag | 1. `PATCH /api/v1/sessions/{id}` with `{ title: "Custom" }`. 2. `GET /api/v1/sessions/{id}`. 3. Assert `title_is_custom = true`. | Flag set | DB field confirmed |
| TC-S2-03-07 | E2E | Rename session inline (Playwright) | 1. Open session list. 2. Hover session. 3. Click pencil. 4. Clear input, type "Research Project A". 5. Press Enter. 6. Assert session shows "Research Project A". | Rename persists | Playwright assertion passes |
| TC-S2-03-08 | Manual | Session list readability review | 1. Create 5+ sessions with varied ages and source counts. 2. Review sidebar for readability, date formatting, overflow behavior. | Readable, no truncation bugs | QA sign-off |

**Regression Scope**

- Session list sidebar component and state management
- `PATCH /api/v1/sessions/{id}` â€” extended with `title_is_custom` field
- Auto-title logic (S1-02) â€” must check `title_is_custom` before overwriting
- `GET /api/v1/sessions` â€” must return `last_active`, `source_count`, `title_is_custom`

---

### S2-04 â€” Multi-File Upload

**User Story**
As a **document-heavy researcher**, I want to upload multiple files simultaneously in the corpus page, so that I can batch-ingest my research materials without clicking "Upload" dozens of times.

**Persona:** Document-heavy researcher / enterprise user

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The user opens the file picker on `CorpusPage.tsx` | The `<input>` is clicked (currently line 146) | The file picker allows selecting multiple files (the `multiple` attribute is present on the input element) |
| AC2 | The user selects 5 PDF files | They confirm the file picker | All 5 files appear in a pre-upload staging area showing filename, size, and a remove button |
| AC3 | The user clicks "Upload All" | The staging area is shown | All files are uploaded sequentially or in parallel; a per-file progress indicator shows upload progress |
| AC4 | One file fails to upload (e.g., unsupported type) | The upload batch is processing | The failed file shows an error state with reason; the other files continue to upload and succeed |
| AC5 | All files are successfully uploaded | The upload completes | All successfully uploaded sources appear in the source list; a success toast shows "X of Y files uploaded" |

**Success Metrics**

- Upload throughput: 5 files Ã— 10MB each complete in â‰¤ 30s on a 10Mbps connection
- 0% silent failures â€” every failed file surfaces an error message
- 50% reduction in clicks required to upload 5+ files vs. single-file flow

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S2-04-01 | Unit | Input element has `multiple` attribute | 1. Render `CorpusPage`. 2. Assert `document.querySelector('input[type="file"]').multiple === true`. | `multiple` attribute present | Assertion passes |
| TC-S2-04-02 | Unit | File staging area shows selected files | 1. Simulate file selection of 3 files. 2. Assert 3 file preview items in staging area. | 3 items rendered | Assertion passes |
| TC-S2-04-03 | Unit | Remove button removes file from staging | 1. Stage 3 files. 2. Click remove on file 2. 3. Assert 2 items remain. | File removed from staging | Count = 2 |
| TC-S2-04-04 | Unit | Per-file error state rendered on failure | 1. Mock `uploadSource` to reject for file 2. 2. Upload 3 files. 3. Assert file 2 shows error state. 4. Assert files 1 and 3 show success. | Partial failure handled | Error only on file 2 |
| TC-S2-04-05 | Integration | POST /api/v1/sources accepts file upload | 1. POST multipart form with 1 PDF. 2. Assert 201 response and source ID returned. | Source created | HTTP 201, ID present |
| TC-S2-04-06 | Integration | Multiple sequential uploads all succeed | 1. Upload 5 files sequentially via API. 2. `GET /api/v1/sources`. 3. Assert 5 sources in list. | All 5 present | Count = 5 |
| TC-S2-04-07 | E2E | Multi-file upload flow (Playwright) | 1. Navigate to `/corpus`. 2. `inputElement.setInputFiles(['file1.pdf', 'file2.pdf', 'file3.pdf'])`. 3. Click "Upload All". 4. Wait for completion. 5. Assert 3 sources in source list. | All 3 sources visible | Playwright assertions pass |
| TC-S2-04-08 | Manual | Upload progress and UX review | 1. Select 5 large PDFs. 2. Click upload. 3. Review per-file progress bars, overall status, error handling. | Progress visible, errors clear | QA sign-off |

**Regression Scope**

- `frontend/src/pages/CorpusPage.tsx` line 146 â€” direct change site
- Single-file upload path â€” must not be broken by multi-file changes
- `POST /api/v1/sources` â€” must handle concurrent requests without DB conflicts
- Source list refresh after upload â€” must show all new sources
- Huey task queue â€” ingest tasks must be enqueued for all uploaded files

---

### S2-05 â€” Shift+Enter for Newline in Chat Input

**User Story**
As a **power user composing complex queries**, I want Shift+Enter to insert a newline in the chat input and Enter to send the message, so that I can write multi-line queries without accidentally submitting them.

**Persona:** Power user / prompt engineer

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The chat input textarea is focused | The user presses `Enter` | The message is submitted; `POST /api/v1/chat` or SSE stream is initiated |
| AC2 | The chat input textarea is focused | The user presses `Shift+Enter` | A newline character is inserted at the cursor position; the message is NOT submitted |
| AC3 | The chat input has a multi-line message | The user presses `Enter` to submit | The full multi-line message content is sent to the API |
| AC4 | The input is disabled (during streaming) | The user presses `Shift+Enter` | No action occurs â€” the key press is ignored |
| AC5 | A mobile user taps the send button | There is a multi-line message in the input | The message is submitted correctly regardless of newlines |

**Success Metrics**

- 0 accidental message submissions from Shift+Enter in automated tests
- Multi-line messages render correctly in the chat history (newlines preserved)
- No regression on Enter-to-send behavior

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S2-05-01 | Unit | Enter key submits message | 1. Render chat input. 2. Type "Hello". 3. Fire `keydown { key: 'Enter', shiftKey: false }`. 4. Assert `handleSubmit` called. | Submit triggered | Mock called |
| TC-S2-05-02 | Unit | Shift+Enter inserts newline | 1. Render chat input with value "Line 1". 2. Fire `keydown { key: 'Enter', shiftKey: true }`. 3. Assert `handleSubmit` NOT called. 4. Assert input value contains `\n`. | Newline inserted, no submit | Both assertions pass |
| TC-S2-05-03 | Unit | Multi-line message submitted correctly | 1. Set input value to "Line 1\nLine 2". 2. Fire Enter. 3. Assert `handleSubmit` called with "Line 1\nLine 2". | Full content submitted | Mock called with multiline string |
| TC-S2-05-04 | Unit | Disabled input ignores key events | 1. Render disabled input. 2. Fire `keydown Enter`. 3. Assert `handleSubmit` NOT called. | No submission | Mock not called |
| TC-S2-05-05 | E2E | Shift+Enter newline in browser (Playwright) | 1. Focus chat input. 2. Type "Line 1". 3. `page.keyboard.press('Shift+Enter')`. 4. Type "Line 2". 5. Assert textarea has 2 lines. 6. Press `Enter`. 7. Assert message sent with both lines. | 2-line message sent | Assertions pass |
| TC-S2-05-06 | Manual | Multi-line message renders in chat history | 1. Send a 3-line message. 2. Verify chat bubble shows 3 lines with correct line breaks. | Newlines preserved in display | QA sign-off |
| TC-S2-05-07 | Manual | Mobile send button with multi-line message | 1. Open on mobile viewport. 2. Type multi-line message. 3. Tap send. 4. Verify message sent correctly. | Mobile send works | QA sign-off |

**Regression Scope**

- Chat input component and keydown handler
- Message submission flow in `ChatPage.tsx`
- Mobile send button â€” must not be affected by Enter key handler changes
- Message display component â€” must render `\n` as `<br>` or CSS `white-space: pre-wrap`

---

### S2-06 â€” Admin Role Guard

**User Story**
As a **regular user**, I want the Admin navigation item to be hidden from me, so that I am not confused by seeing menu options that lead to unauthorized pages.

**Persona:** Regular (non-admin) user

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The authenticated user has role `user` (not `admin`) | The app sidebar renders in `app-sidebar.tsx` | The "Admin" navigation item is not visible in the sidebar |
| AC2 | The authenticated user has role `admin` | The app sidebar renders | The "Admin" navigation item IS visible |
| AC3 | A non-admin user manually navigates to `/admin` | They type the URL directly | They are redirected to `/` or receive a 403 page â€” they do not see the Admin page content |
| AC4 | The JWT token claims are decoded | The role is checked | The role check uses the JWT `role` claim from the decoded token, not a separate API call (to avoid latency) |
| AC5 | A non-admin user's JWT is modified to include `role: admin` | They navigate to `/admin` | The backend `admin.py` endpoints verify the role server-side and return 403 â€” client-side guard is defense-in-depth only |

**Success Metrics**

- 100% of non-admin users: Admin nav item not visible in automated E2E tests
- 100% of direct `/admin` navigation attempts by non-admin users: 403 response from backend
- 0 security incidents where non-admin user accesses admin data in first 90 days

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S2-06-01 | Unit | Sidebar hides Admin item for non-admin | 1. Render `AppSidebar` with `userRole = 'user'`. 2. Assert Admin nav item not in DOM. | Item absent | `queryByText('Admin')` = null |
| TC-S2-06-02 | Unit | Sidebar shows Admin item for admin | 1. Render `AppSidebar` with `userRole = 'admin'`. 2. Assert Admin nav item in DOM. | Item present | `getByText('Admin')` found |
| TC-S2-06-03 | Unit | Role extracted from JWT claims | 1. Mock decoded JWT `{ role: 'user' }`. 2. Assert `isAdmin = false`. | Correct role detection | Assertion passes |
| TC-S2-06-04 | Integration | `/admin/*` endpoints return 403 for non-admin JWT | 1. Obtain JWT for `user` role account. 2. `GET /api/v1/admin/members` with that JWT. 3. Assert 403 response. | HTTP 403 | Status code = 403 |
| TC-S2-06-05 | Integration | `/admin/*` endpoints return 200 for admin JWT | 1. Obtain JWT for `admin` role account. 2. `GET /api/v1/admin/members`. 3. Assert 200 response. | HTTP 200 | Status code = 200 |
| TC-S2-06-06 | E2E | Non-admin user redirected from /admin (Playwright) | 1. Login as non-admin user. 2. `page.goto('/admin')`. 3. Assert URL is `/` or `/403`. 4. Assert Admin content not visible. | Redirect occurs | URL assertion passes |
| TC-S2-06-07 | E2E | Admin user sees Admin in sidebar | 1. Login as admin user. 2. Assert `page.locator('nav >> text=Admin')` visible. | Admin visible | Playwright assertion passes |
| TC-S2-06-08 | Manual | Security penetration check â€” JWT role tampering | 1. Login as non-admin. 2. Use JWT tool to modify `role` to `admin`. 3. Make direct API call to `/api/v1/admin/members`. 4. Verify 403 returned (server validates signature). | Server rejects tampered token | 403 received, no data leaked |

**Regression Scope**

- `frontend/src/components/app-sidebar.tsx` â€” direct change site
- `frontend/src/lib/api.ts` â€” token decoding utility (must expose `role` claim)
- `backend/app/api/v1/admin.py` â€” all admin endpoints must have role verification middleware
- React Router auth guard â€” route-level protection for `/admin`
- Login flow â€” JWT must include `role` claim in response

---

## Sprint 3 â€” Differentiation

**Sprint Goal:** Add features that make ownNBLM compelling beyond a basic RAG chat â€” document summaries, starter prompts, richer excerpts, password reset, URL ingestion, and mobile-friendly layout.

**Stories:** S3-01 through S3-06

---

### S3-01 â€” Post-Ingest Document Summary

**User Story**
As a **researcher uploading documents**, I want to see an automatically generated summary of each document after it's ingested, so that I can confirm the document was correctly understood and quickly recall its content without re-reading it.

**Persona:** Researcher / document curator

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A document has finished the ingest/indexing pipeline | The `Huey` task completes | An LLM call is made to generate a â‰¤ 200-word summary of the document's content |
| AC2 | The summary generation completes | The user is on `/corpus` | The source item displays a "Summary" expand button; clicking it reveals the summary text |
| AC3 | The user navigates away and returns to `/corpus` | The page reloads | The summary is persisted and displayed from the database â€” it is not re-generated on every load |
| AC4 | The summary generation fails (LLM error, timeout) | The ingest task encounters an error | The source item shows no summary section (graceful degradation); a retry button or admin-visible error state is shown |
| AC5 | The summary is displayed | The user reads it | The summary is â‰¤ 200 words and contains no hallucinated external information (it references only the document content) |

**Success Metrics**

- â‰¥ 95% of successfully ingested documents have a generated summary within 60 seconds of ingest completion
- Summary generation adds â‰¤ 5% overhead to total ingest time (measured via Huey task timing)
- User research: "The summary helped me confirm the document was correctly ingested" rated â‰¥ 4/5

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S3-01-01 | Unit | Summary generation task enqueued after ingest | 1. Mock Huey. 2. Complete ingest task. 3. Assert `generate_document_summary` task enqueued. | Task queued | Mock call confirmed |
| TC-S3-01-02 | Unit | Summary stored on source record | 1. Mock LLM returning "Test summary". 2. Run summary task. 3. Assert `source.summary = "Test summary"` in DB. | Summary persisted | DB field check |
| TC-S3-01-03 | Unit | Summary expand UI renders correctly | 1. Render source item with `summary = "Test summary text"`. 2. Assert "Summary" button present. 3. Click button. 4. Assert summary text visible. | Summary expandable | Assertions pass |
| TC-S3-01-04 | Unit | No summary section when summary is null | 1. Render source item with `summary = null`. 2. Assert "Summary" button absent. | No expand button | `queryByText('Summary')` = null |
| TC-S3-01-05 | Integration | Full ingest pipeline produces summary | 1. Upload PDF to test env. 2. Wait for Huey tasks to complete. 3. `GET /api/v1/sources/{id}`. 4. Assert `summary` field present and non-empty. | Summary in API response | Field present |
| TC-S3-01-06 | Integration | Summary length â‰¤ 200 words | 1. Run summary generation on a 10,000-word document. 2. Count words in generated summary. | Summary â‰¤ 200 words | Word count â‰¤ 200 |
| TC-S3-01-07 | E2E | Summary visible on Corpus page (Playwright) | 1. Upload document. 2. Wait for ingest. 3. Click "Summary" on source item. 4. Assert summary text visible. | Summary shown | Playwright assertion passes |
| TC-S3-01-08 | Manual | Summary quality review | 1. Upload 5 varied documents (PDF, DOCX, TXT). 2. Read generated summaries. 3. Compare to document content. | Accurate, useful summaries | QA and PM sign-off |

**Regression Scope**

- `backend/app/api/v1/sources.py` â€” source data model extended with `summary` field
- Huey task queue â€” new task must be registered and not conflict with existing ingest tasks
- `frontend/src/pages/CorpusPage.tsx` â€” source list item rendering
- `GET /api/v1/sources` â€” must return `summary` field (may need pagination consideration for large responses)
- LiteLLM/OpenRouter integration â€” new LLM call type, must be within credit accounting

---

### S3-02 â€” Suggested Starter Questions on Empty Session

**User Story**
As a **user starting a new chat session**, I want to see 3 automatically generated starter questions relevant to my uploaded sources, so that I can quickly begin exploring my documents without thinking about what to ask first.

**Persona:** New session user / user with a loaded corpus

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A user starts a new chat session | The session is empty (no messages) | 3 suggested starter questions are displayed as clickable pill buttons in the chat area |
| AC2 | The suggested questions are displayed | The user clicks one | The question text is populated into the chat input and immediately submitted as the first message |
| AC3 | The session context includes specific sources | The suggestions are generated | The questions are relevant to the content of the user's uploaded sources (not generic "What can I help you with?" prompts) |
| AC4 | The user starts typing their own message | The suggestions are still visible | The suggestions remain until the user submits their own first message, at which point they disappear |
| AC5 | No sources are uploaded yet | The user starts a new session | No starter questions are shown (the onboarding stepper from S2-01 is shown instead) |

**Success Metrics**

- â‰¥ 40% of new sessions use a starter question as the first message (click-through rate)
- Starter question generation completes within 2 seconds of session creation
- Questions are rated as "relevant to my documents" â‰¥ 70% of the time in user feedback

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S3-02-01 | Unit | Starter questions rendered on empty session | 1. Render `ChatPage` with `messages = []` and `sources = [mock]`. 2. Assert 3 question pill buttons present. | 3 pills rendered | Count = 3 |
| TC-S3-02-02 | Unit | Click on starter question populates input | 1. Render starter questions. 2. Click first question pill. 3. Assert chat input value equals question text. | Input populated | Value matches |
| TC-S3-02-03 | Unit | Starter questions hidden when sources absent | 1. Render with `sources = []`. 2. Assert question pills absent. | Pills absent | `queryAllByTestId('starter-question').length` = 0 |
| TC-S3-02-04 | Unit | Questions disappear after first message | 1. Render with 3 starter questions. 2. Submit any message. 3. Assert pills no longer rendered. | Pills removed | Assertion passes |
| TC-S3-02-05 | Integration | Starter question generation endpoint returns 3 questions | 1. `GET /api/v1/sessions/{id}/starter-questions`. 2. Assert response `{ questions: [string, string, string] }`. | 3 question strings | Schema valid |
| TC-S3-02-06 | Integration | Questions are contextually relevant | 1. Upload a document about "climate change". 2. Request starter questions. 3. Assert questions contain climate-related terms. | Contextually relevant | Manual keyword check |
| TC-S3-02-07 | E2E | Starter questions appear and function (Playwright) | 1. Login. 2. Ensure sources uploaded. 3. Create new session. 4. Assert 3 pills visible. 5. Click first pill. 6. Assert message submitted. | Questions appear and work | Playwright assertions pass |
| TC-S3-02-08 | Manual | Question quality review | 1. Create sessions with 5 different document types. 2. Review generated starter questions for relevance and quality. | Questions are specific and useful | QA and PM sign-off |

**Regression Scope**

- `frontend/src/pages/ChatPage.tsx` â€” empty state and message submission
- Session creation flow â€” starter question generation must be triggered on session create
- `GET /api/v1/sessions/{id}/starter-questions` â€” new endpoint
- LiteLLM/OpenRouter credit accounting â€” new LLM call
- Onboarding stepper (S2-01) â€” must not conflict with starter questions

---

### S3-03 â€” Source Excerpt Panel: Document Name + Highlight

**User Story**
As a **researcher verifying a cited claim**, I want the source excerpt panel to show the document name and highlight the exact matched text, so that I can instantly locate the evidence in context.

**Persona:** Researcher / fact-checker

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The user clicks a citation chip | The `source-excerpt-panel.tsx` opens | The panel header shows the source document name (e.g., "Quarterly Report Q3 2024.pdf") |
| AC2 | The excerpt panel is open | The excerpt text is rendered | The specific matched text (the chunk that was cited) is visually highlighted with a distinct background color |
| AC3 | The surrounding context is shown | The excerpt contains matched + surrounding text | The matched portion is highlighted; the surrounding context (Â± 2 sentences) is shown in normal style |
| AC4 | The document name is very long | The panel header renders | The name is truncated with an ellipsis; the full name is shown in a `title` attribute tooltip |
| AC5 | The excerpt panel is open on mobile | The viewport is < 768px | The panel renders as a bottom sheet (or drawer) that does not obscure the chat area on small screens |

**Success Metrics**

- Excerpt panel opens within 300ms of citation chip click (Playwright timing test)
- Highlight is visually distinct from surrounding text (contrast ratio â‰¥ 3:1 per WCAG)
- User research: "I could easily find where the cited text came from" rated â‰¥ 4.5/5

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S3-03-01 | Unit | Panel header shows document name | 1. Render `SourceExcerptPanel` with `source_filename = "report.pdf"`. 2. Assert panel header contains "report.pdf". | Filename shown | Assertion passes |
| TC-S3-03-02 | Unit | Matched text is highlighted | 1. Render panel with `excerpt_text`, `matched_text`. 2. Assert highlighted span wraps `matched_text`. 3. Assert highlight class/style present. | Highlight applied | Assertion passes |
| TC-S3-03-03 | Unit | Long filename truncated | 1. Render with 80-char filename. 2. Assert displayed text â‰¤ 43 chars. 3. Assert `title` attribute has full name. | Truncated with tooltip | Assertions pass |
| TC-S3-03-04 | Unit | Context surrounding highlight rendered | 1. Render with context before and after matched text. 2. Assert all three sections render (pre-context, highlight, post-context). | All three sections present | Assertions pass |
| TC-S3-03-05 | Integration | Chunk API returns matched_text | 1. `GET /api/v1/chunks/{id}`. 2. Assert `matched_text` and `context_text` fields present. | Fields in response | Schema check |
| TC-S3-03-06 | E2E | Panel opens with highlight (Playwright) | 1. Ask question. 2. Click citation chip. 3. `await expect(page.locator('[data-testid="excerpt-panel"]')).toBeVisible()`. 4. Assert `[data-testid="highlight"]` visible. | Panel open with highlight | Playwright assertions pass |
| TC-S3-03-07 | Manual | Visual review of panel and highlight | 1. Click citation chips in various responses. 2. Review document name, highlight color, context readability. | Clear, readable, well-designed | QA and design sign-off |
| TC-S3-03-08 | Manual | Mobile bottom sheet behavior | 1. Open on 375px viewport. 2. Click citation chip. 3. Verify panel appears as bottom drawer. | Bottom sheet on mobile | QA sign-off on mobile device |

**Regression Scope**

- `frontend/src/components/source-excerpt-panel.tsx` â€” direct change site
- `frontend/src/components/citation-chips.tsx` â€” chip click must open panel with correct data
- `GET /api/v1/chunks/{id}` â€” must return `matched_text`, `context_text`, `source_filename`
- Mobile layout (S3-06) â€” panel must work as bottom sheet on mobile

---

### S3-04 â€” Password Reset Flow

**User Story**
As a **user who has forgotten their password**, I want to initiate a password reset from the login page, so that I can regain access to my account without contacting an administrator.

**Persona:** Any authenticated user who has lost access

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The user is on `/login` | They click "Forgot Password?" | They are shown an email input form with a "Send Reset Link" button |
| AC2 | The user enters their email and submits | The email is valid and in the system | The existing `magic_link` backend service (`backend/app/api/v1/auth.py`) is called; the user receives an email with a reset link |
| AC3 | The user enters their email | The email is NOT in the system | A generic success message is shown ("If that email exists, you'll receive a reset link") â€” no email enumeration leak |
| AC4 | The user clicks the link in the email | The link token is valid and not expired | They are taken to a `/reset-password?token=<token>` page where they can enter a new password |
| AC5 | The user sets a new password | They submit the form | The new password is saved, the old password no longer works, and the user is redirected to `/login` with a success message |

**Success Metrics**

- Password reset flow completes end-to-end in â‰¤ 2 minutes in QA testing
- 0 email enumeration vulnerabilities (both valid and invalid emails return same message)
- Reset link expires after 15 minutes (configurable) â€” confirmed via automated test

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S3-04-01 | Unit | Forgot password link shows email form | 1. Render `LoginPage`. 2. Click "Forgot Password?". 3. Assert email input form rendered. | Form visible | Assertion passes |
| TC-S3-04-02 | Unit | Generic response for unknown email | 1. Mock API to return 200 for unknown email. 2. Submit unknown email. 3. Assert success message shown (not "email not found"). | Enumeration-safe response | Message matches generic text |
| TC-S3-04-03 | Unit | Reset form validates new password | 1. Render reset password form. 2. Submit with empty password. 3. Assert validation error. 4. Submit with weak password. 5. Assert strength error. | Validation enforced | Errors shown |
| TC-S3-04-04 | Integration | `/api/v1/auth/forgot-password` calls magic_link service | 1. `POST /api/v1/auth/forgot-password` with valid email. 2. Assert magic link created in DB. 3. Assert email queued for sending. | Link created, email queued | DB check + email queue check |
| TC-S3-04-05 | Integration | Reset token expires after 15 minutes | 1. Create reset token. 2. Advance mock time by 16 minutes. 3. `POST /api/v1/auth/reset-password` with expired token. 4. Assert 400/401 response. | Expired token rejected | HTTP 400/401 |
| TC-S3-04-06 | Integration | Password updated successfully | 1. Create valid reset token. 2. `POST /api/v1/auth/reset-password` with token + new password. 3. Attempt login with old password. 4. Attempt login with new password. | Old fails, new succeeds | Login results correct |
| TC-S3-04-07 | E2E | Full password reset flow (Playwright) | 1. Click "Forgot Password". 2. Enter valid email. 3. Submit. 4. Intercept reset email (test SMTP). 5. Click link. 6. Enter new password. 7. Login with new password. | Full flow succeeds | Login success after reset |
| TC-S3-04-08 | Manual | Security review of reset flow | 1. Test token reuse after first use (must fail). 2. Test token for wrong user. 3. Test enumeration attack. | All attacks blocked | Security QA sign-off |

**Regression Scope**

- `frontend/src/pages/LoginPage.tsx` â€” new UI elements
- `backend/app/api/v1/auth.py` â€” new endpoints using existing `magic_link` service
- Existing magic link / Google OAuth flow â€” must not be broken
- Email sending service configuration
- JWT auth flow â€” must not be affected by password reset changes

---

### S3-05 â€” URL Ingestion Tab on Corpus Page

**User Story**
As a **user who curates online content**, I want to paste a URL into the Corpus page and have the web page content ingested as a source, so that I can build a knowledge base from both files and web articles.

**Persona:** Content curator / researcher using web sources

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The user is on `/corpus` | They look at the source ingestion UI | There is a "URL" tab alongside the existing file upload tab |
| AC2 | The user clicks the "URL" tab | The tab is selected | A text input for URL entry and an "Add URL" button are displayed |
| AC3 | The user pastes a valid URL and clicks "Add" | The URL is submitted | The backend fetches the URL content, extracts text, and adds it to the ingest queue; a "Processing" state is shown in the source list |
| AC4 | The URL is invalid (malformed, 404, or blocked) | The URL is submitted | An error toast is shown with the reason (e.g., "URL not reachable", "Invalid URL format"); no source is created |
| AC5 | The URL source completes ingestion | The Huey task finishes | The source appears in the list with the page title as the filename and the URL as metadata |

**Success Metrics**

- â‰¥ 90% of valid public URLs successfully ingested within 30 seconds
- 100% of invalid URLs rejected with user-visible error message
- URL sources appear in search/chat with correct attribution

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S3-05-01 | Unit | URL tab renders when selected | 1. Render `CorpusPage`. 2. Click "URL" tab. 3. Assert URL input and "Add URL" button present. | UI elements present | Assertions pass |
| TC-S3-05-02 | Unit | Invalid URL format shows error | 1. Type "not-a-url" in URL input. 2. Click "Add". 3. Assert validation error shown. 4. Assert API NOT called. | Client-side validation | Error shown, no API call |
| TC-S3-05-03 | Unit | Processing state shown after submit | 1. Submit valid URL. 2. Mock API returning 202. 3. Assert source item in "Processing" state. | Processing indicator | Assertion passes |
| TC-S3-05-04 | Integration | `POST /api/v1/sources/url` enqueues ingest task | 1. `POST /api/v1/sources/url` with `{ url: 'https://example.com/article' }`. 2. Assert Huey task enqueued. 3. Assert 202 response. | Task queued, 202 returned | HTTP 202, task in queue |
| TC-S3-05-05 | Integration | URL source gets page title as filename | 1. Submit URL with known page title. 2. Wait for ingest. 3. `GET /api/v1/sources`. 4. Assert source `filename` = page title. | Page title used | Filename matches |
| TC-S3-05-06 | Integration | Unreachable URL returns error | 1. `POST /api/v1/sources/url` with `{ url: 'https://definitely-not-real-404.xyz' }`. 2. Assert 400/422 response with error message. | Error returned | HTTP 400/422 |
| TC-S3-05-07 | E2E | URL ingestion end-to-end (Playwright) | 1. Navigate to `/corpus`. 2. Click "URL" tab. 3. Enter valid URL. 4. Click "Add". 5. Wait for processing. 6. Assert source appears in list. | Source created | Playwright assertions pass |
| TC-S3-05-08 | Manual | URL source usable in chat | 1. Ingest a news article URL. 2. Go to chat. 3. Ask a question about the article. 4. Verify answer cites the URL source. | URL content retrievable | QA sign-off |

**Regression Scope**

- `frontend/src/pages/CorpusPage.tsx` â€” new tab and URL input
- `backend/app/api/v1/sources.py` â€” new URL ingestion endpoint
- Huey task queue â€” new URL fetch + ingest task
- Existing file upload â€” must not regress
- Source list rendering â€” URL sources must display correctly

---

### S3-06 â€” Mobile Layout â€” Chat Sidebar as Bottom Sheet

**User Story**
As a **mobile user**, I want the chat session sidebar to appear as a bottom sheet on small screens instead of a desktop-style sidebar, so that I can navigate between sessions and the chat area comfortably on a phone.

**Persona:** Mobile user

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The viewport width is < 768px | The chat page renders | The desktop sidebar is hidden; a slide-up bottom sheet trigger (e.g., a sessions icon in a bottom nav bar) is shown |
| AC2 | The user taps the bottom sheet trigger on mobile | They are on `/chat` | A bottom sheet slides up from the bottom of the screen showing the session list |
| AC3 | The user selects a session from the bottom sheet | The session item is tapped | The bottom sheet closes and the selected session's chat is loaded |
| AC4 | The user swipes down on the bottom sheet | The sheet is open | The bottom sheet dismisses with a spring animation |
| AC5 | The viewport is â‰¥ 768px | The desktop layout is shown | The normal sidebar is displayed; the bottom sheet trigger is hidden (no duplicate navigation) |

**Success Metrics**

- Mobile Lighthouse performance score â‰¥ 85 on `/chat` after layout change
- Bottom sheet open/close animation â‰¤ 300ms (Framer Motion spring)
- 0 regression on desktop sidebar layout (Playwright desktop viewport tests)

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S3-06-01 | Unit | Sidebar hidden on mobile viewport | 1. Render `AppShell` with viewport width 375. 2. Assert sidebar element has `hidden` class or is not in DOM. | Sidebar hidden | Assertion passes |
| TC-S3-06-02 | Unit | Bottom sheet trigger visible on mobile | 1. Render with 375px viewport. 2. Assert bottom sheet trigger button visible. | Trigger visible | Assertion passes |
| TC-S3-06-03 | Unit | Bottom sheet trigger hidden on desktop | 1. Render with 1440px viewport. 2. Assert trigger not visible. | Trigger hidden | Assertion passes |
| TC-S3-06-04 | Unit | Bottom sheet opens on trigger click | 1. Click trigger. 2. Assert bottom sheet component has `open = true`. | Sheet open | State assertion |
| TC-S3-06-05 | Unit | Session selection closes sheet | 1. Open bottom sheet. 2. Click a session item. 3. Assert sheet `open = false`. | Sheet closed | State assertion |
| TC-S3-06-06 | E2E | Mobile layout renders correctly (Playwright) | 1. `await page.setViewportSize({ width: 375, height: 812 })`. 2. Navigate to `/chat`. 3. Assert sidebar not visible. 4. Assert bottom sheet trigger visible. | Correct mobile layout | Playwright assertions pass |
| TC-S3-06-07 | E2E | Desktop sidebar unaffected (Playwright) | 1. `await page.setViewportSize({ width: 1440, height: 900 })`. 2. Navigate to `/chat`. 3. Assert sidebar visible. 4. Assert bottom sheet trigger not visible. | Correct desktop layout | Playwright assertions pass |
| TC-S3-06-08 | Manual | Mobile UX review on real device | 1. Open on iPhone 14 and Android Pixel. 2. Test bottom sheet open, scroll, session selection, swipe-to-dismiss. | Smooth, native-feeling UX | QA sign-off on real devices |

**Regression Scope**

- `frontend/src/layouts/AppShell.tsx` â€” sidebar visibility logic
- `frontend/src/pages/ChatPage.tsx` â€” session state on mobile
- All other routes â€” responsive layout must not regress (check `/corpus`, `/billing`, `/admin`)
- Framer Motion animation performance on low-end devices
- Session list functionality â€” same features as desktop

---

## Sprint 4 â€” Scale & Monetization

**Sprint Goal:** Harden the billing experience, go live with Razorpay, secure authentication, lock down API docs, and deliver a production hosting checklist.

**Stories:** S4-01 through S4-05

---

### S4-01 â€” Billing Page Redesign with Feature Table + 80% Upgrade Nudge

**User Story**
As a **potential upgrader**, I want to see a clear feature comparison table on the billing page and receive an upgrade nudge when I reach 80% of my plan's credit limit, so that I can make an informed decision about upgrading before I run out of capacity.

**Persona:** Existing user approaching credit limit / potential paying subscriber

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | Any authenticated user visits `/billing` | The page renders | A feature comparison table is visible showing Free, Pro, and Enterprise plans with rows for: credit limit, source limit, session limit, team members, API access, support tier |
| AC2 | The user's credit usage reaches 80% of their plan limit | They navigate to any page | A persistent upgrade nudge banner (dismissible, sticky to top) appears with a link to `/billing` and "Upgrade to Pro" CTA |
| AC3 | The upgrade nudge is shown | The user clicks "Upgrade to Pro" | They are taken directly to the Pro plan checkout section of `/billing` with the Pro plan pre-selected |
| AC4 | The user dismisses the upgrade nudge | They click the X on the banner | The nudge is hidden for the current session (or 24 hours, stored in localStorage) |
| AC5 | The user has already upgraded | The 80% threshold is crossed on the new plan | No nudge is shown for the plan the user is already on (only shown for available upgrades) |

**Success Metrics**

- Upgrade conversion rate from nudge: â‰¥ 5% of users who see the nudge upgrade within 7 days
- Billing page bounce rate: â‰¤ 30% after redesign (users stay to read the comparison table)
- Feature comparison table renders within 500ms of page load

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S4-01-01 | Unit | Feature comparison table renders with all plans | 1. Render `BillingPage`. 2. Assert table has columns for Free, Pro, Enterprise. 3. Assert rows for all 6 feature categories. | Table structure correct | Assertions pass |
| TC-S4-01-02 | Unit | Upgrade nudge shown at 80% usage | 1. Mock user with `credits_used = 80%` of plan. 2. Render `AppShell`. 3. Assert nudge banner visible. | Nudge shown | Assertion passes |
| TC-S4-01-03 | Unit | Nudge hidden below 80% | 1. Mock user with 79% usage. 2. Assert nudge absent. | No nudge | Assertion passes |
| TC-S4-01-04 | Unit | Nudge CTA navigates to billing with plan preselected | 1. Click "Upgrade to Pro" in nudge. 2. Assert `navigate('/billing?plan=pro')` called. | Navigation with param | Mock called with correct URL |
| TC-S4-01-05 | Unit | Nudge dismissal stored in localStorage | 1. Click dismiss on nudge. 2. Assert `localStorage.setItem` called with nudge-dismissed key. 3. Remount app. 4. Assert nudge not shown. | Dismissed state persists | Both assertions pass |
| TC-S4-01-06 | Integration | Usage data endpoint returns percentage | 1. `GET /api/v1/billing/usage`. 2. Assert response includes `credits_used_percent`. | Percentage in response | Schema check |
| TC-S4-01-07 | E2E | Upgrade nudge visible at 80% (Playwright) | 1. Set test user to 80% usage via API. 2. Navigate to `/chat`. 3. Assert nudge banner visible. 4. Click CTA. 5. Assert navigated to `/billing`. | Nudge shown and CTA works | Playwright assertions pass |
| TC-S4-01-08 | Manual | Billing page design review | 1. Visit `/billing` as Free, Pro, and Enterprise user. 2. Review comparison table for accuracy and visual design. | Accurate, well-designed | QA, PM, and design sign-off |

**Regression Scope**

- `frontend/src/pages/BillingPage.tsx` â€” direct change site
- `AppShell.tsx` â€” nudge banner integration
- `GET /api/v1/billing/usage` â€” must return percentage data
- Razorpay/Stripe checkout flow â€” must not regress during redesign
- Credit display in usage bar â€” must remain accurate

---

### S4-02 â€” Razorpay Go-Live: Sandbox-to-Prod Flow Test

**User Story**
As a **billing administrator**, I want the Razorpay integration to be fully tested in production mode before launch, so that real customer payments are processed correctly without errors.

**Persona:** Billing administrator / devops engineer

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The `RAZORPAY_MODE=production` environment variable is set | The billing page loads | The checkout initiates against the Razorpay production API (not sandbox); the correct live key ID is used |
| AC2 | A user initiates checkout | They click "Upgrade to Pro" | A Razorpay checkout modal opens with the correct plan amount and currency |
| AC3 | A payment is completed in production | The Razorpay webhook fires `payment.captured` | The backend `POST /api/v1/billing/webhook` handler verifies the Razorpay signature, upgrades the user's plan in the DB, and sends a confirmation email |
| AC4 | A payment fails | Razorpay fires `payment.failed` | The user's plan is NOT upgraded; an error toast is shown; the event is logged to the audit table |
| AC5 | The webhook receives a replay or duplicate event | The same `payment_id` is received twice | The handler is idempotent â€” the second event is logged but no second plan upgrade occurs |

**Success Metrics**

- 100% of test production payments result in correct plan upgrades within 30 seconds of payment capture
- 0 double-charge incidents in first 90 days
- Webhook signature verification passes for 100% of legitimate Razorpay events

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S4-02-01 | Unit | Production mode uses live Razorpay key | 1. Set `RAZORPAY_MODE=production`. 2. Assert `razorpay_key_id` in checkout payload matches `RAZORPAY_LIVE_KEY_ID` env var. | Live key used | Key match assertion |
| TC-S4-02-02 | Unit | Webhook signature verification | 1. Generate valid Razorpay signature. 2. Call webhook handler. 3. Assert plan upgraded. 4. Call with invalid signature. 5. Assert 400 and no upgrade. | Signature validated | Both assertions pass |
| TC-S4-02-03 | Unit | Idempotency â€” duplicate payment_id ignored | 1. Process `payment.captured` for `pay_123`. 2. Process same event again. 3. Assert user plan upgraded only once. | One upgrade | DB check: plan upgraded once |
| TC-S4-02-04 | Integration | Webhook endpoint updates user plan | 1. POST valid `payment.captured` webhook to `/api/v1/billing/webhook`. 2. `GET /api/v1/billing/status` for user. 3. Assert plan = target plan. | Plan updated | Plan field matches |
| TC-S4-02-05 | Integration | Failed payment does not upgrade plan | 1. POST `payment.failed` webhook. 2. Assert user plan unchanged. | No upgrade | Plan unchanged |
| TC-S4-02-06 | Integration | Audit log entry created for webhook event | 1. POST webhook event. 2. `GET /api/v1/admin/audit`. 3. Assert event logged with correct type and payment_id. | Audit entry present | Audit record found |
| TC-S4-02-07 | E2E | End-to-end checkout in sandbox (Playwright) | 1. Navigate to `/billing`. 2. Click "Upgrade to Pro". 3. Complete Razorpay sandbox payment. 4. Assert user plan updated in UI. | Checkout completes, plan updated | Playwright assertions pass |
| TC-S4-02-08 | Manual | Production payment test (real card, small amount) | 1. Switch to production mode in staging env. 2. Complete a â‚¹1 test payment. 3. Verify plan upgrade and confirmation email. | Real payment processed correctly | Manual verification by billing admin |

**Regression Scope**

- `backend/app/api/v1/billing.py` â€” webhook handler and checkout flow
- `frontend/src/pages/BillingPage.tsx` â€” checkout initiation
- User plan model in DB â€” plan field must update correctly
- Audit log table â€” new webhook event types
- Email sending service â€” confirmation email must fire on plan upgrade
- Stripe flow (if dual-provider) â€” Razorpay changes must not break Stripe path

---

### S4-03 â€” Auth Hardening: JWT Refresh + HttpOnly Cookie Consideration

**User Story**
As a **security-conscious platform operator**, I want the JWT authentication system to support token refresh to prevent session expiry mid-use, and I want to evaluate and optionally migrate to HttpOnly cookies, so that the platform is hardened against common token theft attacks.

**Persona:** Platform operator / security engineer

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | A user's JWT access token is within 5 minutes of expiry | Any API call is made in `api.ts` | The refresh interceptor silently calls `POST /api/v1/auth/refresh` with the refresh token and updates the access token in localStorage (or cookie) without interrupting the user's action |
| AC2 | The refresh token is expired or invalid | A refresh is attempted | The user is redirected to `/login` with a session-expired message; no 401 errors are shown raw to the user |
| AC3 | A developer reviews the auth hardening documentation | The consideration is evaluated | A documented decision (ADR) exists for HttpOnly cookies: either cookies are implemented, or the rationale for deferring is documented with mitigations (HTTPS-only, short-lived tokens, CSP headers) |
| AC4 | A new login occurs | The JWT is issued | The access token has a max lifetime of 15 minutes; the refresh token has a max lifetime of 7 days (configurable via env vars) |
| AC5 | Two simultaneous API calls are made | Both trigger a refresh | Only one refresh call is made to the backend (refresh deduplication/serialization in `api.ts`); both calls resume with the new token |

**Success Metrics**

- 0 raw 401 errors surfaced to users after token expiry (all handled silently or gracefully)
- Token refresh round-trip â‰¤ 500ms (P95)
- Refresh deduplication: 0 cases of concurrent refresh calls in automated tests
- Security review sign-off: auth ADR documented and approved

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S4-03-01 | Unit | Refresh interceptor fires near expiry | 1. Set JWT with `exp` 4 minutes from now. 2. Make API call via `api.ts`. 3. Assert `POST /api/v1/auth/refresh` called before request. | Refresh triggered | Mock call confirmed |
| TC-S4-03-02 | Unit | Refresh does not fire when token is fresh | 1. Set JWT with `exp` 20 minutes from now. 2. Make API call. 3. Assert refresh NOT called. | No unnecessary refresh | Mock not called |
| TC-S4-03-03 | Unit | Concurrent refresh deduplication | 1. Set token near expiry. 2. Initiate 3 simultaneous API calls. 3. Assert `POST /auth/refresh` called exactly once. | One refresh call | Mock call count = 1 |
| TC-S4-03-04 | Unit | Expired refresh token redirects to login | 1. Mock refresh endpoint returning 401. 2. Make API call with expired access token. 3. Assert `navigate('/login')` called. | Redirect to login | Navigate mock called |
| TC-S4-03-05 | Integration | `/api/v1/auth/refresh` returns new access token | 1. `POST /api/v1/auth/refresh` with valid refresh token. 2. Assert response contains new `access_token`. | New token issued | Token in response |
| TC-S4-03-06 | Integration | Access token lifetime is 15 minutes | 1. Login. 2. Decode JWT. 3. Assert `exp - iat = 900` seconds (15 min). | Correct lifetime | Math assertion |
| TC-S4-03-07 | E2E | Session continues through token refresh (Playwright) | 1. Login. 2. Mock token to expire in 1 minute. 3. Wait 1 minute. 4. Make an action (send message). 5. Assert action succeeds (no 401 error shown). | Seamless refresh | Action succeeds |
| TC-S4-03-08 | Manual | HttpOnly cookie ADR review | 1. Review documented ADR for HttpOnly cookie decision. 2. Verify HTTPS-only enforcement if localStorage retained. 3. Verify CSP header present. | ADR complete and security team approved | Security sign-off |

**Regression Scope**

- `frontend/src/lib/api.ts` â€” all API calls pass through the interceptor
- `backend/app/api/v1/auth.py` â€” new refresh endpoint
- JWT token format â€” `iat`, `exp`, `role` claims must all be preserved
- Google OAuth and magic link flows â€” must work with new token lifecycle
- All protected routes â€” must correctly handle the new token refresh flow

---

### S4-04 â€” OpenAPI Docs Behind Admin Auth

**User Story**
As a **platform administrator**, I want the auto-generated OpenAPI documentation (`/docs` and `/redoc`) to be protected behind admin authentication, so that internal API details are not publicly accessible to potential attackers.

**Persona:** Platform administrator / security engineer

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | An unauthenticated user navigates to `/docs` | No JWT is present | They receive a 401 or 403 response (not the Swagger UI) |
| AC2 | A non-admin authenticated user navigates to `/docs` | They have a valid JWT with `role: user` | They receive a 403 response (not the Swagger UI) |
| AC3 | An admin user navigates to `/docs` | They have a valid JWT with `role: admin` | The FastAPI Swagger UI is rendered correctly |
| AC4 | An admin user navigates to `/redoc` | They have a valid JWT | The ReDoc documentation is rendered correctly |
| AC5 | The `/openapi.json` schema endpoint is accessed | No admin auth provided | The schema is not returned (401/403) â€” the raw schema is also protected |

**Success Metrics**

- 100% of unauthorized `/docs` access attempts return 401/403 (automated test)
- 0 public access to `/docs` in production (network-level and application-level confirmed)
- Admin `/docs` access works correctly and does not require a separate login step (uses existing session JWT)

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S4-04-01 | Integration | Unauthenticated `/docs` returns 401 | 1. `GET /docs` with no Authorization header. 2. Assert 401 response. | HTTP 401 | Status = 401 |
| TC-S4-04-02 | Integration | Non-admin JWT `/docs` returns 403 | 1. Login as `user` role. 2. `GET /docs` with user JWT. 3. Assert 403. | HTTP 403 | Status = 403 |
| TC-S4-04-03 | Integration | Admin JWT `/docs` returns 200 | 1. Login as `admin`. 2. `GET /docs` with admin JWT. 3. Assert 200. | HTTP 200 | Status = 200 |
| TC-S4-04-04 | Integration | `/redoc` protected identically to `/docs` | 1. Repeat TC-S4-04-01, -02, -03 for `/redoc`. | Same access control | All three assertions pass |
| TC-S4-04-05 | Integration | `/openapi.json` protected | 1. `GET /openapi.json` without admin auth. 2. Assert 401/403. | Schema not exposed | Status â‰  200 |
| TC-S4-04-06 | E2E | Admin accesses docs in browser (Playwright) | 1. Login as admin. 2. Navigate to `/docs`. 3. Assert Swagger UI rendered. | UI visible | Playwright assertion |
| TC-S4-04-07 | E2E | Non-admin blocked from docs (Playwright) | 1. Login as regular user. 2. Navigate to `/docs`. 3. Assert Swagger UI NOT rendered. | 403 page shown | Playwright assertion |
| TC-S4-04-08 | Manual | Security penetration test of docs endpoint | 1. Try various bypass techniques (OPTIONS, HEAD, different Accept headers). 2. Try with expired JWT. | All bypass attempts blocked | Security QA sign-off |

**Regression Scope**

- `backend/main.py` or FastAPI app initialization â€” Swagger/ReDoc URL configuration
- All existing API endpoints â€” adding auth middleware must not unintentionally block non-docs routes
- Admin authentication middleware â€” shared with `/admin` endpoints (S2-06)
- CI/CD pipeline â€” integration tests that use `/docs` or `/openapi.json` must be updated to use admin credentials

---

### S4-05 â€” Hosting Migration: Render + Managed Postgres Checklist

**User Story**
As a **DevOps engineer**, I want a comprehensive, step-by-step hosting migration checklist for moving ownNBLM from its current hosting to Render with managed Postgres, so that I can execute the migration confidently without missing critical steps.

**Persona:** DevOps engineer / CTO

**Acceptance Criteria**

| # | Given | When | Then |
|---|-------|------|------|
| AC1 | The checklist is prepared | A DevOps engineer reviews it | It covers all 8 major areas: service configuration, database migration, environment variables, DNS cutover, SSL, performance validation, rollback plan, and post-migration monitoring |
| AC2 | The migration is executed | The database is migrated to managed Postgres | All existing SQLite data is migrated to Postgres with 0 data loss; all Alembic migrations run successfully on the new DB |
| AC3 | The application is deployed on Render | Health checks are configured | `GET /api/health` returns 200; Render's health check endpoint is configured with a 30-second startup grace period |
| AC4 | The migration completes | All services are live on Render | All environment variables are confirmed set in Render dashboard (RAZORPAY_KEY, OPENROUTER_API_KEY, DATABASE_URL, JWT_SECRET, etc.) â€” no vars defaulting to development values |
| AC5 | DNS is cut over | Traffic flows to Render | The old hosting receives 0 requests (confirmed via old server logs); Render serves 100% of traffic; HTTPS works with valid certificate |

**Success Metrics**

- Migration downtime â‰¤ 15 minutes (measured from DNS cutover to full service restoration)
- 0 data loss from SQLite â†’ Postgres migration (row count verification)
- All Alembic migrations apply cleanly to Postgres (0 errors)
- Post-migration: p95 API response time â‰¤ 500ms (Render performance baseline)

**Test Plan**

| TC ID | Type | Title | Steps | Expected Result | Pass Criteria |
|-------|------|-------|-------|-----------------|---------------|
| TC-S4-05-01 | Integration | SQLite â†’ Postgres data migration | 1. Run migration script on copy of production SQLite DB. 2. Count rows in all tables in Postgres. 3. Compare to SQLite counts. | Row counts match | 0 discrepancy |
| TC-S4-05-02 | Integration | All Alembic migrations apply to Postgres | 1. Create fresh Postgres DB. 2. Run `alembic upgrade head`. 3. Assert all migrations applied. | 0 migration errors | Clean apply |
| TC-S4-05-03 | Integration | `GET /api/health` returns 200 on Render | 1. Deploy to Render staging. 2. `GET /api/health`. 3. Assert 200 and `{ status: "ok" }`. | Health check passes | HTTP 200 |
| TC-S4-05-04 | Integration | All env vars present in Render environment | 1. Run env var audit script (list expected vars vs. Render env). 2. Assert no expected vars missing. | All vars present | 0 missing |
| TC-S4-05-05 | Integration | Database connection pool works under load | 1. Simulate 50 concurrent API requests on Render with Postgres. 2. Assert 0 connection pool exhaustion errors. | No pool errors | 0 DB connection errors |
| TC-S4-05-06 | E2E | Full user flow on Render staging | 1. Login â†’ upload source â†’ chat â†’ billing page â€” all on Render staging. 2. Assert all flows complete without error. | All flows work | E2E suite passes on Render |
| TC-S4-05-07 | Manual | DNS cutover test | 1. Update DNS to Render IP in staging domain. 2. Verify DNS propagation. 3. Access via domain. 4. Check HTTPS cert. | Domain resolves to Render with valid SSL | Manual verification |
| TC-S4-05-08 | Manual | Post-migration monitoring review | 1. Check Render logs for first 24 hours post-migration. 2. Check error rates, response times, DB connection health. 3. Verify Huey queue processing on new host. | No elevated error rates | 24-hour monitoring sign-off |

**Regression Scope**

- All API endpoints â€” Postgres queries must be equivalent to SQLite (check SQLAlchemy dialect)
- Huey task queue â€” Redis or new broker must be configured for Render environment
- File storage â€” uploaded files path must be updated (Render ephemeral filesystem â†’ persistent disk or S3)
- Session management â€” Render's multi-instance deployment may require sticky sessions or shared session store
- All previously passing E2E tests â€” must pass against Render staging

---

## Master Regression Suite

The following table consolidates all regression checkpoints across all four sprints. This suite should be run in full before every production deployment.

| RG# | Regression Area | Triggered By | Key File(s) | Key Route(s) | Test IDs to Run |
|-----|-----------------|--------------|-------------|--------------|-----------------|
| RG-01 | Dashboard renders without scaffold copy | S1-01 | `DashboardPage.tsx` | `/` `/dashboard` | TC-S1-01-01 through 06 |
| RG-02 | Session auto-title does not overwrite custom titles | S1-02 | `ChatPage.tsx`, `sessions.py` | `/api/v1/sessions/{id}` | TC-S1-02-02, 07 |
| RG-03 | SSE stream events: content, done, error still work | S1-03, S1-05 | `ChatPage.tsx`, `chat_stream.py` | `/api/v1/chat/stream` | TC-S1-03-01 through 08 |
| RG-04 | Theme persists and no FOIT on reload | S1-04 | `App.tsx` | All routes | TC-S1-04-05, 06 |
| RG-05 | Sonner toasts do not block or duplicate | S1-05 | `ChatPage.tsx`, `App.tsx` | `/chat` | TC-S1-05-03, 07 |
| RG-06 | No native confirm/alert dialogs anywhere in app | S1-06 | `CorpusPage.tsx` | `/corpus` | TC-S1-06-05 (grep check) |
| RG-07 | Source deletion still works via AlertDialog | S1-06 | `CorpusPage.tsx`, `sources.py` | `DELETE /api/v1/sources/{id}` | TC-S1-06-06, 07 |
| RG-08 | Onboarding stepper does not show for existing users | S2-01 | `ChatPage.tsx` | `/chat` | TC-S2-01-02, 04 |
| RG-09 | Citation chips display filename, not UUID | S2-02 | `citation-chips.tsx` | `/chat` | TC-S2-02-07 |
| RG-10 | Citation chip click opens excerpt panel | S2-02, S3-03 | `citation-chips.tsx`, `source-excerpt-panel.tsx` | `/chat` | TC-S2-02-05, TC-S3-03-06 |
| RG-11 | Session rename does not break auto-title | S2-03, S1-02 | Session list, `sessions.py` | `PATCH /api/v1/sessions/{id}` | TC-S2-03-04, TC-S1-02-02 |
| RG-12 | Single-file upload still works after multi-file change | S2-04 | `CorpusPage.tsx`, `sources.py` | `POST /api/v1/sources` | TC-S2-04-05 |
| RG-13 | Enter-to-send not broken by Shift+Enter change | S2-05 | Chat input component | `/chat` | TC-S2-05-01 |
| RG-14 | Admin endpoints return 403 for non-admin users | S2-06, S4-04 | `admin.py`, `app-sidebar.tsx` | `/api/v1/admin/*`, `/admin` | TC-S2-06-04, 08 |
| RG-15 | Ingest pipeline still works after summary task added | S3-01 | `sources.py`, Huey tasks | `POST /api/v1/sources` | TC-S3-01-05 |
| RG-16 | Starter questions hidden when no sources | S3-02 | `ChatPage.tsx` | `/chat` | TC-S3-02-03 |
| RG-17 | Source excerpt panel opens from citations | S3-03 | `source-excerpt-panel.tsx` | `/chat` | TC-S3-03-06 |
| RG-18 | Existing auth flows (login, Google OAuth, magic link) | S3-04, S4-03 | `auth.py`, `LoginPage.tsx` | `/api/v1/auth/*`, `/login` | TC-S3-04-05, TC-S4-03-07 |
| RG-19 | File upload not broken by URL tab addition | S3-05 | `CorpusPage.tsx`, `sources.py` | `POST /api/v1/sources` | TC-S2-04-05, TC-S3-05-04 |
| RG-20 | Desktop sidebar layout unaffected by mobile changes | S3-06 | `AppShell.tsx` | All routes | TC-S3-06-07 |
| RG-21 | Usage bar still shows correct credit percentage | S4-01 | `BillingPage.tsx` | `/billing`, `/api/v1/billing/usage` | TC-S4-01-06 |
| RG-22 | Razorpay webhook idempotency | S4-02 | `billing.py` | `POST /api/v1/billing/webhook` | TC-S4-02-03 |
| RG-23 | JWT token contains all required claims after auth hardening | S4-03 | `auth.py`, `api.ts` | `/api/v1/auth/login`, `/api/v1/auth/refresh` | TC-S4-03-06 |
| RG-24 | Non-docs API routes unaffected by OpenAPI auth | S4-04 | `main.py` or FastAPI init | All `/api/v1/*` routes | TC-S4-04-03 (as sanity) + full API test suite |
| RG-25 | Alembic migrations apply cleanly to Postgres | S4-05 | All migration files | DB schema | TC-S4-05-02 |
| RG-26 | SSE streaming works on Render hosting | S4-05 | `chat_stream.py` | `/api/v1/chat/stream` | TC-S4-05-06 + TC-S1-03-05 |
| RG-27 | Huey tasks process on new hosting environment | S4-05 | All Huey task files | Background tasks | TC-S4-05-08 |
| RG-28 | Login â†’ chat â†’ billing full user journey | All sprints | All pages | All routes | Full E2E smoke suite |
| RG-29 | Share/export functionality not broken by session changes | S1-02, S2-03 | `ChatPage.tsx` | `/share/:token` | Manual smoke test |
| RG-30 | Invite flow not broken by admin role guard | S2-06 | `AdminPage.tsx`, `admin.py` | `/invite/:token`, `/api/v1/admin/invites` | Manual smoke test |

---

## Release Gate Checklists

### Sprint 1 Release Gate Checklist

**Pre-release criteria â€” ALL must be GREEN before Sprint 1 ships to production:**

#### Code Quality Gates
- [ ] `grep -r "Phase 1 scaffold\|TODO\|FIXME" frontend/src/pages/DashboardPage.tsx` returns 0 results
- [ ] `grep -r "window\.confirm\|window\.alert" frontend/src/pages/CorpusPage.tsx` returns 0 results
- [ ] TypeScript compilation: `tsc --noEmit` passes with 0 errors
- [ ] ESLint: `eslint src/` passes with 0 errors (warnings allowed)
- [ ] All new components have `data-testid` attributes for E2E testing

#### Test Gates
- [ ] Unit test suite: 100% pass rate (0 failures, 0 errors)
- [ ] TC-S1-01-01 through TC-S1-01-04: all pass
- [ ] TC-S1-02-01 through TC-S1-02-05: all pass
- [ ] TC-S1-03-01 through TC-S1-03-04: all pass
- [ ] TC-S1-04-01 through TC-S1-04-04: all pass
- [ ] TC-S1-05-01 through TC-S1-05-06: all pass
- [ ] TC-S1-06-01 through TC-S1-06-06: all pass
- [ ] Integration tests: `pytest tests/integration/ -k sprint1` passes
- [ ] E2E smoke suite: TC-S1-01-04, TC-S1-02-06, TC-S1-03-05, TC-S1-04-05, TC-S1-05-07, TC-S1-06-07 all pass

#### Regression Gates
- [ ] RG-03: SSE streaming still works (content, done, error events)
- [ ] RG-06: Zero native dialogs in codebase (CI grep check passes)
- [ ] RG-07: Source deletion works via new AlertDialog
- [ ] RG-28: Full login â†’ chat â†’ billing journey passes E2E

#### Manual QA Sign-off
- [ ] TC-S1-01-05, TC-S1-01-06: Dashboard visual review â€” PM sign-off
- [ ] TC-S1-02-08: Auto-title quality review â€” PM sign-off
- [ ] TC-S1-03-07, TC-S1-03-08: Typing indicator on slow network â€” QA sign-off
- [ ] TC-S1-04-07, TC-S1-04-08: Theme persistence on all routes â€” QA sign-off
- [ ] TC-S1-05-08: Toast visual quality â€” QA sign-off
- [ ] TC-S1-06-08: AlertDialog UX review â€” QA sign-off

#### Security / Production Readiness
- [ ] `localStorage` key naming follows convention (`ownNBLM_theme`)
- [ ] No sensitive data logged to browser console
- [ ] Sonner toast does not display raw API error messages to users
- [ ] PATCH `/api/v1/sessions/{id}` has proper ownership check (user can only patch their own sessions)

---

### Sprint 2 Release Gate Checklist

**Pre-release criteria â€” ALL must be GREEN before Sprint 2 ships to production:**

#### Code Quality Gates
- [ ] Admin role guard: `grep -r "Admin" frontend/src/components/app-sidebar.tsx` â€” Admin item is conditionally rendered
- [ ] TypeScript compilation: `tsc --noEmit` passes with 0 errors
- [ ] No hardcoded UUIDs displayed to users (`grep -r "chunk_id\|[0-9a-f-]\{36\}" frontend/src/components/citation-chips.tsx` returns 0 display instances)
- [ ] All new API endpoints have OpenAPI schema annotations
- [ ] Multi-file upload input has `multiple` attribute (CI assertion)

#### Test Gates
- [ ] TC-S2-01-01 through TC-S2-01-05: all pass
- [ ] TC-S2-02-01 through TC-S2-02-06: all pass
- [ ] TC-S2-03-01 through TC-S2-03-06: all pass
- [ ] TC-S2-04-01 through TC-S2-04-06: all pass
- [ ] TC-S2-05-01 through TC-S2-05-04: all pass
- [ ] TC-S2-06-01 through TC-S2-06-06: all pass
- [ ] E2E: TC-S2-01-06, TC-S2-02-07, TC-S2-03-07, TC-S2-04-07, TC-S2-05-05, TC-S2-06-06, TC-S2-06-07 all pass

#### Regression Gates
- [ ] RG-02: Auto-title does not overwrite custom-renamed sessions
- [ ] RG-09: Citation chips show filename (not UUID)
- [ ] RG-10: Citation chip click opens excerpt panel
- [ ] RG-11: Session rename does not break auto-title
- [ ] RG-12: Single-file upload still functional
- [ ] RG-13: Enter-to-send not broken
- [ ] RG-14: Admin endpoints return 403 for non-admin users

#### Manual QA Sign-off
- [ ] TC-S2-01-07, TC-S2-01-08: Onboarding stepper visual + accessibility review
- [ ] TC-S2-02-08: Citation chip quality on multiple sources
- [ ] TC-S2-03-08: Session list readability with 5+ sessions
- [ ] TC-S2-04-08: Multi-file upload progress and error UX
- [ ] TC-S2-05-06, TC-S2-05-07: Multi-line message display on desktop and mobile
- [ ] TC-S2-06-08: Security penetration check â€” JWT role tamper test

#### Security / Production Readiness
- [ ] Admin route has BOTH client-side guard (hidden nav) AND server-side 403 (backend auth check)
- [ ] `PATCH /api/v1/sessions/{id}` with `title_is_custom` flag correctly stored in DB
- [ ] Multi-file upload: file size and type validation on both client and server
- [ ] Session rename: input sanitized against XSS (special characters in title handled correctly)

---

### Sprint 3 Release Gate Checklist

**Pre-release criteria â€” ALL must be GREEN before Sprint 3 ships to production:**

#### Code Quality Gates
- [ ] TypeScript compilation: `tsc --noEmit` passes with 0 errors
- [ ] New Huey tasks registered in task discovery configuration
- [ ] URL ingestion: URL validation using `urllib.parse` or equivalent before fetching
- [ ] Password reset tokens stored hashed in DB (not plaintext)
- [ ] Mobile breakpoint uses consistent `768px` threshold across all affected components

#### Test Gates
- [ ] TC-S3-01-01 through TC-S3-01-06: all pass
- [ ] TC-S3-02-01 through TC-S3-02-06: all pass
- [ ] TC-S3-03-01 through TC-S3-03-05: all pass
- [ ] TC-S3-04-01 through TC-S3-04-06: all pass
- [ ] TC-S3-05-01 through TC-S3-05-06: all pass
- [ ] TC-S3-06-01 through TC-S3-06-05: all pass
- [ ] E2E: TC-S3-01-07, TC-S3-02-07, TC-S3-03-06, TC-S3-04-07, TC-S3-05-07, TC-S3-06-06, TC-S3-06-07 all pass

#### Regression Gates
- [ ] RG-15: Ingest pipeline still functions after document summary task added
- [ ] RG-16: Starter questions hidden for users without sources
- [ ] RG-17: Source excerpt panel opens correctly
- [ ] RG-18: Existing login, Google OAuth, magic link all work
- [ ] RG-19: File upload not broken by URL tab
- [ ] RG-20: Desktop sidebar layout unaffected on 1440px viewport

#### Manual QA Sign-off
- [ ] TC-S3-01-08: Document summary quality across 5 document types â€” PM sign-off
- [ ] TC-S3-02-08: Starter question relevance review â€” PM sign-off
- [ ] TC-S3-03-07, TC-S3-03-08: Excerpt panel visual + mobile bottom sheet
- [ ] TC-S3-04-08: Password reset security review â€” security team sign-off
- [ ] TC-S3-05-08: URL source usable in chat
- [ ] TC-S3-06-08: Mobile UX review on real iPhone and Android devices

#### Security / Production Readiness
- [ ] Password reset: tokens expire after 15 minutes (configurable)
- [ ] Password reset: no email enumeration (same response for known/unknown emails)
- [ ] Password reset: tokens are single-use (invalidated after first use)
- [ ] URL ingestion: SSRF protection â€” blocked internal IP ranges (10.x, 172.16.x, 192.168.x, 127.x, localhost)
- [ ] URL ingestion: file size limit enforced for fetched URLs (no 1GB+ pages)
- [ ] Document summary LLM call: included in credit accounting

---

### Sprint 4 Release Gate Checklist

**Pre-release criteria â€” ALL must be GREEN before Sprint 4 ships to production:**

#### Code Quality Gates
- [ ] TypeScript compilation: `tsc --noEmit` passes with 0 errors
- [ ] `RAZORPAY_MODE` env var checked at startup â€” server refuses to start if not set to `sandbox` or `production`
- [ ] JWT lifetime configured via env vars (`ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`) â€” no hardcoded values
- [ ] `/docs` and `/redoc` routes explicitly configured with auth dependency in FastAPI app initialization
- [ ] Alembic migration for any schema changes in this sprint: `alembic revision --autogenerate` reviewed and committed

#### Test Gates
- [ ] TC-S4-01-01 through TC-S4-01-06: all pass
- [ ] TC-S4-02-01 through TC-S4-02-06: all pass
- [ ] TC-S4-03-01 through TC-S4-03-06: all pass
- [ ] TC-S4-04-01 through TC-S4-04-06: all pass
- [ ] TC-S4-05-01 through TC-S4-05-06: all pass
- [ ] E2E: TC-S4-01-07, TC-S4-02-07, TC-S4-03-07, TC-S4-04-06, TC-S4-04-07, TC-S4-05-06 all pass
- [ ] Razorpay webhook: idempotency test TC-S4-02-03 passes
- [ ] JWT refresh deduplication: TC-S4-03-03 passes

#### Regression Gates
- [ ] RG-21: Usage bar shows correct credit percentage after billing redesign
- [ ] RG-22: Razorpay webhook idempotency confirmed
- [ ] RG-23: JWT contains all required claims after auth hardening
- [ ] RG-24: All non-docs API routes return correct responses (not blocked by new auth)
- [ ] RG-25: Alembic migrations apply cleanly to fresh Postgres DB
- [ ] RG-26: SSE streaming works on Render hosting
- [ ] RG-27: Huey tasks process on Render environment
- [ ] RG-28: Full E2E smoke suite passes on Render staging

#### Manual QA Sign-off
- [ ] TC-S4-01-08: Billing page design review â€” design and PM sign-off
- [ ] TC-S4-02-08: Real production payment test â€” billing admin sign-off
- [ ] TC-S4-03-08: HttpOnly cookie ADR reviewed and approved â€” security team sign-off
- [ ] TC-S4-04-08: Security penetration test of docs endpoint â€” security team sign-off
- [ ] TC-S4-05-07: DNS cutover test â€” devops sign-off
- [ ] TC-S4-05-08: 24-hour post-migration monitoring review â€” devops and CTO sign-off

#### Security / Production Readiness
- [ ] All production env vars confirmed set in Render dashboard (checklist from TC-S4-05-04)
- [ ] `RAZORPAY_LIVE_KEY_ID` and `RAZORPAY_LIVE_KEY_SECRET` set in production only (not committed to git)
- [ ] `JWT_SECRET` is a cryptographically random 256-bit string in production
- [ ] HTTPS enforced: HTTP requests redirected to HTTPS at Render or reverse proxy level
- [ ] `Content-Security-Policy` header present and configured
- [ ] `X-Content-Type-Options: nosniff` header present
- [ ] Database backup strategy configured for managed Postgres (daily automated backups confirmed in Render)
- [ ] Render `RENDER_SERVICE_TYPE` is `web` with health check path `/api/health` and 30s grace period
- [ ] Huey worker configured as a separate Render background worker service (not embedded in web process)

---

*Document end. Total: 4 Sprints Â· 23 Stories Â· 184 Test Cases Â· 30 Regression Checkpoints Â· 4 Release Gate Checklists.*