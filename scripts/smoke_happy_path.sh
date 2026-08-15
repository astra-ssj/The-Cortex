#!/usr/bin/env bash
# CORTEX — HTTP smoke of the main spine (Compose or local uvicorn).
# Requires: curl; jq OR python3 for JSON.
#
# Env:
#   SMOKE_API_URL      default http://127.0.0.1:8000
#   SMOKE_USER         default admin  (maps to admin@astralabs.com when DB seeded)
#   SMOKE_PASSWORD     default admin
#
# Usage:
#   POSTGRES_PASSWORD=... docker compose up -d postgres api
#   bash scripts/smoke_happy_path.sh

set -euo pipefail

BASE="${SMOKE_API_URL:-http://127.0.0.1:8000}"
BASE="${BASE%/}"
USER="${SMOKE_USER:-admin}"
PASS="${SMOKE_PASSWORD:-admin}"

die() {
  echo "smoke_happy_path: $*" >&2
  exit 1
}

_json_get() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r ".$key"
  else
    python3 -c "import json,sys; print(json.load(sys.stdin)[\"$key\"])"
  fi
}

echo "Smoke: BASE=$BASE"

code_health=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/health") || die "curl /health failed"
[[ "$code_health" == "200" ]] || die "/health expected 200, got $code_health"

code_ready=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/ready") || die "curl /ready failed"
[[ "$code_ready" == "200" ]] || die "/ready expected 200 (Postgres required), got $code_ready"

code_sys=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/system/ready") || die "curl system/ready failed"
[[ "$code_sys" == "200" ]] || die "/api/v1/system/ready expected 200, got $code_sys"

TOKEN_PAYLOAD=$(curl -sS -X POST "$BASE/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS") || die "curl token failed"

TOKEN=$(printf '%s' "$TOKEN_PAYLOAD" | _json_get access_token)
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || die "no access_token in response: $TOKEN_PAYLOAD"

AUTH=( -H "Authorization: Bearer $TOKEN" )

code_fw=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/frameworks" "${AUTH[@]}") || die "curl frameworks failed"
[[ "$code_fw" == "200" ]] || die "/api/v1/frameworks expected 200, got $code_fw"

code_sc=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/learning/scenarios" "${AUTH[@]}") || die "curl learning/scenarios failed"
[[ "$code_sc" == "200" ]] || die "/api/v1/learning/scenarios expected 200, got $code_sc"

RQ=$(curl -sS "$BASE/api/v1/assessments/review-queue" "${AUTH[@]}") || die "curl review-queue failed"
code_rq=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/assessments/review-queue" "${AUTH[@]}")
[[ "$code_rq" == "200" ]] || die "/api/v1/assessments/review-queue expected 200, got $code_rq"

# Review queue: empty until a learner triggers a low-confidence
# decision. CE removed demo rows — empty queue is correct.

ITEM_COUNT=$(printf '%s' "$RQ" | (command -v jq >/dev/null 2>&1 && jq '.items | length' || python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items', [])))"))
ITEM_COUNT="${ITEM_COUNT//$'\n'/}"

code_z=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/system/ztaip-status" "${AUTH[@]}") || die "curl ztaip-status failed"
[[ "$code_z" == "200" ]] || die "/api/v1/system/ztaip-status expected 200, got $code_z"

APPROVE_NOTE=""
if [[ "${ITEM_COUNT:-0}" -ge 1 ]]; then
  FIRST_ID=$(printf '%s' "$RQ" | (command -v jq >/dev/null 2>&1 && jq -r '.items[0].id' || python3 -c "import json,sys; print(json.load(sys.stdin)['items'][0]['id'])"))
  ap_tmp=$(mktemp)
  code_ap=$(curl -sS -o "$ap_tmp" -w "%{http_code}" -X POST "$BASE/api/v1/assessments/controls/${FIRST_ID}/approve" \
    "${AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d '{"notes":"smoke_happy_path automated approve"}') || die "curl approve failed"
  APPROVE=$(cat "$ap_tmp")
  rm -f "$ap_tmp"
  [[ "$code_ap" == "200" ]] || die "approve HTTP $code_ap body=$APPROVE"

  if [[ "$(printf '%s' "$APPROVE" | (command -v jq >/dev/null 2>&1 && jq -r '.status // empty' || python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))"))" != "approved" ]]; then
    die "approve unexpected body: $APPROVE"
  fi
  APPROVE_NOTE=" → approve"
fi

rid=$(curl -sS -D - -o /dev/null "$BASE/health" -H "X-Request-ID: smoke-test-rid" | tr -d '\r' | grep -i '^x-request-id:' | head -1 | sed 's/^[^:]*:[[:space:]]*//')
[[ -n "$rid" ]] || die "missing X-Request-ID response header on /health"
[[ "$rid" == "smoke-test-rid" ]] || die "X-Request-ID not echoed (got '$rid')"

echo "Smoke OK: health → ready → system/ready → login → frameworks → learning/scenarios → review-queue → ztaip-status${APPROVE_NOTE} → X-Request-ID"
