# Changelog

All notable changes to CORTEX are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) where applicable.

Release lines **v0.1.0–v0.7.x** below reflect repository tags and merge history where tagged; interim patch levels may appear in this file without a corresponding git tag.

## [Unreleased]

### Added

- `NOTICE` file for Apache-style attribution; SPDX **Apache-2.0** declared in `pyproject.toml`.
- Frontend **Vitest** smoke test for default framework id bundle; CI runs **`npm run lint`** and **`npm run test`**.
- CI **Bandit** scope expanded to `api`, `core`, `compliance`, `db`, `ontology`, and compliance-engine app; **Ruff** includes `compliance`, `db`, `ontology`, `tests`.
- CI **pip-audit** and **npm audit** run as **blocking** checks (security job).
- `scripts/smoke_happy_path.sh`: HTTP smoke for health → readiness → login → frameworks → human-review approve → ZTAIP status → `X-Request-ID` propagation.
- CI job **Backend — HTTP smoke** runs the script against Uvicorn + Postgres.
- `RequestIDMiddleware`: echoes or generates **`X-Request-ID`** on API responses.

### Changed

- **License**: MIT → **Apache License 2.0** (see `LICENSE`).
- Docker Compose: **GraphJin** starts only with **`docker compose --profile graphql`** (port 8080 off by default).

## [0.7.4] — 2026-05-01

### Changed

- CONTRIBUTING: PR checklist (frontend build, `tsc`, compliance-engine pytest), architecture rules (GraphJin reads / FastAPI writes, human review threshold, tenant isolation), support email.
- SECURITY: vulnerability reporting SLA, security architecture table, development limitations, EU AI Act / NIS2 notes.
- `.env.example`: Postgres, FastAPI, GraphJin, and optional service variables.

## [0.7.3] — 2026-04-30

### Added

- GitHub documentation bundle (changelog, contributing, security patterns).

## [0.7.2] — 2026-04-30

### Fixed

- Audit Report Generator reads real DB data.
- `assessment_results`: added `status` / `risk_level` / `trend` columns plus unique constraint.
- Reports endpoint pulls real findings (10 items).
- Posture endpoint reads from DB instead of hardcoded `PostureCalculator`.
- Regulatory exposure computed from actual scores.
- Framework scores now varied: NIS2 44% CRITICAL, EU AI Act 41% CRITICAL, Cyber Essentials 78% MEDIUM.

## [0.7.1] — 2026-04-30

### Added

- Security hardening: JWT signing secret from environment (`JWT_SECRET` or `CORTEX_SECRET_KEY`); SlowAPI rate limiting on sensitive auth routes (`10/minute` for token, `5/minute` for registration); security headers middleware; optional extra CORS origin via `FRONTEND_URL`.

## [0.7.0] — 2026-04-30

### Added

- Regulation Intel, Evidence Vault, AI Systems — v0.7.0.

## [0.6.0] — 2026-04-30

### Added

- Animated assessment stream on onboarding (merged via assessment-stream work).

## [0.5.1] — 2026-04-30

### Fixed

- Onboarding step 3 — assessment button navigates to dashboard.

## [0.5.0] — 2026-04-20

### Added

- GRC skills integration — authoritative framework knowledge.

## [0.3.0] — 2026-02-23

### Added

- Frontend rewrite merged (SPA structure and compliance UI foundations).

## [0.2.0] — 2026-02-22

### Added

- JWT authentication with RBAC.

## [0.1.0] — 2026-02

### Added

- Initial CORTEX platform scaffold and compliance API foundations (pre–v0.2.0 tag era; see git history for detail).
