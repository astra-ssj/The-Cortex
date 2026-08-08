# CORTEX repository structure

Maintained map of the monorepo after Phase 0–1 cleanup. See also [`REPO_STRUCTURE_REFACTOR.md`](REPO_STRUCTURE_REFACTOR.md).

```text
.
├── api/                 # FastAPI routers + app entry (api.main:app)
├── core/                # Domain libraries (no HTTP)
│   ├── connectors/      # AWS, Azure, Microsoft, Shasta adapters
│   ├── ingestion/       # Document → evidence pipeline
│   ├── llm/             # Provider chain + circuit breakers
│   └── skills_loader.py
├── compliance/          # Framework registry (nist, gdpr, …)
├── ontology/            # SovereignModel entities
├── db/                  # Async SQLAlchemy session helpers
├── workers/             # Optional background consumers
├── services/
│   ├── assessment_*.py  # Assessment engine / LLM helpers (imported as services.*)
│   ├── ingestion/       # Thin compat re-exports → core.ingestion
│   ├── skills/          # Bundled GRC skill packs (content)
│   └── graphjin/        # GraphJin config (sidecar)
├── frontend/            # Vite + React SPA
├── migrations/          # Single SQL lane (002–015)
├── scripts/             # Smokes, schema apply, local runners
├── tests/               # Pytest suite
├── docs/                # Living docs + archive/ snapshots
├── docker-compose.yml
├── Dockerfile
└── pyproject.toml
```

## Rules of thumb

| Put it in… | When |
|------------|------|
| `api/` | HTTP route, request/response schema, FastAPI deps |
| `core/` | Reusable domain logic, connectors, persistence helpers |
| `compliance/` | Framework definitions / registry |
| `services/` | Assessment orchestration modules or **content** (skills), sidecars |
| `docs/archive/` | Dated QA/SAST/audit reports (never grow the repo root) |
| `migrations/` | All DDL — never a second migration folder |

## Removed (Phase 1)

- `services/compliance-engine/` nested FastAPI app and `sys.path` mount
- Dual stub routers (auth/frameworks/assessments/findings/groups/organisations)
- Dual `FINDINGS_STORE` in the engine (canonical store remains `api/findings.py` until Phase 3)
