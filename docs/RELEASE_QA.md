# Astra GRC — Release QA & security checklist

Run before tagging a release or merging main-facing work. Commands assume repo root and match CI intent.

## Latest verification run (2026-05-21)

| Step | Status | Notes |
|------|--------|-------|
| Frontend `tsc` / lint / test / build | ✅ | 5 Vitest tests; 56 ESLint security warnings (0 errors) |
| `npm audit --audit-level=high` | ✅ | 6 moderate (dev-only) |
| Ruff + Bandit | ✅ | 4 unused imports auto-fixed; see [`SAST-REPORT.md`](archive/SAST-REPORT.md) |
| Pytest (Compose DB via `docker compose run … api`) | ⚠️ | 135 passed, **2 failed**, 10 skipped |
| `pip-audit` | ❌ | `idna` 3.13 → upgrade ≥ 3.15 |
| `smoke_happy_path.sh` | ✅ | |
| `smoke_ingest_llm.sh` | ✅ | Track B |
| `smoke_assessment_llm.sh` | ❌ | SSE missing `run_done` |
| Mypy `api core` | ⚠️ | 33 errors — advisory only |

Full log: [`QA-REPORT.md`](archive/QA-REPORT.md).

## 1. Environment

| Requirement | Notes |
|-------------|--------|
| Python 3.12 | Matches `pyproject.toml` |
| Node 20 | Matches CI |
| Postgres 16 | Local Docker Compose or CI service container |
| `PYTHONPATH` | `.` for API / pytest |

Apply schema (includes Shasta **009** + evidence links **010**):

```bash
export PGHOST=localhost PGPORT=5432 PGUSER=cortex PGDATABASE=cortex PGPASSWORD=...
bash scripts/apply_cortex_schema.sh
```

Fresh DB volume (Compose): init scripts apply **001–010** in order.

## 2. Automated tests (same spine as CI)

**Frontend**

```bash
cd frontend
npm ci
npx tsc --noEmit
npm run lint
npm run test
npm run build
npm audit --omit=dev --audit-level=high
```

**Backend**

```bash
python -m pip install -e ".[dev]" -c requirements.lock.txt
ruff check api core compliance db ontology services workers tests --ignore E501
bandit -r api core compliance db ontology services workers -ll --skip B101
pytest -q --tb=short
```

**Security audits (CI `security` job)**

```bash
pip install pip-audit && pip-audit
cd frontend && npm audit --omit=dev --audit-level=high
```

## 3. Smoke scripts

| Script | Purpose |
|--------|---------|
| `scripts/smoke_happy_path.sh` | Health → login → frameworks → review (needs API + DB) |
| `scripts/smoke_ingest_llm.sh` | Track B — `GET /llm-providers` → login → `POST /ingest/document` SSE |
| `scripts/smoke_assessment_llm.sh` | Track A — login → `POST /assessments/run` SSE (`control_result`, `run_done`) |
| `scripts/verify_shasta_stack.sh` | Ephemeral Postgres :5433, schema, Shasta pytest + evidence-links unit tests |
| `scripts/shasta_uvicorn_e2e.sh` | Manual lifecycle against real uvicorn (optional; respects HTTP 501 if Shasta missing) |

Example after `docker compose up -d` with API on :8000:

```bash
bash scripts/smoke_happy_path.sh
bash scripts/smoke_ingest_llm.sh
bash scripts/smoke_assessment_llm.sh
```

**Pytest against Compose Postgres** (host port 5432 not published by default):

```bash
docker compose run --rm --no-deps \
  -e DATABASE_URL=postgresql+asyncpg://cortex:cortex-dev@postgres:5432/cortex \
  -e PYTHONPATH=/app \
  -e CORTEX_DISABLE_RATE_LIMIT=1 -e CORTEX_TESTING=1 \
  -v "$(pwd)":/app -w /app api \
  sh -c 'pip install -q pytest pytest-asyncio psycopg2-binary && python -m pytest -q --tb=short'
```

## 4. Manual UX (5 minutes)

1. Login → **Dashboard** → **Start stream** — confirm phase hint, log lines, no persistent error after dismiss.
2. **Cloud scans** → **Preview sample evidence map** — table + **Graph** toggle; amber sample banner.
3. With API + scan data — expand **Findings**, confirm evidence map + links (`GET …/evidence-links` optional in DevTools).

## 5. Schema verification (Shasta)

After migrate:

```sql
SELECT 1 FROM shasta_scan_runs LIMIT 0;
SELECT 1 FROM shasta_cloud_findings LIMIT 0;
SELECT 1 FROM shasta_evidence_control_links LIMIT 0;
```

## 6. API contracts (spot-check)

- `GET /api/v1/shasta/contract` — public, JSON.
- `GET /api/v1/shasta/scans/{id}/evidence-map?org_id=` — graph JSON (`source: shasta`).
- `GET /api/v1/shasta/scans/{id}/evidence-links?org_id=` — append-only link rows.

## 7. Done criteria

- [ ] CI-equivalent commands pass locally or on PR.
- [ ] No blocking `npm audit` / `pip-audit` issues above configured thresholds.
- [ ] Smoke scripts pass against running stack (`smoke_happy_path`, Track B ingest; Track A assessment documented if flaky).
- [ ] Pytest green on Compose DB (see §3 docker one-liner).
- [ ] Manual UX spot-check complete.

## 8. Report artifacts

| Document | Contents |
|----------|----------|
| [`archive/QA-REPORT.md`](archive/QA-REPORT.md) | Latest QA + smoke + pytest summary |
| [`archive/SAST-REPORT.md`](archive/SAST-REPORT.md) | Ruff, Bandit, ESLint, pip/npm audit |
| [`archive/SECURITY_REPORT.md`](archive/SECURITY_REPORT.md) | Historical compliance-engine security review |
