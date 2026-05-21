#!/usr/bin/env bash
# CORTEX Track A — assessment stream smoke (auth + SSE control_result).
#
# Uses cyber-essentials-v3.1 with CORTEX_ASSESSMENT_MAX_CONTROLS capped in compose (default 5).
#
# Usage:
#   POSTGRES_PASSWORD=cortex-dev docker compose up -d api
#   bash scripts/smoke_assessment_llm.sh

set -euo pipefail

BASE="${SMOKE_API_URL:-http://127.0.0.1:8000}"
BASE="${BASE%/}"
USER="${SMOKE_USER:-admin}"
PASS="${SMOKE_PASSWORD:-admin}"
ORG="${SMOKE_ORG_ID:-demo-org-001}"
FW="${SMOKE_FRAMEWORK:-cyber-essentials-v3.1}"

die() {
  echo "smoke_assessment_llm: $*" >&2
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

echo "Track A smoke: BASE=$BASE ORG=$ORG FW=$FW"

code_health=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/health") || die "curl /health failed"
[[ "$code_health" == "200" ]] || die "/health expected 200, got $code_health"

TOKEN_PAYLOAD=$(curl -sS -X POST "$BASE/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS") || die "curl token failed"

TOKEN=$(printf '%s' "$TOKEN_PAYLOAD" | _json_get access_token)
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || die "no access_token"

QS="organization_id=${ORG}&framework_ids=${FW}"
code_stream=$(curl -sS -o /tmp/assess_sse.txt -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v1/assessments/run?${QS}") || die "curl assessments/run failed"
[[ "$code_stream" == "200" ]] || die "assessments/run expected 200, got $code_stream"

grep -q "event: run_start" /tmp/assess_sse.txt || die "SSE missing run_start"
grep -q "control_result" /tmp/assess_sse.txt || die "SSE missing control_result"
grep -q "event: run_done" /tmp/assess_sse.txt || die "SSE missing run_done"

echo "Track A smoke OK: login → assessments/run SSE (control_result + run_done)"
