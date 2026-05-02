#!/usr/bin/env bash
# HTTP smoke: uvicorn + POST /api/v1/shasta/scans + poll until completed (CORTEX_SHASTA_MOCK=1).
# Requires: DATABASE_URL (Postgres with migration 009), PYTHONPATH, repo deps on PYTHONPATH.
#
#   export DATABASE_URL="postgresql+asyncpg://..."
#   export PYTHONPATH=".:services/compliance-engine"
#   export CORTEX_SHASTA_MOCK=1
#   bash scripts/smoke_shasta_http.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PYTHONPATH="${PYTHONPATH:-.:services/compliance-engine}"
export CORTEX_SHASTA_MOCK="${CORTEX_SHASTA_MOCK:-1}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "smoke_shasta_http: set DATABASE_URL (Postgres with 009 applied)" >&2
  exit 1
fi

export SMOKE_PORT="${SMOKE_PORT:-8899}"
PORT="$SMOKE_PORT"
HEALTH_URL="http://127.0.0.1:${PORT}/health"

(
  export CORTEX_SHASTA_MOCK=1
  exec uvicorn api.main:app --host 127.0.0.1 --port "$PORT" --log-level warning
) &
UV_PID=$!

cleanup() {
  kill "$UV_PID" 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 40); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    break
  fi
  sleep 0.25
  if [[ "$i" -eq 40 ]]; then
    echo "smoke_shasta_http: API did not become healthy" >&2
    exit 1
  fi
done

TOKEN="$(PYTHONPATH="$PYTHONPATH" python3 -c "
from core.security import create_access_token
print(create_access_token({
    'sub': 'smoke@cortex.local',
    'email': 'smoke@cortex.local',
    'org_id': 'demo-org-001',
    'role': 'ciso',
}))
")"

POST_BODY='{"cloud":"aws","org_id":"demo-org-001"}'
RESP="$(curl -sf -X POST "http://127.0.0.1:${PORT}/api/v1/shasta/scans" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$POST_BODY")"

RUN_ID="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['scan_run_id'])" "$RESP")"
echo "smoke_shasta_http: enqueued run_id=$RUN_ID"

for i in $(seq 1 60); do
  ROW="$(curl -sf "http://127.0.0.1:${PORT}/api/v1/shasta/scans/${RUN_ID}?org_id=demo-org-001" \
    -H "Authorization: Bearer ${TOKEN}")"
  ST="$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('status',''))" "$ROW")"
  if [[ "$ST" == "completed" ]]; then
    echo "smoke_shasta_http: OK (status=completed)"
    exit 0
  fi
  if [[ "$ST" == "failed" ]]; then
    echo "smoke_shasta_http: FAILED run status=failed" >&2
    echo "$ROW" >&2
    exit 1
  fi
  sleep 0.5
done

echo "smoke_shasta_http: timed out waiting for completed" >&2
exit 1
