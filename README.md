# CORTEX — Zero Trust AI Compliance Platform

> The only compliance platform that governs its own AI while governing yours — across every framework, every jurisdiction, in real time.

## What is CORTEX?

CORTEX is an EU-first, mid-market compliance intelligence platform for organisations that operate across entities and jurisdictions. It combines continuous posture scoring across major frameworks (including **NIS2**, **GDPR**, and the **EU AI Act**) with a Zero Trust Agentic Intelligence Platform (**ZTAIP**) architecture: every AI-assisted outcome is confidence-scored, consequential actions are audit-logged, and low-confidence decisions are routed to human review.

Built by **AstraLabs Group**, CORTEX is AI-native without being AI-reckless — federated ontology, governance at the data layer, and cryptographic evidence chains meant for real auditors and regulators, not slide decks.

## Key Features

### Compliance Intelligence

- Multi-entity group dashboard (six jurisdictions)
- AI assessment engine (ZTAIP) with confidence scoring
- Human review queue (aligned with GDPR Art.22 and EU AI Act Art.14 concepts)
- Remediation tracker with audit trail

### Intelligence Section

- Counterfactual Audit Simulator (BSI, CNIL, ICO, Garante, EU AI Office patterns)
- Live control-telemetry fusion (signals mapped to controls)
- Regulation-as-Code style EU regulatory change feed
- Cryptographic evidence vault (SHA-256 hash chain)

### AI Systems (EU AI Act)

- AI system inventory and Annex III classification
- ISO 42001-grounded classification reasoning
- Obligation mapping with August 2026 countdown and deadline tracker

### Customer Onboarding

- Multi-tenant registration
- Three-step setup wizard
- Demo mode toggle for comparing tenant vs AstraLabs reference data

### Compliance graph

- **UI:** `/graph` — interactive D3 force graph (controls, evidence, frameworks, entities, findings).
- **API:** `GET /api/v1/graph/{org_id}` plus control/evidence/impact subgraph routes — see [`api/graph.py`](api/graph.py) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Schema:** `control_mappings`, `evidence`, `evidence_controls`, `framework_entities` (`migrations/013_compliance_graph.sql`).
- **GraphJin:** Nested GraphQL on the same tables, e.g. `evidence { evidence_controls { control_id framework_id } }`.

### Cloud security (Shasta CSPM)

- **Cloud scans** UI (`/cloud-scans`) — async AWS/Azure scans; Postgres is the source of truth for runs and findings (migration `009_shasta_cloud.sql`).
- **API:** `POST /api/v1/shasta/scans`, list/detail scan endpoints, findings — see [`api/shasta_cloud.py`](api/shasta_cloud.py). Contract: `GET /api/v1/shasta/contract`.
- **Optional Redis:** Set `REDIS_URL` or `SHASTA_REDIS_URL` and run `workers/shasta_worker.py`, or `docker compose --profile queue` — details in [`docs/CORTEX_SETUP.md`](docs/CORTEX_SETUP.md).
- **Assessment SSE:** Browser uses `Authorization: Bearer` for the stream (no JWT in the URL). Help panel → **Cloud scans (Shasta)** for operator notes.
- **Evidence map (MVP):** `GET /api/v1/shasta/scans/{scan_run_id}/evidence-map` returns finding ↔ control nodes and edges; **Cloud scans** shows a table when Findings for a run is expanded.
- **QA:** Release checklist, smoke commands, and security audits — [`docs/RELEASE_QA.md`](docs/RELEASE_QA.md). Latest run: [`docs/archive/QA-REPORT.md`](docs/archive/QA-REPORT.md), [`docs/archive/SAST-REPORT.md`](docs/archive/SAST-REPORT.md).

## Tech Stack

