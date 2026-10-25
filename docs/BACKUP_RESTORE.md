# Backup and restore

## Create a backup

```bash
./scripts/backup.sh
# or choose a destination
./scripts/backup.sh /secure/backup/path
```

Each backup includes a PostgreSQL custom-format dump, SHA-256 checksum, and
image metadata. Files are owner-readable only. Copy them to encrypted,
access-controlled storage and test restoration on a separate installation.

## Restore

Restore replaces the active database. The script requires explicit confirmation
and takes another backup before stopping application traffic:

```bash
./scripts/restore.sh /secure/backup/path/astra-grc-ce-TIMESTAMP.dump --yes
```

When a sibling `.sha256` file is present, it is verified before any destructive
step. The API and frontend restart only after restore completion and health
checks.

Backups can contain identities, learner decisions, evidence, and append-only
audit history. Apply the same jurisdiction, purpose, retention, and access
controls as the live database. Never sanitize a backup by updating or deleting
individual `audit_log` rows; expire the whole backup under the approved
retention policy.
