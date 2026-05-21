# CORTEX architecture

CORTEX is an enterprise organizational intelligence platform on the **ZTAIP** (Zero Trust Agentic Intelligence Platform) stack: federated ontology, governance at the data layer, and human-in-the-loop for consequential AI actions.

## Runtime services

| Service | Port | Role |
|---------|------|------|
| **FastAPI** (`api`) | 8000 | Writes, auth, JWT tenancy, audit, assessments, Shasta, compliance graph API |
| **PostgreSQL** | 5432 (internal) | System of record |
| **GraphJin** | 8080 | Auto-generated GraphQL read layer on the same schema |
| **Vite frontend** | 3000 | React SPA (proxies `/api` → FastAPI) |

Start locally: `POSTGRES_PASSWORD=… docker compose up -d` (includes GraphJin by default).

## Compliance graph

The compliance graph models **cross-framework intelligence** and **test once, comply many**.

### Node types

1. **framework** — Regulation or standard (e.g. `iso27001-2022`, `gdpr-2016-679`)
2. **control** — Requirement reference (e.g. `ISO-A.5.17`, `GDPR-Art.32`)
3. **evidence** — Org-scoped proof items (scans, policies, reports)
4. **finding** — Open remediation gaps (in-memory demo store + future DB)
5. **entity** — Legal entity scope (`astralabs-de`, etc.)

### Edge types

1. **contains** — Framework → control
2. **maps_to** — Control → control (cross-framework mapping with `relationship` + `confidence`)
3. **proves** — Evidence → control (`strength`: FULL | PARTIAL | INDIRECT)
4. **violates** — Finding → control
5. **applies_to** — Framework → entity (with `scope`, NCA metadata)

### Tables (`migrations/013_compliance_graph.sql`)

- `control_mappings` — Curated cross-framework relationships
- `evidence` — Org-scoped evidence vault rows
- `evidence_controls` — Junction: one evidence item satisfies many controls
- `framework_entities` — Which frameworks apply to which entities

### APIs

- `GET /api/v1/graph/{org_id}` — Full graph + stats (work reduction %, framework coverage)
- `GET /api/v1/graph/{org_id}/control/{control_id}` — Neighbourhood subgraph
- `GET /api/v1/graph/{org_id}/evidence/{evidence_id}` — Test-once coverage view
- `GET /api/v1/graph/{org_id}/impact/{finding_id}` — Finding blast radius

### GraphJin

GraphJin exposes the same tables for nested GraphQL queries (e.g. `evidence { evidence_controls { control_id } }`). All mutations remain on FastAPI.
