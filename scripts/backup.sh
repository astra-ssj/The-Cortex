#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/release-common.sh
source "$ROOT/scripts/release-common.sh"

require_command docker
require_release_files

destination="${1:-$ROOT/backups}"
mkdir -p "$destination"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$destination/astra-grc-ce-$timestamp.dump"
metadata="$destination/astra-grc-ce-$timestamp.metadata"

compose exec -T postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --format=custom --no-owner --no-privileges --username="$POSTGRES_USER" "$POSTGRES_DB"' \
  >"$archive"

{
  echo "created_at=$timestamp"
  echo "compose_file=$COMPOSE_FILE"
  compose images --format json
} >"$metadata"
sha256_file "$archive" >"$archive.sha256"
chmod 600 "$archive" "$archive.sha256" "$metadata"
echo "Backup created: $archive"
