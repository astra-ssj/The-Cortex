# Astra GRC migrations (single lane)

All incremental DDL lives here. **Filename order is apply order.**

| File | Role |
|------|------|
| `../init.sql` | Base schema (audit_log, orgs, etc.) — applied first |
| `002`–`008` | Ontology, assessments, controls, multi-tenancy, human review |
| `009`–`010` | Shasta CSPM |
| `011`–`012` | Operational persistence + security/auth |
| `013`–`015` | Compliance graph, Microsoft integration, relationship graph |
| `016` | RLS tenant isolation + durable append-only hash-chained `audit_log` |

Apply via:

- `docker compose up` (Postgres `docker-entrypoint-initdb.d`, fresh volumes only)
- `scripts/apply_cortex_schema.sh` (CI and existing DBs)

Do **not** add a second migration folder. Infrastructure documentation should link here.
