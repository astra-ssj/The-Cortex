# CORTEX SAST Report

**Generated:** 2026-05-21  
**Package:** `cortex` 0.1.0  
**Scope:** Backend (`api/`, `core/`, `compliance/`, `db/`, `ontology/`, `services/compliance-engine/app/`), frontend (`frontend/src/`)

## Summary

| Tool | Findings (actionable) | Critical | High | Medium | Low | CI gate |
|------|----------------------|----------|------|--------|-----|---------|
| Ruff | 0 (4 unused imports fixed in-run) | — | — | — | — | Yes (`.github/workflows/ci.yml`) |
| Bandit `-ll` | 0 High/Med; 15 Low | 0 | 0 | 0 | 15 | Yes |
| Mypy `api` + `core` | 33 type errors | — | — | — | — | No (local advisory) |
| ESLint + security plugins | 0 errors; 56 warnings | 0 | 0 | — | 56 warn | Yes (lint step) |
| npm audit `--audit-level=high` | 0 high | 0 | 0 | — | 6 mod (dev) | Yes |
| pip-audit | 1 (`idna` CVE) | — | — | — | 1 | Yes (`security` job) |
| Semgrep | Not re-run locally | — | — | — | — | `.github/workflows/sast.yml` |

## Ruff

```bash
ruff check api core compliance db ontology services/compliance-engine/app tests --ignore E501
```

**Result:** All checks passed (after auto-fix).

**Fixed during 2026-05-21 run:**

- `core/evidence_persistence.py` — unused `ControlRef` import
- `tests/test_assessment_llm.py` — unused `asyncio`, `MagicMock`
- `tests/test_report_pdf.py` — unused `TestClient`

## Bandit

```bash
bandit -r api core compliance db ontology services/compliance-engine/app -ll --skip B101
```

**Result:** No issues at Low confidence and above in the report summary; metrics show **15 Low** severity findings at Medium confidence (typical try/except or assert patterns). Exit code **0** with `-ll` threshold.

**Skipped:** B101 (`assert` in tests) via `--skip B101`.

## Mypy (advisory)

```bash
mypy api core
```

**Result:** 33 errors in 9 files — predominantly:

- `no-any-return` in LLM providers and `api/main.py` middleware/helpers
- `arg-type` on Starlette `add_exception_handler` registrations

Not enforced in CI today; treat as tech-debt backlog.

## Frontend ESLint

```bash
cd frontend && npm run lint
```

**Result:** 0 errors, **56 warnings** — all `security/detect-object-injection` on dynamic keys (framework IDs, feature flags, wizard state). Reviewed as **accepted risk** (application-controlled keys). See prior report rationale.

Plugins: `eslint-plugin-security`, `eslint-plugin-no-unsanitized`.

## Dependency audits

### Python (`pip-audit`)

| Package | Version | ID | Fix |
|---------|---------|-----|-----|
| idna | 3.13 | CVE-2026-45409 | ≥ 3.15 |

### Node (`npm audit --audit-level=high`)

**High:** 0  
**Moderate (below CI fail threshold):** `brace-expansion`, `esbuild` / `vite` dev-server chain — upgrade path is major Vite bump; dev-only exposure.

## Manual checks (2026-05-21)

| Check | Result |
|-------|--------|
| JWT / signing secret hardcoded in prod path | Env-driven; dev defaults documented |
| SQL injection (`f"...SELECT` in app code) | Parameterised / SQLAlchemy |
| `dangerouslySetInnerHTML` in `frontend/src` | Not found |
| CORS wildcard | Allowlist + `FRONTEND_URL` |
| FastAPI `debug=True` | Not used |
| LLM calls without CircuitBreaker | Ingest/assessment use `core/llm` + breaker per architecture rules |
| Raw LLM in routers | Routed through `core/llm` |

## Next steps

1. Bump **`idna>=3.15`** and re-run `pip-audit`.
2. Isolate **`test_llm_providers`** stub-only case from Compose `CORTEX_LLM_PROVIDERS` env (or document required test env).
3. Stabilise **`smoke_assessment_llm.sh`** / `test_api_assessments` SSE `run_done` contract.
4. Schedule Semgrep workflow re-run on PR (`.github/workflows/sast.yml`).
5. Plan Vite 6+ upgrade to clear moderate dev dependency advisories.

## Related

- [`QA-REPORT.md`](QA-REPORT.md) — full QA + smoke run log
- [`docs/RELEASE_QA.md`](docs/RELEASE_QA.md) — pre-release checklist
- [`SECURITY.md`](SECURITY.md) — security policy
