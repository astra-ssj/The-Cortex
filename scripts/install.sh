#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/release-common.sh
source "$ROOT/scripts/release-common.sh"

require_command docker
docker compose version >/dev/null

product_version="$(tr -d '[:space:]' <"$ROOT/VERSION")"
[[ "$product_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "Invalid VERSION: $product_version" >&2
  exit 2
}
image_tag="v$product_version"

if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  random_secret() {
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -hex "$1"
    else
      python3 -c "import secrets; print(secrets.token_hex($1))"
    fi
  }
  cat >"$ENV_FILE" <<EOF
ASTRA_PORT=${ASTRA_PORT:-8080}
POSTGRES_USER=cortex
POSTGRES_DB=cortex
POSTGRES_PASSWORD=$(random_secret 24)
JWT_SECRET=$(random_secret 32)
COMPLIANCE_ENGINE_STUB_PASSWORD=$(random_secret 24)
COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN=$(random_secret 32)
MODEL_PROVIDER=stub
CORTEX_LLM_PROVIDERS=stub
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://ollama:11434
AGENT_MODEL=gemma4:12b
OLLAMA_CONTEXT_LENGTH=4096
ASTRA_API_IMAGE=${ASTRA_API_IMAGE:-ghcr.io/astra-ssj/astra-grc-ce-api:$image_tag}
ASTRA_FRONTEND_IMAGE=${ASTRA_FRONTEND_IMAGE:-ghcr.io/astra-ssj/astra-grc-ce-frontend:$image_tag}
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:16-alpine}
ASTRA_DATA_VOLUME=${ASTRA_DATA_VOLUME:-astra_grc_ce_postgres_data}
EOF
  echo "Created $ENV_FILE with mode 0600."
else
  echo "Using existing $ENV_FILE."
fi

require_release_files

gemma_archive="${ASTRA_GEMMA_ARCHIVE:-$ROOT/models/gemma4/astra-gemma4-12b.tar}"
if [[ -f "$gemma_archive" ]]; then
  python3 "$ROOT/scripts/verify_gemma_bundle.py" "$gemma_archive"
  python3 - "$ENV_FILE" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
updates = {
    "MODEL_PROVIDER": "ollama",
    "AGENT_MODEL": "gemma4:12b",
    "OLLAMA_BASE_URL": "http://ollama:11434",
    "OLLAMA_CONTEXT_LENGTH": "4096",
    "COMPOSE_PROFILES": "offline-ai",
}
lines = path.read_text(encoding="utf-8").splitlines()
seen = set()
rewritten = []
for line in lines:
    key = line.split("=", 1)[0]
    if key in updates:
        rewritten.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        rewritten.append(line)
for key, value in updates.items():
    if key not in seen:
        rewritten.append(f"{key}={value}")
path.write_text("\n".join(rewritten) + "\n", encoding="utf-8")
PY
fi

compose config --quiet
compose pull
compose up -d --wait
if [[ -f "$gemma_archive" ]]; then
  ASTRA_GEMMA_ARCHIVE="$gemma_archive" bash "$ROOT/scripts/load_gemma_bundle.sh"
fi
port="$(awk -F= '$1 == "ASTRA_PORT" {print $2}' "$ENV_FILE" | tail -n 1)"
echo "Astra GRC Community Edition is available at http://127.0.0.1:${port:-8080}"
