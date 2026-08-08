#!/usr/bin/env bash
# Local end-to-end check aligned with CI: Postgres schema (incl. 009 Shasta) + Shasta API pytest.
#
# Starts a throwaway Postgres 16 on port 5433 (avoids clobbering a local :5432 instance).
# Requires: Docker, repo .venv with dev deps. Host ``psql`` is optional — without it, schema is
# applied via ``docker exec`` into the container (repo mounted at ``/work``).
#
# Usage (from repo root):
#   bash scripts/verify_shasta_stack.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONTAINER="cortex-shasta-verify-$$"
PGPORT="${VERIFY_PG_PORT:-5433}"

# Same relative paths as scripts/apply_cortex_schema.sh (keep in sync).
REL_SQL_FILES=(
  init.sql
  migrations/002_cortex_ontology.sql
  migrations/003_assessment_results.sql
  migrations/004_controls_authoritative.sql
  migrations/005_multi_tenancy.sql
  migrations/006_assessment_results_status_risk.sql
  migrations/007_assessment_results_fix.sql
  migrations/008_human_review_queue.sql
  migrations/009_shasta_cloud.sql
  migrations/010_shasta_evidence_control_links.sql
)

cleanup() {
  docker rm -f "$CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

echo "verify_shasta_stack: starting Postgres container ($CONTAINER) on localhost:$PGPORT..."
docker run -d --name "$CONTAINER" \
  -v "$ROOT:/work:ro" \
  -e POSTGRES_USER=cortex \
  -e POSTGRES_PASSWORD=cortex_shasta_verify \
  -e POSTGRES_DB=cortex \
  -p "${PGPORT}:5432" \
  postgres:16

for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U cortex -d cortex >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 30 ]]; then
    echo "verify_shasta_stack: Postgres did not become ready in time" >&2
    exit 1
  fi
done

export PGHOST=127.0.0.1
export PGPORT
export PGUSER=cortex
export PGPASSWORD=cortex_shasta_verify
export PGDATABASE=cortex
export DATABASE_URL="postgresql+asyncpg://cortex:cortex_shasta_verify@127.0.0.1:${PGPORT}/cortex"
export PYTHONPATH=".:services/compliance-engine"

apply_schema() {
  if command -v psql >/dev/null 2>&1; then
    echo "verify_shasta_stack: applying schema via host psql (scripts/apply_cortex_schema.sh)..."
    bash scripts/apply_cortex_schema.sh
  else
    echo "verify_shasta_stack: host psql not found; applying schema via docker exec..."
    for rel in "${REL_SQL_FILES[@]}"; do
      echo "Applying $(basename "$rel")..."
      docker exec "$CONTAINER" psql -U cortex -d cortex -v ON_ERROR_STOP=1 -f "/work/$rel"
    done
    echo "Schema apply complete."
  fi
}

probe_shasta_tables() {
  local sq="SELECT 1 FROM shasta_scan_runs LIMIT 0;"
  local sq2="SELECT 1 FROM shasta_cloud_findings LIMIT 0;"
  local sq3="SELECT 1 FROM shasta_evidence_control_links LIMIT 0;"
  if command -v psql >/dev/null 2>&1; then
    psql -v ON_ERROR_STOP=1 -c "$sq"
    psql -v ON_ERROR_STOP=1 -c "$sq2"
    psql -v ON_ERROR_STOP=1 -c "$sq3"
  else
    docker exec "$CONTAINER" psql -U cortex -d cortex -v ON_ERROR_STOP=1 -c "$sq"
    docker exec "$CONTAINER" psql -U cortex -d cortex -v ON_ERROR_STOP=1 -c "$sq2"
    docker exec "$CONTAINER" psql -U cortex -d cortex -v ON_ERROR_STOP=1 -c "$sq3"
  fi
}

apply_schema

echo "verify_shasta_stack: asserting Shasta tables exist..."
probe_shasta_tables

PY="${ROOT}/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  PY="python3"
fi

echo "verify_shasta_stack: pytest Shasta + evidence link tests ..."
"$PY" -m pytest tests/test_api_shasta_cloud.py tests/test_shasta_evidence_links.py -v --tb=short

echo "verify_shasta_stack: OK"
