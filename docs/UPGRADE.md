# Upgrade Astra GRC Community Edition

Pin `ASTRA_API_IMAGE` and `ASTRA_FRONTEND_IMAGE` in `.env` to the target
release tag or digest. Read the release notes for version-specific constraints,
then run:

```bash
./scripts/upgrade.sh
```

The script creates a database backup first, pulls images, runs the one-shot
migration service, and waits for the API and frontend to become healthy.
Migrations are checksum-verified and serialized by an advisory lock.

After acceptance, retain the pre-upgrade backup according to your retention
policy. If health checks fail, inspect `docker compose --env-file .env -f
release/compose.yml logs migrate api frontend`. Do not edit migration files or
the migration ledger to force an upgrade.

For an offline upgrade, verify the release checksums, load all images with
`docker load`, update `.env` to the loaded tags, and run the same script.
