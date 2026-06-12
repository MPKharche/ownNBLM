# QA Audit Report - ownNBLM
**Date:** June 12, 2026  
**Auditor:** Senior QA Manager/Architect  
**Severity Levels:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Executive Summary

The application has **CRITICAL deployment architecture issues** preventing production use. The frontend is deployed on Vercel but cannot communicate with the backend API, resulting in widespread 500 errors. The root cause is an incomplete deployment strategy where the frontend expects a live backend API but none is available in production.

**Current State:** ❌ NOT PRODUCTION READY  
**Blockers:** 3 Critical, 5 High, 8 Medium issues identified

---

## Critical Issues (Production Blockers) 🔴

### 1. Frontend-Backend Disconnection
**Severity:** 🔴 CRITICAL  
**Location:** Deployment Architecture  
**Impact:** Complete application failure in production

**Evidence from Screenshot:**
```
Failed to load resource: the server responded with a status of 500 ()
- api/v1/sources:1 - 500 error
- api/v1/sessions:1 - 500 error  
- api/v1/notebooks:1 - 500 error
- index-h4PBHsyE.js:2:49608 - Uncaught (in promise) Error
```

**Root Cause:**
- Frontend deployed to Vercel: `frontend-jet-ten-16.vercel.app`
- Backend expects to run on port 8000 (FastAPI + uvicorn)
- Vercel is serverless and CANNOT run FastAPI/PostgreSQL/Huey stack
- Frontend's `VITE_API_URL` is pointing to a non-existent or unreachable backend
- The `vercel.json` shows "Internal Server Error" - likely serving static maintenance page

**Fix Required:**
1. Deploy backend to a proper server (Render, Fly.io, Railway, or dedicated VPS)
2. Update frontend `VITE_API_URL` to point to deployed backend
3. Configure CORS on backend to allow Vercel frontend origin
4. Set up proper environment variables in Vercel

---

### 2. Missing API Backend Deployment
**Severity:** 🔴 CRITICAL  
**Location:** Infrastructure  
**Impact:** All API calls fail, application unusable

**Current State:**
- ✅ Backend runs locally (confirmed via curl tests)
- ❌ No production backend deployed
- ❌ Frontend environment variables likely pointing to wrong URL

**Evidence:**
- Memory note: "Production on hold — VPS API stopped, Vercel shows maintenance page only"
- All frontend API calls return 500 errors
- Health check works on localhost:8000 but not accessible to Vercel

**Fix Required:**
1. Deploy backend to always-on infrastructure
2. Ensure PostgreSQL database is accessible
3. Configure Redis/task queue (Huey)
4. Set all backend environment variables
5. Update frontend VITE_API_URL in Vercel settings

---

### 3. No Error Boundaries in Frontend
**Severity:** 🔴 CRITICAL  
**Location:** `src/pages/CorpusPage.tsx` and other pages  
**Impact:** Unhandled promise rejections crash UI

**Evidence from Screenshot:**
```
Uncaught (in promise) Error at Z (index-h4PBHsyE.js:2:49608)
at async e (ChatPage-DqmM1QRP.js:1:1395)
```

**Current Code Issues:**
- CorpusPage.tsx line 150: `api<Source[]>("/api/v1/sources").then(setSources).catch(console.error)`
- Error caught but not displayed to user
- No React Error Boundary wrapping routes
- Promise rejections not handled in async functions

**Fix Required:**
1. Add React Error Boundary component
2. Wrap all routes with error boundary
3. Display user-friendly error messages
4. Add loading states before API calls
5. Implement retry mechanisms

---

## High Priority Issues 🟠

### 4. Missing Frontend Environment Configuration
**Severity:** 🟠 HIGH  
**Location:** Vercel deployment  
**Impact:** API calls fail due to incorrect base URL

**Current Code:**
```typescript
// src/lib/api.ts:1
const API_BASE = import.meta.env.VITE_API_URL ?? ""
```

**Issues:**
- Empty string fallback means relative URLs will fail
- Vercel environment variables likely not set
- No validation that API_BASE is properly configured

**Fix Required:**
1. Set `VITE_API_URL` in Vercel environment variables
2. Add startup validation to check API_BASE is defined
3. Show configuration error to user if missing
4. Document required environment variables

---

### 5. No Network Error Handling
**Severity:** 🟠 HIGH  
**Location:** `src/lib/api.ts:20-40`  
**Impact:** Network failures show cryptic errors

**Current Code:**
```typescript
export async function api<T = void>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string>) },
  })
  if (res.status === 401) {
    clearAuth()
    setTimeout(() => { window.location.href = "/login?reason=session_expired" }, 100)
    throw new Error("Session expired. Redirecting to sign-in…")
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail))
  }
  // ...
}
```

**Issues:**
- No handling for network offline/timeout
- No retry logic for transient failures
- No differentiation between 5xx server errors and 4xx client errors
- Error messages not user-friendly

