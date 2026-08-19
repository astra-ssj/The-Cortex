# Astra GRC Community Edition

> Master GRC through adversarial simulation.
> Case-based scenario training for security and GRC practitioners.
> Build judgment, not just knowledge.

## What is Astra GRC?

Astra GRC is a case-based GRC competency training platform built
by AstraLabs. It presents realistic security and compliance
scenarios, grades your decisions against framework-grounded
reference answers, and tracks your competency across four
independent dimensions.

The goal is judgment under pressure — not recall. Every scenario
places you inside a real-world situation with a stakeholder
pressing for a decision, a clock running, and a correct answer
grounded in a specific framework control.

After sign-in you land on the **Audit Simulator**: choose a
framework (ISO 27001:2022 or GDPR) and an audit type, then run
an assessment into the Learning Loop.

## Current Track: ISO 27001:2022

Five scenarios across three difficulty levels:

| ID | Title | Difficulty | Controls |
|----|-------|------------|---------|
| CX-1001 | Friday Cutover: Privileged Cloud Access Request | Foundation | A.8.2, A.5.18, A.5.15 |
| CX-1002 | Third-Party Breach: Supplier Security Incident | Practitioner | A.5.19, A.5.20, A.5.26, A.5.28 |
| CX-1003 | Emergency Patch: Change Management Bypass | Practitioner | A.5.26, A.8.32, A.10.1 |
| CX-1004 | Audit Prep: Sensitive Data on Unclassified Storage | Practitioner | A.5.9, A.5.12, A.5.13, A.5.28, A.10.1 |
| CX-1005 | Ransomware: Group-Wide Business Continuity Invocation | Expert | A.5.26, A.5.28, A.5.29, A.5.30, A.8.13 |

## Competency Dimensions

Each decision is scored across four independent dimensions:

| Dimension | What it measures |
|-----------|-----------------|
| Control Mapping | Identifying the right control for the situation |
| Evidence Quality | Making decisions supportable by documented evidence |
| Escalation Judgment | Seeking information before committing under uncertainty |
| Remediation | Scoping corrective action correctly at the escalation stage |

Scores start at 50 and update after each decision. Dimensions
are independent — strong control mapping does not compensate
for poor escalation judgment.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Backend | FastAPI, Python 3.12, SQLAlchemy async, asyncpg |
| Database | PostgreSQL 16 (Docker Compose) |
| Agent harness | LangGraph-compatible, scenario-driven |
| Auth | JWT (HS256), bcrypt, row-level security |
| Container | Docker Compose (Postgres + API + GraphJin) |

## Quick Start

### Prerequisites

- Docker Desktop
- Node.js 18+
- Python 3.12+
- Git

### Setup

```bash
git clone https://github.com/astra-ssj/The-Cortex
cd The-Cortex

# Start Postgres
docker compose up -d postgres

# Apply schema (migrations 002–032)
bash scripts/apply_cortex_schema.sh

# Install Python dependencies
pip install -e "."

# Start API
export PYTHONPATH=.
export DATABASE_URL="postgresql+asyncpg://cortex_app:cortex_ci_test@127.0.0.1:5432/cortex"
export JWT_SECRET="your-secret-key-minimum-32-characters"
export CORTEX_LEGACY_DEMO_PASSWORD="admin"
uvicorn api.main:app --port 8000

# Start frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:3000 and log in with
`admin@astralabs.com` / `admin`. You land on `/audit-simulator`.

### Verify

```bash
# API health
curl -s http://localhost:8000/health
curl -s http://localhost:8000/api/v1/system/ready

# Backend tests
pytest --tb=short -q

# Frontend
cd frontend && npm run typecheck && npm run build
```

## Safe Snapshot Tags

| Tag | Description |
|-----|-------------|
| `v1.0-compliance-platform-full` | Pre-pivot compliance platform |
| `v2.0-learning-platform-base` | Post-pivot foundation |
| `v2.0.1-schema-clean` | Schema aligned, decommissioned tables dropped |
| `v2.1-grading-engine` | Four-dimension competency grading |
| `v2.2-routing-clean` | Default route to /learning |
| `v2.3-two-scenarios` | CX-1001, CX-1002 |
| `v2.4-scenario-selector` | Scenario selector UI |
| `v2.5-three-scenarios` | CX-1001–CX-1003 |
| `v2.6-four-scenarios` | CX-1001–CX-1004 |
| `v2.7-five-scenarios` | CX-1001–CX-1005 |
| `v2.8-help-rewrite` | Learning platform help system |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

Apache License 2.0 — see LICENSE and NOTICE.

Enterprise features, commercial licensing, or support may be
offered separately; the Apache-licensed core remains usable
without those terms.

CI runs Ruff, Bandit, ESLint, Vitest, tsc, build, and
dependency audits (pip-audit, npm audit) on main and PRs.
