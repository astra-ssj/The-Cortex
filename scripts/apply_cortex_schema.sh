#!/usr/bin/env bash
# Apply CORTEX SQL migrations in the same order as docker-compose (postgres service).
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=cortex PGPASSWORD=... PGDATABASE=cortex ./scripts/apply_cortex_schema.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PGPASSWORD="${PGPASSWORD:-}"
psql() {
  command psql -v ON_ERROR_STOP=1 "$@"
}
# Single migration lane: migrations/002 … 015 (filename order == apply order).
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
  "$ROOT/migrations/015_relationship_graph.sql"
  do
  echo "Applying $(basename "$f")..."
  psql -f "$f"
done
echo "Schema apply complete."
