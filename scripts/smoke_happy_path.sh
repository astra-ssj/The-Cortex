#!/usr/bin/env bash
# Astra GRC CE — HTTP smoke of the learner spine (Compose or local uvicorn).
# Requires: curl; jq OR python3 for JSON.
#
# Env:
#   SMOKE_API_URL      default http://127.0.0.1:8000
#   SMOKE_EMAIL        default unique smoke learner address
#   SMOKE_PASSWORD     default generated non-production credential
#
# Usage:
#   POSTGRES_PASSWORD=... docker compose up -d postgres api
#   bash scripts/smoke_happy_path.sh

set -euo pipefail

BASE="${SMOKE_API_URL:-http://127.0.0.1:8000}"
BASE="${BASE%/}"
EMAIL="${SMOKE_EMAIL:-smoke-$(date +%s)-$$@example.invalid}"
PASS="${SMOKE_PASSWORD:-Astra-Smoke-$(date +%s)-$$!}"

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

register_tmp=$(mktemp)
trap 'rm -f "$register_tmp"' EXIT
register_payload=$(printf \
  '{"company_name":"Astra Smoke Training","jurisdiction":"EU","industry":"Training","email":"%s","password":"%s","full_name":"CI Smoke Learner"}' \
  "$EMAIL" "$PASS")
code_register=$(curl -sS -o "$register_tmp" -w "%{http_code}" \
  -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "$register_payload") || die "curl register failed"
TOKEN_PAYLOAD=$(cat "$register_tmp")
[[ "$code_register" == "200" ]] || die "/api/v1/auth/register expected 200, got $code_register body=$TOKEN_PAYLOAD"

TOKEN=$(printf '%s' "$TOKEN_PAYLOAD" | _json_get access_token)
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || die "no access_token in response: $TOKEN_PAYLOAD"

AUTH=( -H "Authorization: Bearer $TOKEN" )

code_catalog=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/skills/practices" "${AUTH[@]}") || die "curl practice catalog failed"
[[ "$code_catalog" == "200" ]] || die "/api/v1/skills/practices expected 200, got $code_catalog"

code_practices=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/curriculum/practices" "${AUTH[@]}") || die "curl curriculum practices failed"
[[ "$code_practices" == "200" ]] || die "/api/v1/curriculum/practices expected 200, got $code_practices"

code_tracks=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/curriculum/tracks" "${AUTH[@]}") || die "curl curriculum tracks failed"
[[ "$code_tracks" == "200" ]] || die "/api/v1/curriculum/tracks expected 200, got $code_tracks"

code_plan=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/curriculum/me/learning-plan" "${AUTH[@]}") || die "curl learning plan failed"
[[ "$code_plan" == "200" ]] || die "/api/v1/curriculum/me/learning-plan expected 200, got $code_plan"

code_sc=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/learning/scenarios" "${AUTH[@]}") || die "curl learning/scenarios failed"
[[ "$code_sc" == "200" ]] || die "/api/v1/learning/scenarios expected 200, got $code_sc"

rid=$(curl -sS -D - -o /dev/null "$BASE/health" -H "X-Request-ID: smoke-test-rid" | tr -d '\r' | grep -i '^x-request-id:' | head -1 | sed 's/^[^:]*:[[:space:]]*//')
[[ -n "$rid" ]] || die "missing X-Request-ID response header on /health"
[[ "$rid" == "smoke-test-rid" ]] || die "X-Request-ID not echoed (got '$rid')"

echo "Smoke OK: health → ready → register → practice catalog → curriculum → learning plan → scenarios → X-Request-ID"
