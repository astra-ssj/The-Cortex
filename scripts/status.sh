#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/release-common.sh
source "$ROOT/scripts/release-common.sh"

require_command docker
require_release_files
compose ps

port="$(awk -F= '$1 == "ASTRA_PORT" {print $2}' "$ENV_FILE" | tail -n 1)"
port="${port:-8080}"
if curl --fail --silent --show-error "http://127.0.0.1:${port}/health" >/dev/null; then
  echo "Astra GRC CE frontend is healthy at http://127.0.0.1:${port}"
else
  echo "Astra GRC CE frontend health check failed." >&2
  exit 1
fi
