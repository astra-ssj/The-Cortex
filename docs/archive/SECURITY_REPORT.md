# CORTEX Compliance Engine — Security & QA Report

## Remediation — `fix/security-critical`

**Posture:** moving **AMBER → GREEN** on the critical findings.

| Finding | Status | Fix |
|---------|--------|-----|
| GraphJin published on `0.0.0.0:8080` (dev auth `none`) | **Fixed** | Port bound to `127.0.0.1:8080:8080`; internal Docker network unchanged. `dev.yml` blocklist extended to `rel_people` + `relationship_edges` (PII) alongside `users` + `audit_log`. |
| Default secrets in `docker-compose.yml` | **Fixed** | `CORTEX_LEGACY_DEMO_PASSWORD`, `COMPLIANCE_ENGINE_STUB_PASSWORD`, `COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN` now use `:?` (required) — no `admin`/stub-token defaults. `.env.example` documents them. |
| `idna` 3.13 CVE (GHSA-jjg7-2v4v-x38h) | **Fixed** | Pinned `idna>=3.15` in `pyproject.toml` + `requirements.txt`; environment on 3.18. `pip-audit` reports no `idna` finding. Remaining `pip-audit` hits are OS/base-image packages (ansible, jinja2, pip, pyjwt, setuptools, urllib3, wheel) under `/usr/lib/python3/dist-packages`, not CORTEX deps. |
| Audit fabric not durable | **Already resolved on main** | `core/audit_fabric.append_audit_log()` writes to the append-only `audit_log` table on the caller's transaction; human-review queue persisted in `human_review_pending` / `human_review_reviewed`. |
| Cosmetic rate-limit headers | **Already resolved on main** | Real SlowAPI enforcement (`@limiter.limit` on auth routes + `SlowAPIMiddleware`); the header-only `RateLimitHeadersMiddleware` no longer exists. |
| Two failing tests + flaky SSE smoke | **Green** | Full suite: 145 passed / 6 skipped against a Compose-equivalent Postgres. Assessment SSE terminates with the `run_done` event (`services/assessment_engine.py`). |

---

## Verification run — 2026-05-21

**Scope:** CI-aligned SAST, dependency audit, pytest (Compose DB), HTTP smokes.  
**Posture:** **AMBER** (same as baseline; two pytest failures + one pip CVE + one smoke flake)

| Control | Result |
|---------|--------|
| Ruff | Pass (4 unused imports fixed) |
| Bandit `-ll` | Pass (0 High/Medium) |
| `pip-audit` | **Fail** — `idna` 3.13 → ≥ 3.15 |
| `npm audit --audit-level=high` | Pass |
| ESLint security plugins | Pass (0 errors; 56 warnings) |
| Pytest (Compose) | 135 pass / **2 fail** / 10 skip |
| `smoke_happy_path.sh` | Pass |
| `smoke_ingest_llm.sh` | Pass |
| `smoke_assessment_llm.sh` | Fail (SSE `run_done`) |

**Details:** [`QA-REPORT.md`](QA-REPORT.md), [`SAST-REPORT.md`](SAST-REPORT.md), [`../RELEASE_QA.md`](../RELEASE_QA.md).

**Open items:** Upgrade `idna`; fix or isolate LLM provider test env; stabilise assessment SSE smoke + `test_api_assessments`.

---

## Historical report — 2026-02-21

**Scope:** SAST, dependency security, secret scanning, test coverage, API security, Docker, CI.

---

## Issues found per category

| Category | Issues found |
|----------|--------------|
| **SAST (Ruff)** | 1: Unused variable `personal_data` in `azure_connector.py` |
| **SAST (Mypy)** | 11: no-any-return in credential_store, ontology_mapper, aws/azure connectors; arg-type in ingest |
| **SAST (Bandit)** | 5: B110 try_except_pass in `aws_connector.py` (5 locations) |
| **Dependency (pip-audit / safety)** | 12 CVEs in environment (pip, setuptools, wheel, filelock, marshmallow, future, python-multipart) |
| **Secrets** | No hardcoded secrets; `.gitignore` lacked `*.key`; docker-compose had hardcoded credentials |
| **Docker** | Hardcoded `POSTGRES_PASSWORD` and `DATABASE_URL`; no security comments |
| **API** | File upload lacked path-traversal check; SSE/assessments lacked security headers; no rate-limit headers |
| **CI** | No bandit, pip-audit, or coverage gate |

