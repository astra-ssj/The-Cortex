#!/usr/bin/env bash
# Apply the immutable Astra migration manifest with checksums in one locked psql session.
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=cortex PGPASSWORD=... PGDATABASE=cortex ./scripts/apply_cortex_schema.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/migrations/manifest.txt"
export PGPASSWORD="${PGPASSWORD:-}"

if ! command -v psql &>/dev/null; then
  for p in /opt/homebrew/opt/libpq/bin /opt/homebrew/Cellar/libpq/*/bin /usr/local/opt/libpq/bin; do
    if [[ -x "$p/psql" ]]; then
      export PATH="$p:$PATH"
      break
    fi
  done
fi
command -v psql >/dev/null || {
  echo "psql is required to apply Astra migrations" >&2
  exit 127
}
[[ -f "$MANIFEST" ]] || {
  echo "Migration manifest not found: $MANIFEST" >&2
  exit 2
}

sha256_file() {
  if command -v sha256sum >/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

sql_file="$(mktemp "${TMPDIR:-/tmp}/astra-migrate.XXXXXX.sql")"
trap 'rm -f "$sql_file"' EXIT

cat >"$sql_file" <<'SQL'
\set ON_ERROR_STOP on
SELECT pg_advisory_lock(87201402);
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  checksum CHAR(64),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum CHAR(64);
SQL

if [[ "${ASTRA_MIGRATION_ADOPT_CHECKSUMS:-0}" == "1" ]]; then
  echo "\\echo Adopting checksums for legacy migration ledger entries" >>"$sql_file"
fi

while IFS= read -r relative || [[ -n "$relative" ]]; do
  [[ -z "$relative" || "$relative" == \#* ]] && continue
  file="$ROOT/$relative"
  [[ -f "$file" ]] || {
    echo "Manifest entry does not exist: $relative" >&2
    exit 2
  }
  version="$(basename "$relative")"
  checksum="$(sha256_file "$file")"

  if [[ "${ASTRA_MIGRATION_ADOPT_CHECKSUMS:-0}" == "1" ]]; then
    printf "UPDATE schema_migrations SET checksum = '%s' WHERE version = '%s' AND checksum IS NULL;\n" \
      "$checksum" "$version" >>"$sql_file"
  fi

  cat >>"$sql_file" <<SQL
\set migration_version '$version'
\set migration_checksum '$checksum'
SELECT EXISTS (
         SELECT 1 FROM schema_migrations WHERE version = :'migration_version'
       ) AS migration_exists,
       COALESCE((
         SELECT checksum = :'migration_checksum'
         FROM schema_migrations
         WHERE version = :'migration_version'
       ), false) AS checksum_matches
\gset
\if :migration_exists
  \if :checksum_matches
    \echo Skipping verified migration :migration_version
  \else
    \echo Migration checksum mismatch or missing checksum: :migration_version
    -- ON_ERROR_STOP converts this deliberate error into a non-zero psql exit.
    DO \$migration_error\$
    BEGIN
      RAISE EXCEPTION 'migration checksum verification failed';
    END
    \$migration_error\$;
  \endif
\else
  \echo Applying :migration_version
  BEGIN;
  \i '$file'
  INSERT INTO schema_migrations (version, checksum)
  VALUES (:'migration_version', :'migration_checksum');
  COMMIT;
\endif
SQL
done <"$MANIFEST"

cat >>"$sql_file" <<'SQL'
SELECT pg_advisory_unlock(87201402);
SQL

psql -X -v ON_ERROR_STOP=1 -f "$sql_file"

# The API uses the constrained role so RLS and append-only grants bind.
if [[ -n "${PGPASSWORD:-}" ]]; then
  psql -X -v ON_ERROR_STOP=1 --set=app_password="$PGPASSWORD" <<'SQL'
SELECT format('ALTER ROLE cortex_app WITH PASSWORD %L', :'app_password') \gexec
SQL
fi

echo "Astra schema apply complete."