| Layer       | Technology                                              |
|-------------|---------------------------------------------------------|
| Frontend    | React 18, TypeScript, Vite                              |
| Backend     | FastAPI, Python 3.12, SQLAlchemy async, asyncpg       |
| Database    | PostgreSQL 16 (Docker Compose)                        |
| Data/API    | FastAPI REST (`/api/v1`), same process as assessments and auth |
| GraphQL     | GraphJin sidecar (port **8080**) — auto-generated reads on Postgres; compliance graph tables in `migrations/013_compliance_graph.sql` |
| Async jobs  | Optional Redis + worker (`docker compose --profile queue`) for durable Shasta scan jobs — see [docs/CORTEX_SETUP.md](docs/CORTEX_SETUP.md) |
| GRC Skills  | Loaded examples include GDPR, ISO 27001, DORA, ISO 42001 (`core/skills_loader.py`) |
| Auth        | JWT (HS256), bcrypt passwords                           |
| Container   | Docker Compose (Postgres + API + GraphJin by default)   |

## Frameworks Supported

| Framework              | Controls | Jurisdiction  |
|------------------------|----------|----------------|
| ISO/IEC 27001:2022     | 93       | International  |
| GDPR 2016/679          | 25       | EU             |
| NIS2 Directive         | 20       | EU             |
| NIST CSF 2.0           | 106      | US             |
| CSA CCM v4.0           | 197      | International  |
| Cyber Essentials v3.1  | 18       | UK             |
| EU AI Act 2024         | 31       | EU             |
| EU Cybersecurity Act   | 22       | EU             |
| **Total**              | **491**  |                |

## Quick Start

### Prerequisites

- Docker Desktop
- Node.js 18+
- Git

### Setup

```bash
git clone https://github.com/AstraLabs-AI/The-Cortex
cd The-Cortex

# Start backend (Postgres + API)
POSTGRES_PASSWORD=cortex-dev docker compose up -d

# After editing backend Python (api/, core/, db/), rebuild the API image or changes won't run:
#   docker compose up -d --build api

# Verify API health and DB readiness
curl -s http://localhost:8000/health
curl -s http://localhost:8000/ready

# End-to-end HTTP smoke (same spine CI runs): health → login → frameworks → review → approve
bash scripts/smoke_happy_path.sh

# Start frontend
cd frontend && npm install && npm run dev
```

Optional: set **`VITE_CORTEX_DEPLOY_LABEL`** (for example `staging`) in `frontend/.env.local` to show a deployment badge in the header; without it, dev builds show **DEV** and production builds hide the badge unless the variable is set.

Open http://localhost:3000

**Login (demo tenant):** Use **`admin`** / **`admin`** or **`admin@astralabs.com`** / **`admin`**. The database seed creates the admin row; Docker Compose also sets `CORTEX_LEGACY_DEMO_PASSWORD=admin` so the shorthand works even before DB lookup. If you run the API outside Compose without that env var, either export `CORTEX_LEGACY_DEMO_PASSWORD=admin` or rely on the seeded email above. **No database:** in-memory demo **`ciso@astralabs.com`** / **`cortex-ciso-2026`** (see `tests/test_auth.py`).

### Register a new tenant

Open http://localhost:3000/register, fill company details, complete the three-step wizard.

---

## Architecture

### Principles (ZTAIP)

- **Zero trust:** External LLM and brittle integrations run behind circuit breakers; no unconstrained agent autonomy on high-impact paths.
- **Audit-first:** Consequential operations target append-only audit semantics (`audit_fabric` / audit log patterns — evolve toward persistent store).
- **Human-in-the-loop:** Confidence below **0.75** routes to the Review Queue for explicit approve / override with rationale.
- **Federated ontology:** Domain concepts carry jurisdiction and purpose tags; avoid monolithic cross-service coupling.
- **Governance as infrastructure:** Prefer enforcing posture and scope at the data and API boundary, not only in UI logic.

### Request flow (Compose dev)

```text
Browser (React, :3000)
    → FastAPI (`api.main`, :8000) — single REST surface (auth, assessments, ingest, connectors, …)
        → PostgreSQL (:5432, internal to Compose network)
    → GraphJin (:8080, localhost) — optional GraphQL reads on the same DB
```

### Repository layout (high level)

