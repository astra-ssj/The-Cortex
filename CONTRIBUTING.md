# Contributing to CORTEX

Thank you for helping improve CORTEX. By contributing, you agree your contributions are licensed under the **Apache License 2.0** (see [`LICENSE`](LICENSE)), unless you state otherwise in writing.

This repository follows the **ZTAIP** (Zero Trust Agentic Intelligence Platform) conventions documented in [`.cursorrules`](.cursorrules) and summarized in [`README.md`](README.md).

## Before you start

- Use **Python 3.12+** for the FastAPI backend and **Node.js 18+** for the frontend (see README for exact commands).
- Prefer small, focused pull requests with a clear description of behaviour changes.

## Development workflow

1. Fork or branch from `main`.
2. Install backend dev dependencies: `pip install -e ".[dev]"`.
3. Run tests: `pytest tests/ -v`.
4. For UI changes: `cd frontend && npm install && npm run dev` (and run any frontend checks you rely on locally).
5. With Postgres + API running (`docker compose up -d`), optional spine check: `bash scripts/smoke_happy_path.sh` (also executed in CI).

## Before submitting a PR

```bash
# Frontend — must pass zero errors
cd frontend
npm run build
npx tsc --noEmit

# Backend (from repo root)
pytest tests/ -v
ruff check api core compliance db ontology tests --ignore E501
```

## Architecture rules

Three rules that must be preserved in all contributions:

1. **API boundary** — **All mutations, auth, and application reads** go through **FastAPI** with tenant-scoped queries and ZTAIP audit patterns. Do not add parallel database-facing HTTP surfaces for product traffic without an explicit architecture decision.

2. **Human-in-the-loop** — every AI assessment with confidence below **0.75** must route to the Human Review Queue. This is an EU AI Act Art.14 requirement, not optional.

3. **Tenant isolation** — every DB query must be scoped by `org_id` from the JWT. No cross-tenant data access ever.

**GraphJin** runs as a Docker sidecar on port **8080** (`services/graphjin/`). It auto-generates GraphQL from the PostgreSQL schema — use it for graph traversals and nested read queries. All writes and authenticated product traffic stay on FastAPI.

## Code expectations

- **Python:** type hints, **structlog** for logging (do not use `print` or `logging.info` for operational messages).
- **Architecture:** consequential operations should align with audit and governance patterns described in `.cursorrules` (e.g. append-only audit assumptions, circuit breakers around external LLM calls where applicable).
- **Security:** do not commit secrets; use environment variables (see `.env.example`).
- **Style:** match surrounding modules (imports, naming, error handling). Run **Ruff** / **mypy** if you touch Python types or layout.

## Pull requests

- Describe **what** changed and **why** (user-visible behaviour, migrations, or API contract changes).
- Link related issues when applicable.
- If you add or change persistence, note schema / migration expectations (`init.sql`, single lane under `migrations/` — see `docs/REPO_STRUCTURE_REFACTOR.md`).

## Questions

Email: [support@astralabs-ai.net](mailto:support@astralabs-ai.net)

Open a discussion or issue on the repository if you are unsure about scope or ZTAIP alignment before investing in a large change.