---

## Issues fixed

| Category | Fix |
|----------|-----|
| **Ruff** | Used `personal_data` by adding `purpose_tags` including `"personal_data"` when tags indicate PII/GDPR |
| **Mypy** | Added `cast()` for return values in credential_store, ontology_mapper, aws/azure connectors; `Literal` + cast for ingest `document_type` |
| **Bandit** | Replaced all `except Exception: pass` with `logger.debug(..., error=str(e))` in `aws_connector.py` |
| **Dependency** | Pinned `python-multipart>=0.0.22` in `pyproject.toml` (GHSA-wp53-j4wj-2cfg). Other CVEs are in build/runtime env (pip, setuptools, wheel) or transitive dev deps—upgrade via `pip install --upgrade pip setuptools wheel` and refresh venv |
| **Secrets** | Added `*.key` to `.gitignore` |
| **Docker** | `docker-compose.yml` now uses `${POSTGRES_PASSWORD:?}`, `${POSTGRES_USER:-cortex}`, `${POSTGRES_DB:-cortex}`, `${DATABASE_URL:-...}`. No hardcoded credentials. Added security comment |
| **API** | Ingest: path-traversal check (`..`, `/`, `\` in filename), empty filename rejected. Ingest & assessments SSE: added `X-Content-Type-Options: nosniff`, `Connection: keep-alive`. Added `RateLimitHeadersMiddleware` (X-RateLimit-Limit, X-RateLimit-Remaining) in `api/main.py` |
| **Tests** | Added `test_circuit_breaker.py`, `test_registry.py`, `test_assessment_engine.py` (skips without sqlalchemy); `test_ingest_document_rejects_path_traversal_filename` |
| **CI** | Added `.github/workflows/ci.yml`: ruff, mypy, bandit, pip-audit, pytest with `--cov-fail-under=60` |

---

## Issues requiring manual review

1. **Coverage gate:** CI uses `--cov-fail-under=60`. Local run without full deps (e.g. sqlalchemy) is ~57%. With `pip install .[dev]` in CI, assessment_engine tests run and coverage may reach 60%. If the build fails, add tests for `api/deps.py`, `api/ingest.py`, `services/context_builder.py`, or lower the threshold temporarily.
2. **pip/setuptools/wheel CVEs:** Upgrade in CI and local venv: `pip install --upgrade pip setuptools wheel`. Consider pinning in a constraints file.
3. **SSE timeout:** No application-level timeout on SSE streams; ensure reverse proxy (e.g. nginx) sets a reasonable `proxy_read_timeout`.
4. **Rate limiting:** Middleware only adds headers; enforce limits at API gateway or add SlowAPI (or similar) if needed.

---

## Overall security posture

**AMBER**

- **SAST:** All reported issues fixed (ruff, mypy, bandit clean).
- **Dependencies:** One project pin updated; remaining CVEs in tooling/transitive deps—manual upgrade recommended.
- **Secrets & Docker:** No credentials in repo; docker-compose uses env vars only.
- **API:** Input validation, file type/size, path traversal, and security headers in place; rate limiting is header-only.
- **Tests:** New tests for circuit_breaker, registry, assessment_engine, and path traversal; coverage gate in CI.
- **CI:** Bandit, pip-audit, and coverage gate added; first run may fail on coverage until env/tests align.

**Recommendation:** Move to **GREEN** after: (1) upgrading pip/setuptools/wheel and re-running pip-audit, (2) confirming CI coverage ≥60%, (3) enforcing rate limits at gateway or in-app if required.
