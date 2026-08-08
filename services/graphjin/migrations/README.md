# GraphJin migrations (moved)

SQL that used to live here is part of the **single migration lane** at repo root:

[`migrations/`](../../../migrations/)

Apply order is filename order (`002` … `015`), via `docker-compose.yml` or `scripts/apply_cortex_schema.sh`. GraphJin introspects the live Postgres schema; it does not need a separate migration directory at runtime.