**Fix Required:**
1. Add network error detection (TypeError from fetch)
2. Implement exponential backoff retry for 5xx errors
3. Show "Server unavailable" vs "Bad request" messages
4. Add request timeout handling

---

### 6. CORS Configuration Missing
**Severity:** 🟠 HIGH  
**Location:** Backend `app/main.py:103-110`  
**Impact:** Frontend may be blocked by CORS even when backend is deployed

**Current Code:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://([a-z0-9-]+\.)*vercel\.app" if settings.is_production else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Issues:**
- Depends on `settings.cors_origin_list` being properly set
- Regex allows all vercel.app subdomains (security risk)
- No validation that frontend origin is in allowlist

**Fix Required:**
1. Explicitly set allowed origins in .env.production
2. Tighten regex to specific Vercel project
3. Add OPTIONS preflight handling
4. Log CORS rejections for debugging

---

### 7. Missing Loading States
**Severity:** 🟠 HIGH  
**Location:** Multiple pages  
**Impact:** Users see blank screens during API calls

**Evidence:**
- CorpusPage shows "No documents yet" immediately even while loading
- No skeleton loaders
- No loading spinners except during upload

**Fix Required:**
1. Add loading state to all data fetching
2. Implement skeleton loaders
3. Show loading indicator for initial page load
4. Add "Connecting to server..." message

---

### 8. Development User ID Hardcoded
**Severity:** 🟠 HIGH  
**Location:** `src/lib/api.ts:3,16`  
**Impact:** Security vulnerability if deployed without auth

**Current Code:**
```typescript
const DEV_USER_ID = "00000000-0000-4000-8000-000000000001"
// ...
if (token) h.Authorization = `Bearer ${token}`
else if (import.meta.env.DEV) h["X-Dev-User-Id"] = DEV_USER_ID
```

**Issues:**
- Dev bypass still present in code
- Could be accidentally enabled in production
- No warning when running without auth

**Fix Required:**
1. Remove dev user ID from production build
2. Add runtime check to prevent dev mode in production
3. Require proper authentication in all environments

---

## Medium Priority Issues 🟡

### 9. Missing Request ID Correlation
**Severity:** 🟡 MEDIUM  
**Location:** Error handling throughout app  
**Impact:** Difficult to debug production issues

**Current State:**
- Backend generates X-Request-ID headers
- Frontend doesn't capture or display them
- Errors don't include request IDs

**Fix Required:**
1. Capture X-Request-ID from responses
2. Include in error messages
3. Log to console for debugging
4. Show to users in error dialogs

---

### 10. No Offline Detection
**Severity:** 🟡 MEDIUM  
**Location:** Frontend  
**Impact:** Poor UX when network is down

**Fix Required:**
1. Listen to `navigator.onLine` events
2. Show "You are offline" banner
3. Queue failed requests for retry
4. Disable upload when offline

---

### 11. Missing Request Timeouts
**Severity:** 🟡 MEDIUM  
**Location:** `src/lib/api.ts`  
**Impact:** Requests can hang indefinitely

**Fix Required:**
1. Add AbortController with timeout
2. Set reasonable timeout (30s for uploads, 10s for queries)
3. Show timeout error to user

---

### 12. No Rate Limit Feedback
**Severity:** 🟡 MEDIUM  
**Location:** Frontend error handling  
**Impact:** Users don't know why requests are failing

**Current State:**
- Backend has rate limiting (slowapi)
- Frontend doesn't detect 429 responses
- No backoff or retry-after handling

**Fix Required:**
1. Detect 429 status codes
2. Parse Retry-After header
3. Show "Please wait X seconds" message
4. Auto-retry after delay

---

### 13. Console Errors Not Monitored
**Severity:** 🟡 MEDIUM  
**Location:** Production deployment  
**Impact:** Production errors go unnoticed

**Fix Required:**
1. Integrate error monitoring (Sentry, LogRocket)
2. Capture unhandled promise rejections
3. Send to logging service
4. Alert on critical errors

---

### 14. Missing Health Check UI
**Severity:** 🟡 MEDIUM  
**Location:** Frontend  
**Impact:** Users can't tell if backend is down

**Fix Required:**
1. Call `/health` endpoint on app load
2. Show status indicator in UI
3. Display degraded mode warning
4. Poll health check periodically

---

### 15. Folder Path Not Displayed
**Severity:** 🟡 MEDIUM  
**Location:** `src/pages/CorpusPage.tsx`  
**Impact:** Minor UX issue, folder_path exists but not validated

**Current State:**
- API returns `folder_path: null` for all sources
- Frontend has folder tree UI built
- Upload code sets folder_path but backend may not persist it

**Fix Required:**
1. Verify backend persists folder_path
2. Test folder upload end-to-end
3. Fix any backend schema issues

---

### 16. No API Response Caching
**Severity:** 🟡 MEDIUM  
**Location:** API client  
**Impact:** Redundant requests

