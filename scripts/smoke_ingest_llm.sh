#!/usr/bin/env bash
# CORTEX Track B — ingest + LLM provider smoke (auth, llm-providers, document SSE).
#
# Env:
#   SMOKE_API_URL      default http://127.0.0.1:8000
#   SMOKE_USER         default ciso@astralabs.com
#   SMOKE_PASSWORD     default cortex-ciso-2026
#
# Usage:
#   POSTGRES_PASSWORD=cortex-dev docker compose up -d api
#   bash scripts/smoke_ingest_llm.sh

set -euo pipefail

BASE="${SMOKE_API_URL:-http://127.0.0.1:8000}"
BASE="${BASE%/}"
USER="${SMOKE_USER:-ciso@astralabs.com}"
PASS="${SMOKE_PASSWORD:-cortex-ciso-2026}"

die() {
  echo "smoke_ingest_llm: $*" >&2
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

echo "Track B smoke: BASE=$BASE"

code_health=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/health") || die "curl /health failed"
[[ "$code_health" == "200" ]] || die "/health expected 200, got $code_health"

LLM_JSON=$(curl -sS "$BASE/api/v1/system/llm-providers") || die "curl llm-providers failed"
ACTIVE=$(printf '%s' "$LLM_JSON" | (command -v jq >/dev/null 2>&1 && jq -r '.active_chain | join(",")' || python3 -c "import json,sys; print(','.join(json.load(sys.stdin)['active_chain']))"))
[[ -n "$ACTIVE" ]] || die "llm-providers missing active_chain: $LLM_JSON"
echo "LLM active_chain=$ACTIVE"

TOKEN_PAYLOAD=$(curl -sS -X POST "$BASE/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS") || die "curl token failed"

TOKEN=$(printf '%s' "$TOKEN_PAYLOAD" | _json_get access_token)
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || die "no access_token: $TOKEN_PAYLOAD"

AUTH=( -H "Authorization: Bearer $TOKEN" )

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
printf '%s' "Lawful basis for processing personal data under GDPR Article 6." >"$TMP"

code_ingest=$(curl -sS -o /tmp/ingest_sse.txt -w "%{http_code}" -X POST "$BASE/api/v1/ingest/document" \
  "${AUTH[@]}" \
  -F "file=@${TMP};filename=policy.txt;type=text/plain") || die "curl ingest failed"
[[ "$code_ingest" == "200" ]] || die "ingest expected 200, got $code_ingest"

grep -q "event: progress" /tmp/ingest_sse.txt || die "ingest SSE missing progress event"
grep -qE "event: (done|summary|mapping_done)" /tmp/ingest_sse.txt || die "ingest SSE missing completion event"

echo "Track B smoke OK: llm-providers → login → ingest/document SSE"
