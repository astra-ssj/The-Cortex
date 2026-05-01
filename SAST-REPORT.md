# CORTEX SAST Report

Generated: 2026-05-01  
Version: v0.7.4 (release tag per security milestone; `pyproject.toml` package version unchanged)

## Summary

| Tool | Findings | Critical | High | Medium | Fixed |
|------|----------|----------|------|--------|-------|
| Bandit (`services/compliance-engine/app/`, `api/`, `core/`) | 4 → 0 | 0 | 0 | 1 → 0 | 4 |
| Semgrep (`p/python`, `p/secrets`, `p/owasp-top-ten` on compliance-engine; `p/secrets` on `api/` + `core/`) | 3 → 0 | 0 | 0 | 0 | 3 |
| npm audit (`frontend`, `--audit-level=high`) | 0 | 0 | 0 | — | — |
| npm audit (`--audit-level=moderate`) | 2 | 0 | 0 | 2 | 1 (postcss via `npm audit fix`) |
| Safety (`pip freeze` on scan host; CI uses project install + freeze) | 7 reported | 0 | 0 | — | Addressed in `pyproject.toml` pins |
| ESLint (`eslint-plugin-security`, `eslint-plugin-no-unsanitized`) | 25 | 0 | 0 | — | 0 errors |
| Manual checks (below) | — | 0 | 0 | — | Pass |

## Critical Findings Fixed

None. No critical issues were reported by the tools above.

## High Findings Fixed

None at High severity. The following **Medium** / policy issues were remediated:

- **Bandit B608** (`api/auth.py`): Dynamic SQL string for onboarding `UPDATE` replaced with SQLAlchemy `update()` + bound parameters.
- **Bandit B105** (legacy `admin`/`admin` path): Removed hardcoded password; login enabled only when `CORTEX_LEGACY_DEMO_PASSWORD` is set (compose default documents local demo only).
- **Bandit B105** (`core/security.py`): Dev JWT signing placeholder annotated with `# nosec B105` (documented non-production default).
- **Literal JWT bypass** (`core/security.py`): Replaced hardcoded bearer `TOKEN` with `CORTEX_TOKEN_BYPASS_VALUE` when `CORTEX_ALLOW_TOKEN_BYPASS` is enabled.
- **Compliance-engine auth stub** (`services/compliance-engine/.../auth.py`): Removed hardcoded stub token and default demo password; stub requires env configuration (defaults supplied in `docker-compose.yml` for local stacks).
- **Semgrep** (`p/secrets`): False-positive “bcrypt hash” hits on **known demo password hashes** suppressed with `# nosemgrep` (hashes are public demo material, not live secrets).

## Accepted Risks

- **npm (moderate):** Remaining `vite` advisory (path traversal in optimized deps `.map` handling) has fix paths that require a **major** Vite upgrade; risk is primarily **development-server** exposure. Tracked for a planned Vite 6+ upgrade.
- **ESLint `security/detect-object-injection` (warnings):** Twenty-five warnings on dynamic property access where keys are **application-controlled** (framework IDs, wizard steps). Reviewed; no change required for exploitability in current UX.

## Manual Checks

| Check | Result |
|-------|--------|
| JWT / signing secret hardcoded | `JWT_SECRET` / `CORTEX_SECRET_KEY` with dev fallback only (logged); bypass requires explicit env |
| SQL injection (`f"...SELECT`, etc.) | No problematic patterns; onboarding uses SQLAlchemy `update()` |
| Sensitive data in logs | No password/token logging patterns found in sampled `api/` routers |
| CORS wildcard | Explicit origin list + `FRONTEND_URL` |
| FastAPI `debug=True` | Not used |
| `dangerouslySetInnerHTML` | Not present under `frontend/src/` |
| Hardcoded frontend credentials | None found (excluding placeholders/copy) |
| `random` for security-sensitive use | Not used in compliance-engine app |
| Open redirect | No `RedirectResponse`/`navigate` on raw user URLs found in scoped grep |

## Next Steps

- Schedule penetration test (ISO 27001 A.8.8).
- Keep **SAST in CI** (`.github/workflows/sast.yml`).
- Re-run quarterly and before major releases; upgrade Vite when the ecosystem catches up without breaking the build.