**Fix Required:**
1. Implement SWR or React Query
2. Cache GET requests
3. Invalidate on mutations
4. Reduce server load

---

## Low Priority Issues 🟢

### 17. Magic Numbers in Code
**Severity:** 🟢 LOW  
**Location:** Multiple files  
**Example:** `setTimeout(() => setSuccessMsg(null), 5000)` in CorpusPage:225

**Fix Required:** Extract to named constants

---

### 18. Missing TypeScript Strict Mode
**Severity:** 🟢 LOW  
**Location:** `tsconfig.json`  

**Fix Required:** Enable strict mode for better type safety

---

### 19. Inconsistent Error Messages
**Severity:** 🟢 LOW  
**Location:** Throughout app  

**Fix Required:** Standardize error message format

---

## Production Readiness Checklist

### ❌ Critical Requirements (Must Fix)
- [ ] Deploy backend to production infrastructure
- [ ] Configure frontend VITE_API_URL
- [ ] Add React Error Boundaries
- [ ] Implement proper error handling in all API calls
- [ ] Set up CORS properly
- [ ] Remove dev mode bypasses from production builds

### ❌ High Priority (Should Fix)
- [ ] Add loading states everywhere
- [ ] Implement retry logic
- [ ] Add network error handling
- [ ] Configure environment variables properly
- [ ] Add health check monitoring

### ⚠️ Medium Priority (Nice to Have)
- [ ] Add offline detection
- [ ] Implement request timeouts
- [ ] Add rate limit handling
- [ ] Set up error monitoring (Sentry)
- [ ] Add request ID correlation
- [ ] Implement response caching

### 🟢 Low Priority (Can Wait)
- [ ] Refactor magic numbers
- [ ] Enable TypeScript strict mode
- [ ] Standardize error messages

---

## Recommended Fix Order

### Phase 1: Make It Work (Critical) - Est. 4-6 hours
1. Deploy backend to Render/Fly/Railway
2. Update Vercel environment variables
3. Test full deployment
4. Add error boundaries
5. Verify CORS configuration

### Phase 2: Make It Reliable (High) - Est. 3-4 hours
1. Add loading states to all pages
2. Implement network error handling
3. Add retry logic
4. Remove dev mode bypasses
5. Add health check UI

### Phase 3: Make It Robust (Medium) - Est. 4-5 hours
1. Add offline detection
2. Implement request timeouts
3. Add rate limit handling
4. Set up error monitoring
5. Add request ID correlation

### Phase 4: Polish (Low) - Est. 2-3 hours
1. Refactor constants
2. Enable strict TypeScript
3. Standardize messaging

---

## Infrastructure Recommendations

### Backend Deployment Options

**Option 1: Render.com (Recommended)**
- ✅ Free tier available
- ✅ Managed PostgreSQL included
- ✅ Easy deployment from GitHub
- ✅ Automatic HTTPS
- ⚠️ Cold starts on free tier

**Option 2: Fly.io**
- ✅ Good performance
- ✅ Free allowance
- ✅ PostgreSQL available
- ⚠️ More complex setup

**Option 3: Railway.app**
- ✅ Simple deployment
- ✅ Managed PostgreSQL
- ✅ Free trial credits
- ⚠️ Paid only after trial

**Option 4: Dedicated VPS (Current Plan)**
- ✅ Full control
- ✅ Cost-effective long-term
- ⚠️ Requires maintenance
- ⚠️ Need to manage updates/security

### Frontend Configuration
- Keep on Vercel (works well for React)
- Set environment variables in Vercel dashboard
- Point VITE_API_URL to deployed backend
- Enable preview deployments for testing

---

## Testing Gaps Identified

1. **No end-to-end tests** - Need Playwright/Cypress tests
2. **No API integration tests** - Backend endpoints not tested together
3. **No error scenario tests** - Network failures not covered
4. **No load testing** - Performance under stress unknown
5. **No security testing** - OWASP vulnerabilities not checked

---

## Security Concerns

1. **CORS too permissive** - Allows all *.vercel.app domains
2. **Dev mode bypass present** - Could be exploited
3. **No rate limiting on frontend** - Could hammer backend
4. **Error messages too detailed** - May leak sensitive info
5. **No CSRF protection** - Cookies not secure

---

## Documentation Gaps

1. Deployment instructions incomplete
2. Environment variables not documented
3. Troubleshooting guide missing
4. API documentation not linked
5. Architecture diagram needed

---

## Conclusion

The application has **solid foundations** with a clean architecture and modern stack, but suffers from **incomplete deployment** that makes it non-functional in production. The local development environment works correctly, but the production deployment strategy was not completed.

**Estimated Time to Production Ready:** 11-15 hours of focused work

**Top 3 Actions:**
1. **Deploy backend properly** (4 hours)
2. **Fix frontend error handling** (3 hours)  
3. **End-to-end testing** (4 hours)

Once these issues are addressed, the application can be safely deployed to production.
