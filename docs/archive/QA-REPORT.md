# CORTEX QA & Smoke Test Report

**Date:** 2026-05-21  
**Package:** `cortex` 0.1.0 (`pyproject.toml`)  
**Environment:** macOS; `POSTGRES_PASSWORD=cortex-dev docker compose up -d`; API `:8000`, frontend dev `:3000`  
**Runner:** Local verification (CI-equivalent commands)

## Executive summary

| Area | Result | Notes |
|------|--------|-------|
| Frontend QA (tsc, lint, vitest, build) | **PASS** | 0 ESLint errors; 56 `security/detect-object-injection` warnings (accepted) |
| Frontend `npm audit --audit-level=high` | **PASS** | 0 high; 6 moderate (dev tooling / Vite chain) |
| Backend Ruff | **PASS** | 4 unused-import issues auto-fixed during this run |
| Backend Bandit (`-ll`) | **PASS** | 0 High/Medium; 15 Low (informational) |
| Backend Mypy (`api`, `core`) | **WARN** | 33 errors (mostly `no-any-return`, Starlette handler typing) — not CI-gated |
| Backend pytest (Compose DB) | **PARTIAL** | **135 passed**, **2 failed**, **10 skipped** |
| `pip-audit` | **FAIL** | 1 CVE: `idna` 3.13 → fix 3.15 |
| HTTP smoke `smoke_happy_path.sh` | **PASS** | Full spine |
| HTTP smoke `smoke_ingest_llm.sh` | **PASS** | Track B ingest SSE |
| HTTP smoke `smoke_assessment_llm.sh` | **FAIL** | SSE stream missing `run_done` (live API) |

## Frontend

| Command | Exit | Detail |
|---------|------|--------|
| `npx tsc --noEmit` | 0 | Strict TypeScript clean |
| `npm run lint` | 0 | 56 warnings, 0 errors |
| `npm run test` (Vitest) | 0 | 5 tests / 3 files |
| `npm run build` | 0 | Vite production build OK |
| `npm audit --audit-level=high` | 0 | No high severity |

**Vitest:** `frameworkRegistry.test.ts`, `frameworkIds.test.ts`, `Login.dashboard.test.tsx`.

**Manual UI (5 min):** Not run in this session — use checklist in [`docs/RELEASE_QA.md`](docs/RELEASE_QA.md) §4 against http://localhost:3000.

**Recent UX restore:** `/intelligence` renders Audit Simulator, Telemetry Fusion, Regulation Intel, and Evidence Vault (demo tabs). `/ai-systems` inventory/classification/obligations restored with **DEMO DATA** badges when `aiSystemsLive` is false.

## Backend — static analysis

| Tool | Scope | Result |
|------|-------|--------|
| Ruff | `api`, `core`, `compliance`, `db`, `ontology`, `services/compliance-engine/app`, `tests` | All checks passed |
| Bandit | Same app paths, `-ll`, skip B101 | No High/Medium; 15 Low |
| Mypy | `api`, `core` | 33 errors — track for cleanup; not in default CI job |

**Ruff fixes applied (2026-05-21):** Removed unused imports in `core/evidence_persistence.py`, `tests/test_assessment_llm.py`, `tests/test_report_pdf.py`.

## Backend — pytest (authoritative: Compose network)

```bash
docker compose run --rm --no-deps \
  -e DATABASE_URL=postgresql+asyncpg://cortex:cortex-dev@postgres:5432/cortex \
  -e PYTHONPATH=/app:.:/app/services/compliance-engine \
  -e CORTEX_DISABLE_RATE_LIMIT=1 -e CORTEX_TESTING=1 \
  -v "$(pwd)":/app -w /app api \
  sh -c 'pip install -q pytest pytest-asyncio psycopg2-binary && python -m pytest -q --tb=line'
```

**Result:** 135 passed, 2 failed, 10 skipped (51s).

| Failed test | Likely cause |
|-------------|----------------|
| `tests/test_llm_providers.py::test_router_uses_stub_when_only_stub_configured` | API container sets `CORTEX_LLM_PROVIDERS=anthropic,openai,stub`; test expects stub-only chain |
| `tests/test_api_assessments.py::test_assessments_run_accepts_valid_org_and_streams` | SSE assessment stream / timeout / LLM path vs test expectations |

**Host pytest against `127.0.0.1:5432`:** 126 passed, 10 failed — **do not use** when a non-Compose Postgres is bound to 5432 (password mismatch). Prefer the Docker command above.

## Security — dependency audit

| Tool | Result |
|------|--------|
| `pip-audit` (`.venv`, project install) | **1 vulnerability:** `idna` 3.13 — [CVE-2026-45409](https://nvd.nist.gov/) — upgrade to **≥ 3.15** |
| `npm audit --audit-level=high` | 0 high |

**Remediation:** `pip install 'idna>=3.15'` or bump transitive pin in lock/constraints; re-run `pip-audit`.

## HTTP smoke scripts

| Script | Result | Notes |
|--------|--------|-------|
| `scripts/smoke_happy_path.sh` | **PASS** | health → ready → login → frameworks → review → approve → Shasta contract |
| `scripts/smoke_ingest_llm.sh` | **PASS** | `active_chain=anthropic,stub`; ingest/document SSE |
| `scripts/smoke_assessment_llm.sh` | **FAIL** | Login OK; SSE missing terminal `run_done` event |

**Re-run smokes (API on :8000):**

```bash
bash scripts/smoke_happy_path.sh
bash scripts/smoke_ingest_llm.sh
bash scripts/smoke_assessment_llm.sh   # investigate if failing
```

## API spot-checks (live stack)

Against `http://127.0.0.1:8000` after `smoke_happy_path.sh`:

| Endpoint | Status |
|----------|--------|
| `GET /health` | ✅ `{"status":"ok"}` |
| `GET /ready` | ✅ (smoke script) |
| `POST /api/v1/auth/token` | ✅ |
| `GET /api/v1/frameworks` | ✅ |
| `GET /api/v1/assessments/review-queue` | ✅ |

## Sign-off

- [x] Frontend build + unit tests pass
- [x] Ruff + Bandit pass (CI-aligned)
- [x] Primary HTTP smoke (`smoke_happy_path.sh`) pass
- [x] Track B ingest smoke pass
- [ ] All pytest green on Compose DB (2 failures — see above)
- [ ] Track A assessment smoke (`run_done`)
- [ ] `pip-audit` clean (`idna` bump)
- [ ] Manual UX checklist ([`docs/RELEASE_QA.md`](docs/RELEASE_QA.md) §4)

## Related docs

- [`docs/RELEASE_QA.md`](docs/RELEASE_QA.md) — repeatable commands before release
- [`SAST-REPORT.md`](SAST-REPORT.md) — static analysis detail
- [`SECURITY_REPORT.md`](SECURITY_REPORT.md) — historical security posture
- [`../RELEASE_QA.md`](../RELEASE_QA.md) — release checklist
- [`SECURITY.md`](SECURITY.md) — policy and architecture controls
