#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ASTRA_COMPOSE_FILE:-$ROOT/release/compose.yml}"
ENV_FILE="${ASTRA_ENV_FILE:-$ROOT/.env}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 127
  }
}

compose() {
  docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require_release_files() {
  [[ -f "$COMPOSE_FILE" ]] || {
    echo "Compose file not found: $COMPOSE_FILE" >&2
    exit 2
  }
  [[ -f "$ENV_FILE" ]] || {
    echo "Environment file not found: $ENV_FILE (run scripts/install.sh)" >&2
    exit 2
  }
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}
