#!/usr/bin/env bash
# Subprocess E2E: real uvicorn (separate process) + JWT + POST /shasta/scans + poll until terminal status.
# Survives async SQLAlchemy + BackgroundTasks in ways in-process pytest cannot.
#
# Requires: running Postgres (DATABASE_URL), schema with 009, .venv, optional Shasta extra for success path.
# Env:
#   BASE_URL     default http://127.0.0.1:8000
#   E2E_USER     default ciso@astralabs.com
#   E2E_PASSWORD default cortex-ciso-2026
#   E2E_ORG      default demo-org-001
#
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:8000}"
BASE="${BASE%/}"
USER="${E2E_USER:-ciso@astralabs.com}"
PASS="${E2E_PASSWORD:-cortex-ciso-2026}"
ORG="${E2E_ORG:-demo-org-001}"

echo "shasta_uvicorn_e2e: BASE=$BASE org=$ORG"

tok_resp="$(curl -sS -X POST "$BASE/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS")"
TOKEN="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" <<<"$tok_resp")"
if [[ -z "$TOKEN" || "$TOKEN" == "None" ]]; then
  echo "shasta_uvicorn_e2e: login failed: $tok_resp" >&2
  exit 1
fi

SCAN_BODY="$(curl -sS -w "\n%{http_code}" -X POST "$BASE/api/v1/shasta/scans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"cloud\":\"aws\",\"org_id\":\"$ORG\"}")"
HTTP_BODY="$(echo "$SCAN_BODY" | head -n -1)"
CODE="$(echo "$SCAN_BODY" | tail -n 1)"

if [[ "$CODE" == "501" ]]; then
  echo "shasta_uvicorn_e2e: API returned 501 (Shasta extra not installed) — infrastructure OK."
  exit 0
fi

if [[ "$CODE" != "200" ]]; then
  echo "shasta_uvicorn_e2e: POST /shasta/scans failed HTTP $CODE body=$HTTP_BODY" >&2
  exit 1
fi

RUN_ID="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('scan_run_id',''))" <<<"$HTTP_BODY")"
if [[ -z "$RUN_ID" ]]; then
  echo "shasta_uvicorn_e2e: no scan_run_id in $HTTP_BODY" >&2
  exit 1
fi

echo "shasta_uvicorn_e2e: queued run $RUN_ID — polling…"

for _ in $(seq 1 60); do
  sleep 1
  ST="$(curl -sS -H "Authorization: Bearer $TOKEN" \
    "$BASE/api/v1/shasta/scans/${RUN_ID}?org_id=${ORG}")"
  STATUS="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" <<<"$ST")"
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    echo "shasta_uvicorn_e2e: terminal status=$STATUS"
    python3 -c "import json,sys; d=json.load(sys.stdin); print('findings_count', d.get('findings_count'), 'error', d.get('error_message'))" <<<"$ST"
    exit 0
  fi
done

echo "shasta_uvicorn_e2e: timeout waiting for completed/failed" >&2
exit 1
