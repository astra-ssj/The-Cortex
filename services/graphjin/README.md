# GraphJin in CORTEX

[GraphJin](https://github.com/dosco/graphjin) compiles GraphQL to SQL against PostgreSQL. In this repo it is the **read-optimized data layer** for the same `cortex` database that FastAPI uses for writes, auth, and ZTAIP logic.

## How it helps

| Benefit | Details |
|--------|--------|
| **Read/write split** | **FastAPI** owns mutations, JWT, rate limits, audit, assessments, and human review. The **current React app** still calls **REST** on FastAPI. **GraphJin** adds an optional **GraphQL read** path on the same tables so you can add tools, admin panels, or reporting that need flexible joins without hand-writing every endpoint. |
| **Less boilerplate** | New screens that need `organizations` + `users` + `assessment_results` in one round-trip can use GraphQL instead of many bespoke `/api/v1/...` endpoints. |
| **Same schema** | All SQL lives in the single lane [`migrations/`](../../migrations/); GraphJin introspects those tables. |
| **Dev UX** | With `web_ui: true`, the container serves a small UI to try queries (localhost only; lock down in production). |

## Compose

- **`graphjin`** starts with the default stack: `docker compose up -d` (alongside `postgres` and `api`).
- Service **`graphjin`** maps **host `8080`** → GraphJin.
- **API** remains **`8000`**.
- The image entrypoint is the `graphjin` CLI; Compose sets **`command: ["serve", "--path", "/app/config"]`** so the HTTP server actually starts (without this, the container prints help and exits).
- Database credentials use the same **`POSTGRES_*`** variables as **`postgres`** and **`api`** (`GJ_DATABASE_*`). If Postgres was initialized earlier with a different password (persistent **`postgres_data`** volume), GraphJin may log SASL/auth failures until you align **`POSTGRES_PASSWORD`** or reset the volume for local dev.

```bash
# After compose is up
open http://localhost:8080
```

## Security

- **Dev:** auth is not configured for GraphJin; **do not expose 8080 to the internet**. For production, use GraphJin’s JWT / allow-list docs and a private network.
- **Writes** must go through **FastAPI** so `audit_fabric`, validation, and tenancy stay centralized.

## When GraphJin is optional

The product works without opening port **8080**. GraphJin is an **accelerator** for read-heavy and exploratory access, not a hard dependency of the current React app (which uses `/api` → FastAPI through Vite’s proxy).