| Area | Role |
|------|------|
| `api/` | All REST routers (auth, assessments, findings, ingest, connectors, reports, …) |
| `core/` | Domain: security, RBAC, audit, LLM, connectors, ingestion, skills loader |
| `compliance/` | Framework registry and posture primitives |
| `services/` | Assessment engine helpers, GRC skill packs, GraphJin config (not a second API) |
| `workers/` | Optional Redis consumers (Shasta) |
| `frontend/` | Vite + React SPA |
| `init.sql`, `migrations/` | PostgreSQL schema — **single ordered lane** `002`–`015` |
| `docs/` | Setup, architecture, refactor plan; dated reports in `docs/archive/` |

See [`docs/STRUCTURE.md`](docs/STRUCTURE.md) for the maintained layout map.

### Security defaults

- **JWT:** Prefer `JWT_SECRET` (falls back to `CORTEX_SECRET_KEY`). Eight-hour token lifetime.
- **CORS:** Explicit localhost origins plus optional `FRONTEND_URL` — no `*` wildcard with credentials.
- **Rate limiting:** SlowAPI on `/api/v1/auth/register` and `/api/v1/auth/token`.
- **Headers:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, etc.
- **Dev-only JWT bypass:** Set `CORTEX_ALLOW_TOKEN_BYPASS=true` **and** `CORTEX_TOKEN_BYPASS_VALUE` to the raw bearer string (constant-time compare). Never enable in production.
- **Legacy demo login:** Optional `CORTEX_LEGACY_DEMO_PASSWORD` (and `CORTEX_LEGACY_DEMO_USER`, default `admin`) for scripted demos; unset disables plaintext legacy path (prefer seeded bcrypt demo users in `core/security.py`).

---

## API sketch

Base URL: `/api/v1` (plus `/health`, `/ready`).

Notable routes:

| Area | Examples |
|------|-----------|
| Auth | `POST /auth/token`, `POST /auth/register`, `GET /auth/me`, `PUT /auth/onboarding/step` |
| Organisations | `GET /organisations/{org_id}`, `GET /organisations/{org_id}/posture` |
| Assessments | Stream and summary endpoints under `api/assessments.py` patterns |
| Shasta cloud | `POST /shasta/scans`, `GET /shasta/scans`, `GET /shasta/scans/{id}`, findings routes — see `api/shasta_cloud.py` |

See `.cursorrules` for non‑negotiable ZTAIP conventions when extending the codebase.

---

## Development notes

- **Workflow audit & fixture phases** (login → nine primary nav areas → gaps → phased fixes): [`docs/WORKFLOW_AUDIT_AND_FIXTURE_PHASES.md`](docs/WORKFLOW_AUDIT_AND_FIXTURE_PHASES.md).
- **Repo structure refactor** (absorb compliance-engine, migrate lane, CI gates): [`docs/REPO_STRUCTURE_REFACTOR.md`](docs/REPO_STRUCTURE_REFACTOR.md).
- **Python:** `pip install -e ".[dev]"` (requires Python **≥ 3.12**).
- **Tests:** `pytest tests/ -v`
- **Frontend audit:** After `npm install`, run `npm audit --audit-level=high`. There is no committed lockfile by default; generate `package-lock.json` locally if you want reproducible audits.
- **Python dependency audit:** Use `pip install safety` / `pip-audit` in your environment (Docker image strips dev tooling).

---

## Roadmap (selected)

- Deeper LLM integration behind CircuitBreaker with persisted audit fabric.
- Hardened production JWT settings (`JWT_SECRET`, no dev bypass).
- Kubernetes manifests and gateway-level rate limits alongside in-app limits.

---

## License & contributing

Open source under the **Apache License 2.0** — see [`LICENSE`](LICENSE) and attributions in [`NOTICE`](NOTICE).

Enterprise features, commercial licensing, or support may be offered separately; the Apache-licensed core remains usable without those terms.

Contribution guidelines: [`CONTRIBUTING.md`](CONTRIBUTING.md) and `.cursorrules` (structlog, no naked LLM calls, SovereignModel patterns for new domain entities, append-only audit assumptions).

CI runs Ruff, Bandit (Python), ESLint, Vitest, `tsc`, build, and **blocking** dependency audits (`pip-audit`, `npm audit`) on main/PRs.
