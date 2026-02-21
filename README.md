# CORTEX

**Enterprise organizational intelligence platform** on the **ZTAIP** (Zero Trust Agentic Intelligence Platform) architecture. CORTEX helps organizations manage compliance across multiple frameworks, run assessments, ingest evidence, and connect to cloud providers (AWS, Azure) for control discovery and findings.

---

## Architecture

### Principles (ZTAIP)

- **Zero trust:** Every LLM call is wrapped in a **CircuitBreaker**; no direct external calls without protection.
- **Audit-first:** Consequential actions are logged to the **audit fabric** before and after execution (append-only).
- **Human-in-the-loop:** Outcomes with `confidence_score < 0.75` are routed to human review; no autonomous high-impact decisions.
- **Federated ontology:** Domain models use jurisdiction and purpose tags; no single monolithic cross-service dependency.
- **Governance as infrastructure:** Policy and compliance are enforced at the data layer.

### Stack

| Layer        | Technology |
|-------------|------------|
| Backend     | Python 3.12, FastAPI, SQLAlchemy async, Pydantic v2 |
| API gateway | Node.js 20, TypeScript, Express |
| Frontend    | React 18, TypeScript, Tailwind, TanStack Query |
| Data        | PostgreSQL 16, Redis 7, Kafka, Qdrant |
| Tests       | pytest, pytest-asyncio (Python); vitest (TS) |
| Runtime     | Docker, Kubernetes |

### Core components

- **Compliance engine** — Registry of frameworks (NIST CSF, GDPR, NIS2, SOC2, ISO 27001, HIPAA, PCI DSS, CCPA). Frameworks define controls, requirements, and evidence types.
- **Assessment engine** — Runs assessments per organization and framework; streams events via SSE; uses context builder and (when enabled) LLM behind CircuitBreaker.
- **Audit fabric** — Append-only audit log for all consequential operations.
- **Ingestion** — Document upload (PDF, DOCX, TXT), chunking, mapping to ontology, evidence creation; progress via SSE.
- **Connectors** — AWS and Azure: connect (validate credentials, discover systems/controls), sync (re-run discovery, stream progress via SSE). Credentials stored encrypted (Fernet when `CORTEX_CONNECTOR_SECRET_KEY` is set).

---

## API reference

Base URL: `/api/v1` (plus `/health`, `/ready` at root).

### Frameworks & assessments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/frameworks` | List all registered frameworks (summary). |
| `GET` | `/frameworks/{framework_id}` | Get one framework with full controls. |
| `GET` | `/frameworks/{framework_id}/controls` | Paginated controls (`page`, `page_size`). |
| `GET` | `/assessments/run` | Run assessment stream (SSE). Query: `organization_id`, `framework_ids` (comma-separated). |

### Organisations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/organisations/{org_id}` | Organisation profile. |
| `GET` | `/organisations/{org_id}/posture` | Compliance posture for the organisation. |

### Ingestion

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest/document` | Multipart upload (PDF, DOCX, TXT; max 10MB). Returns SSE stream (progress, mapping_done, evidence_created, summary, done). |

### Connectors

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/connectors/aws/connect` | Validate AWS credentials, run discovery, store credentials. Body: `account_id`, `access_key_id`, `secret_access_key`, `region`, optional `role_arn`, `external_id`. |
| `POST` | `/connectors/aws/sync` | Re-run AWS discovery with stored credentials; stream progress via SSE. |
| `POST` | `/connectors/azure/connect` | Validate Azure credentials, run discovery, store credentials. Body: `tenant_id`, `client_id`, `client_secret`, `subscription_id`. |
| `POST` | `/connectors/azure/sync` | Re-run Azure discovery with stored credentials; stream progress via SSE. |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/system/ztaip-status` | ZTAIP status: audit fabric (total events, last event), circuit breaker count, human review queue count, sovereignty broker, agent certificates. |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness. |
| `GET` | `/ready` | Readiness. |

---

## Quick start

1. **Clone and install**

   ```bash
   git clone https://github.com/AstraLabs-AI/The-Cortex
   cd The-Cortex
   pip install -e ".[dev]"
   ```

2. **Database (Docker)**

   Set `POSTGRES_PASSWORD` (required), then:

   ```bash
   export POSTGRES_PASSWORD=your-secure-password
   docker-compose up -d postgres
   docker-compose run --rm seed
   ```

3. **Run API**

   ```bash
   export DATABASE_URL="postgresql+asyncpg://cortex:your-password@localhost:5432/cortex"
   uvicorn api.main:app --reload
   ```

4. **Run tests**

   ```bash
   pytest tests/ -v
   pytest tests/ --cov=app --cov=compliance --cov=core --cov=api --cov=services --cov-report=term-missing
   ```

See **CORTEX_SETUP.md** for Cursor/Composer workflow and first-session checklist.

---

## Roadmap

- [ ] **LLM integration** — Wire assessment and ingestion to real LLM calls behind CircuitBreaker; keep confidence threshold and human-review routing.
- [ ] **Audit persistence** — Move audit fabric from in-memory to append-only DB (e.g. `audit_log` table).
- [ ] **Authentication & authorization** — Enforce auth on all endpoints; no disabling for convenience.
- [ ] **Rate limiting** — Enforce limits at gateway or in-app (headers already added; enforcement TBD).
- [ ] **Sovereignty broker & agent certs** — Replace placeholders in ZTAIP status with real broker and certificate counts.
- [ ] **Additional frameworks** — Add new frameworks via the NIST CSF pattern; register in `compliance/registry.py` and extend `FrameworkId`.
- [ ] **Kubernetes manifests** — Add K8s deployment and service manifests for all services; health/ready probes.

---

## License & contributing

See repository license. For contribution and code patterns, follow **.cursorrules** (ZTAIP rules, stack, patterns, no raw LLM calls, structlog, audit_fabric on consequential ops).
