#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/release-common.sh
source "$ROOT/scripts/release-common.sh"

require_command docker
require_release_files

purge="${1:-}"
if [[ "$purge" == "--purge-data" ]]; then
  [[ "${2:-}" == "--yes" ]] || {
    echo "Data purge is irreversible. Use: $0 --purge-data --yes" >&2
    exit 2
  }
  "$ROOT/scripts/backup.sh"
  compose down --remove-orphans --volumes
  echo "Astra GRC CE containers and data volume removed; a final backup was retained."
else
  compose down --remove-orphans
  echo "Astra GRC CE containers removed. Database volume and $ENV_FILE were preserved."
fi
