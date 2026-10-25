#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-astra-ci-release-password}"
export JWT_SECRET="${JWT_SECRET:-astra-ci-release-jwt-secret-minimum-32-characters}"
export COMPLIANCE_ENGINE_STUB_PASSWORD="${COMPLIANCE_ENGINE_STUB_PASSWORD:-astra-ci-stub-password}"
export COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN="${COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN:-astra-ci-stub-token}"
export MODEL_PROVIDER=stub
export CORTEX_LLM_PROVIDERS=stub
export ASTRA_PORT="${ASTRA_PORT:-18080}"

cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    docker compose -f compose.dev.yml logs --no-color || true
  fi
  docker compose -f compose.dev.yml down --volumes --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT

./scripts/verify-release.sh
PYTHONPATH=. python scripts/audit_practice_quality.py --strict >/dev/null
docker compose -f compose.dev.yml up -d --build --wait
curl --fail --silent "http://127.0.0.1:${ASTRA_PORT}/health" >/dev/null

applied="$(
  docker compose -f compose.dev.yml exec -T postgres \
    psql -U cortex -d cortex -Atc \
    "SELECT count(*) FROM schema_migrations WHERE version = '044_practice_quality_v11.sql'"
)"
[[ "$applied" == "1" ]] || {
  echo "Migration 044 is not recorded after clean install." >&2
  exit 1
}

# Re-running the one-shot migration service exercises the idempotent upgrade lane.
docker compose -f compose.dev.yml run --rm migrate
docker compose -f compose.dev.yml up -d --wait
curl --fail --silent "http://127.0.0.1:${ASTRA_PORT}/health" >/dev/null
