# Astra GRC repository structure

Maintained map of the monorepo. See also [`REPO_STRUCTURE_REFACTOR.md`](REPO_STRUCTURE_REFACTOR.md).

```text
.
├── api/                 # FastAPI routers + app entry (api.main:app)
├── core/                # Domain libraries (no HTTP)
│   ├── connectors/      # AWS, Azure, Microsoft, Shasta adapters
│   ├── ingestion/       # Document → evidence pipeline
│   ├── llm/             # Provider chain + circuit breakers
│   ├── assessment_*.py  # Assessment engine / LLM / context / posture
│   └── skills_loader.py
├── compliance/          # Framework registry (nist, gdpr, …)
├── ontology/            # SovereignModel entities
├── db/                  # Async SQLAlchemy session helpers
├── workers/             # Optional background consumers (Shasta)
├── content/
│   └── skills/          # Bundled GRC skill packs (content only)
├── frontend/            # Vite + React SPA
│   └── src/
│       ├── pages/       # Route screens
│       ├── components/  # Shared UI / panels
│       ├── lib/         # Client helpers + feature flags
│       └── api/         # HTTP client
├── migrations/          # Single SQL lane (002–015) + ../init.sql
├── scripts/             # Smokes, schema apply, local runners
├── tests/               # Pytest suite
├── docs/                # Index in README.md; archive/ for snapshots
├── docker-compose.yml
├── Dockerfile
└── pyproject.toml
```

## Rules of thumb

| Put it in… | When |
|------------|------|
| `api/` | HTTP route, request/response schema, FastAPI deps |
| `core/` | Reusable domain logic, connectors, assessment, persistence helpers |
| `compliance/` | Framework definitions / registry |
| `content/` | Static packs (skills) — not Python packages |
| `infra/` | Deployment and infrastructure configuration |
| `docs/archive/` | Dated QA/SAST/audit reports (never grow the repo root) |
| `migrations/` | All DDL — never a second migration folder |

## Doc roles

| Doc | Job |
|-----|-----|
| [`../README.md`](../README.md) | Product pitch + quickstart |
| [`STRUCTURE.md`](STRUCTURE.md) | Directory map (this file) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime topology |
| [`CORTEX_SETUP.md`](CORTEX_SETUP.md) | Local/Cursor/Shasta operator setup |
| [`REPO_STRUCTURE_REFACTOR.md`](REPO_STRUCTURE_REFACTOR.md) | Phase checklist |
| [`archive/`](archive/) | Historical snapshots only |

## Removed

- `services/compliance-engine/` nested FastAPI app (Phase 1)
- `services/` package hybrid (Phase 2) — assessment → `core/`, skills → `content/`
- unauthenticated GraphJin database sidecar (security remediation)
