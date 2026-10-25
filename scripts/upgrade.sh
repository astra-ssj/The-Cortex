#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/release-common.sh
source "$ROOT/scripts/release-common.sh"

require_command docker
require_release_files

"$ROOT/scripts/backup.sh"
compose pull
# The one-shot migration must succeed before the API can become healthy.
compose up -d --wait
"$ROOT/scripts/status.sh"
echo "Upgrade complete. Keep the new backup until the release is accepted."
