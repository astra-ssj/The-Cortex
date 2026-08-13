#!/usr/bin/env bash
# Apply CORTEX SQL migrations in the same order as docker-compose (postgres service).
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=cortex PGPASSWORD=... PGDATABASE=cortex ./scripts/apply_cortex_schema.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PGPASSWORD="${PGPASSWORD:-}"
psql() {
  command psql -v ON_ERROR_STOP=1 "$@"
}
# Single migration lane: migrations/002 … 021 (filename order == apply order).
# 009/010/013/014/015 still run before 018 drops their tables: replaying history
# keeps fresh installs and pre-018 databases converging on the same end state.
for f in \
  "$ROOT/init.sql" \
  "$ROOT/migrations/002_cortex_ontology.sql" \
  "$ROOT/migrations/003_assessment_results.sql" \
  "$ROOT/migrations/004_controls_authoritative.sql" \
  "$ROOT/migrations/005_multi_tenancy.sql" \
  "$ROOT/migrations/006_assessment_results_status_risk.sql" \
  "$ROOT/migrations/007_assessment_results_fix.sql" \
  "$ROOT/migrations/008_human_review_queue.sql" \
  "$ROOT/migrations/009_shasta_cloud.sql" \
  "$ROOT/migrations/010_shasta_evidence_control_links.sql" \
  "$ROOT/migrations/011_operational_persistence.sql" \
  "$ROOT/migrations/012_security_auth.sql" \
  "$ROOT/migrations/013_compliance_graph.sql" \
  "$ROOT/migrations/014_microsoft_integration.sql" \
  "$ROOT/migrations/015_relationship_graph.sql" \
  "$ROOT/migrations/016_rls_and_append_only_audit.sql" \
  "$ROOT/migrations/017_learning_loop.sql" \
  "$ROOT/migrations/018_drop_decommissioned_modules.sql" \
  "$ROOT/migrations/019_scenario_content.sql" \
  "$ROOT/migrations/019_scenario_content_seed.sql" \
  "$ROOT/migrations/020_competency_scores.sql" \
  "$ROOT/migrations/021_scenario_cx1002_seed.sql" \
  "$ROOT/migrations/022_scenario_cx1003_seed.sql"
  do
  echo "Applying $(basename "$f")..."
  psql -f "$f"
done

# App connects as non-superuser cortex_app (RLS + audit grants actually bind).
# Sync password to the same secret used by migrations / DATABASE_URL.
if [[ -n "${PGPASSWORD:-}" ]]; then
  echo "Syncing cortex_app password..."
  psql -v ON_ERROR_STOP=1 -c "ALTER ROLE cortex_app WITH PASSWORD '${PGPASSWORD}';" || true
fi

echo "Schema apply complete."
