# CORTEX QA Smoke Test Report

Date: Friday May 1, 2026  
Version: v0.7.4  
Tester: CORTEX Agent  

## Environment

- Docker: `POSTGRES_PASSWORD=cortex-dev docker compose up -d` — postgres healthy, API on `:8000`
- Frontend: `npm run build` (production) — **PASS**, zero TypeScript errors

## API Health Checks

All checks run against `http://localhost:8000` with a JWT from `POST /api/v1/auth/token` (`username=admin`, `password=admin`) except where noted.

| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /health | ✅ | `{"status":"ok"}` |
| POST /api/v1/auth/token | ✅ | Access token prefix `eyJ` |
| POST /api/v1/auth/register | ✅ | Returns `access_token`; sample org id prefix `org-` |
| GET /api/v1/organisations/demo-org-001/posture | ✅ | **58** overall score via JSON key **`overallScore`** (camelCase). Checklist snippets using `overall_score` will show `None` — response is alias-serialized per `CompliancePosture`. |
| GET /api/v1/frameworks | ✅ | 8 frameworks |
| GET /api/v1/groups/posture | ✅ | `entities` / aggregate fields present |
| GET /api/v1/assessments/review-queue | ✅ | 8 items (threshold “> 0” satisfied) |
| GET /api/v1/reports/executive-summary | ✅ | Report score **58**, **10** top critical findings |
| GET /api/v1/skills/status | ✅ | **4** skills loaded (unauthenticated) |
| GET /api/v1/integrations | ✅ | **6** integrations |

## Frontend Screens

**Section 2 (manual UI)** was **not executed in this session**: the agent cannot open an incognito browser or interact with live `:3000` dev UI. Use the checklist in the QA brief against `http://localhost:3000` after `cd frontend && npm run dev`.

Static verification performed:

- `npm run build` — **PASS**
- `App.tsx`: 10 `NAV_ITEMS`, keyboard shortcuts (`d/g/i/a/r/h`, Esc), `DemoToggle`, `HelpPanel`, routes for dashboard, group, frameworks (same shell as dashboard), intelligence, AI systems, review queue, remediation (`/evidence`), audit report, integrations, roadmap.

| Screen | Items | Pass | Fail | Notes |
|--------|-------|------|------|-------|
| Login | 8 | — | — | Manual |
| Register | 9 | — | — | Manual |
| Onboarding | 9 | — | — | Manual |
| Dashboard | 12 | — | — | Manual |
| Group | 9 | — | — | Manual |
| Frameworks | 4 | — | — | Manual (`/frameworks` → `ComplianceDashboard`) |
| Intelligence | 28 | — | — | Manual |
| AI Systems | 16 | — | — | Manual |
| Review Queue | 9 | — | — | Manual |
| Remediation | 6 | — | — | Manual (`/evidence`) |
| Audit Report | 17 | — | — | Manual |
| Integrations | 9 | — | — | Manual |
| Roadmap | 7 | — | — | Manual |
| Demo Toggle | 8 | — | — | Manual |
| Help Panel | 11 | — | — | Manual |
| Keyboard Nav | 7 | — | — | Manual |
| Navbar | 10 | — | — | Manual |

## Failures Fixed

1. **API container crash on startup (`NameError: Boolean`)**  
   - **Cause:** `api/auth.py` used `Boolean` in SQLAlchemy `Table()` definition without importing it.  
   - **Fix:** Added `Boolean` to the `sqlalchemy` import list in `api/auth.py`.  
   - **Re-test:** `docker compose up -d --build api`; GET `/health` ✅; token and downstream endpoints ✅.

## Known Issues

1. **QA curl one-liner for posture** — Use `overallScore` (or parse both) when asserting demo posture score in shell/Python; Pydantic emits camelCase for the frontend contract.  
2. **Section 2 checklist** — Requires human pass/fail in incognito with clean `localStorage`.  
3. **Local pytest** — `tests/test_api_posture.py` needs project deps installed in the active Python env (e.g. `pip install -e .`); collection failed here on missing `slowapi` under system Python 3.9.

## Sign-off

- [ ] All CRITICAL failures fixed (API blocker fixed; UI unverified this run)
- [ ] No console errors on key screens (manual)
- [x] `npm run build` passes
- [ ] Auth flow end-to-end working (manual incognito)
- [ ] Demo flow register → dashboard (manual incognito)
