# AGENTS.md

## Cursor Cloud specific instructions

This environment runs CORTEX **natively** (no Docker). The `docker compose` flow in `README.md` still documents the canonical service topology, but in this VM PostgreSQL, the FastAPI API, and the Vite frontend each run as local processes. Standard commands live in `README.md` and `CONTRIBUTING.md`; only the non-obvious startup/run caveats are captured here.

### Services

| Service | Port | Notes |
|---------|------|-------|
| PostgreSQL 16 | 5432 | Installed natively (apt), not via Docker. |
| FastAPI API (`api.main:app`) | 8000 | Run with `uvicorn`; needs `PYTHONPATH=.` and env vars below. |
| Vite frontend | 3000 | `cd frontend && npm run dev`; proxies `/api` → `:8000` (see `frontend/vite.config.ts`). |

GraphJin, Redis, and the Shasta worker are optional and not needed for core end-to-end use.

### Startup (each fresh VM)

1. **Start PostgreSQL** (it does NOT auto-start — there is no systemd in this container):
   ```bash
   sudo pg_ctlcluster 16 main start
   ```
   The `cortex` role (password `cortex-dev`), the `cortex` database, and the full schema (`scripts/apply_cortex_schema.sh`) were provisioned during environment setup and persist in the VM. If the DB is ever missing, recreate it:
   ```bash
   sudo -u postgres psql -c "CREATE USER cortex WITH PASSWORD 'cortex-dev' CREATEDB;"
   sudo -u postgres psql -c "CREATE DATABASE cortex OWNER cortex;"
   PGHOST=localhost PGUSER=cortex PGPASSWORD=cortex-dev PGDATABASE=cortex bash scripts/apply_cortex_schema.sh
   ```

2. **Run the API** from the repo root (Python deps live in `.venv`, created by the update script):
   ```bash
   source .venv/bin/activate
   export PYTHONPATH=. \
     DATABASE_URL="postgresql+asyncpg://cortex:cortex-dev@localhost:5432/cortex" \
     JWT_SECRET="dev-secret-key-minimum-32-characters-long-xx" \
     CORTEX_LEGACY_DEMO_PASSWORD="admin" \
     COMPLIANCE_ENGINE_STUB_PASSWORD="dev-stub" \
     COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN="dev-stub-token"
   uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
   ```
   The app reads env vars directly (there is no auto `.env` loading), so these must be exported in the API's shell. `CORTEX_LEGACY_DEMO_PASSWORD=admin` is what makes the `admin` / `admin` demo login work; without it, log in with the seeded `admin@astralabs.com` / `admin`.

3. **Run the frontend**: `cd frontend && npm run dev` → http://localhost:3000.

### Non-obvious notes

- **No Docker here.** Ignore the `POSTGRES_PASSWORD=... docker compose up` instructions; use the native steps above.
- **Optional heavy extras are NOT installed.** The `shasta-scan`, `aws`, and `azure` extras (git-cloned Shasta + `pycairo` native build) are omitted from the default install. Core API, the full pytest suite, and all UI flows work without them; the connector modules import those SDKs lazily. Install on demand with `.venv/bin/pip install -e ".[shasta-scan,aws,azure]"` only if testing Shasta cloud scans (use `CORTEX_SHASTA_MOCK=1` to avoid real cloud creds).
- **Tests need Postgres running** with the schema applied. Backend: `PYTHONPATH=. DATABASE_URL=... pytest -q`. Frontend: `npm run test`, `npm run build`, `npx tsc --noEmit`, `npm run lint` (all from `frontend/`).
- **Ruff findings are pre-existing.** `ruff check api core compliance db ontology tests --ignore E501` currently reports findings (the repo pins no `select` and CI installs `ruff` unpinned, so results track the latest ruff). This is repository state, not an environment problem.
- **LLM keys are optional.** With `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` unset, a stub provider is used, so assessments/ingest run without external calls.
