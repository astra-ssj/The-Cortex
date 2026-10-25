#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/release-common.sh
source "$ROOT/scripts/release-common.sh"

archive="${1:-}"
confirmation="${2:-}"
[[ -f "$archive" ]] || {
  echo "Usage: $0 BACKUP.dump --yes" >&2
  exit 2
}
[[ "$confirmation" == "--yes" ]] || {
  echo "Restore replaces the current database. Re-run with --yes after verifying your backup." >&2
  exit 2
}

require_command docker
require_release_files

if [[ -f "$archive.sha256" ]]; then
  (cd "$(dirname "$archive")" && {
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum --check "$(basename "$archive").sha256"
    else
      expected="$(awk '{print $1}' "$(basename "$archive").sha256")"
      actual="$(shasum -a 256 "$(basename "$archive")" | awk '{print $1}')"
      [[ "$actual" == "$expected" ]]
    fi
  })
fi

# Preserve an immediate rollback point before any destructive restore operation.
"$ROOT/scripts/backup.sh"
compose stop api frontend
compose exec -T postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --clean --if-exists --exit-on-error --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  <"$archive"
compose up -d --wait
echo "Restore complete."
