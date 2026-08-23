# Astra GRC — Community Edition

Competence you can evidence.

Astra GRC is case-based GRC competency training. A learner takes a decision under stakeholder pressure and is scored against a framework-grounded reference answer — not against a quiz key. Community Edition trains the practitioner. Enterprise (separate offering) is meant to give their organisation an auditable record of demonstrated judgment. This repository is the Community Edition.

## The learning loop

A scenario opens with a brief. An adversarial stakeholder agent presses for a decision. The learner chooses; the harness grades the choice across four competency dimensions and debriefs against the reference answer. Weak dimensions surface as control gaps.

The platform is built on **purvapaksha**: in Indian philosophical method, a position may not be asserted until its strongest objection has been stated in full. The stakeholder agent argues to win, not to find truth. Holding a correct position against that pressure is the skill being trained.

## Frameworks

Counts below are taken from the seed migrations (`migrations/019`–`024`), not from marketing copy.

| Framework | Status | Scenarios |
|-----------|--------|-----------|
| ISO 27001:2022 | Live | **5** (CX-1001–CX-1005) |
| GDPR | In development | — |
| SOC 2 | In development | — |

ISO 27001 track:

| ID | Title | Difficulty |
|----|-------|------------|
| CX-1001 | Cloud access onboarding | Foundation |
| CX-1002 | Supplier incident response | Practitioner |
| CX-1003 | Change management failure | Practitioner |
| CX-1004 | Asset classification breach | Practitioner |
| CX-1005 | Ransomware group response | Expert |

## Quickstart

```bash
git clone https://github.com/astra-ssj/The-Cortex
cd The-Cortex

docker compose up -d postgres
bash scripts/apply_cortex_schema.sh

python3 -m venv .venv && source .venv/bin/activate
pip install -e "."

export PYTHONPATH=.
export DATABASE_URL="postgresql+asyncpg://cortex_app:cortex_ci_test@127.0.0.1:5432/cortex"
export JWT_SECRET="dev-secret-key-minimum-32-characters-long-xx"
export CORTEX_LEGACY_DEMO_PASSWORD="admin"

# Learning-loop agent (see Model providers)
export MODEL_PROVIDER=anthropic          # requires ANTHROPIC_API_KEY
# export MODEL_PROVIDER=ollama           # requires `ollama serve`; AGENT_MODEL default gemma4:12b
# unset MODEL_PROVIDER                  # current main: Anthropic if ANTHROPIC_API_KEY is set, else stub

uvicorn api.main:app --port 8000
```

In another terminal:

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. Seeded login: `admin@astralabs.com` / `admin` (username `admin` is the same account).

> **Without a model provider configured, agent responses are served by a stub.**
> The product will run, but every stakeholder persona will be the same default role regardless of scenario. Check the startup log for the resolved provider.

`MODEL_PROVIDER=ollama` and the authenticated `GET /api/v1/system/agent-status` route ship on `feat/ollama-provider`. Until that branch is on `main`, unset `MODEL_PROVIDER` follows `ANTHROPIC_API_KEY` → Claude, otherwise stub.

Postgres credentials differ by environment — see [AGENTS.md](AGENTS.md) (Cursor Cloud) and [docs/CORTEX_SETUP.md](docs/CORTEX_SETUP.md) (local Docker vs CI). Do not copy Cloud VM passwords into Docker Compose.

## Release tags

Tags reachable from `main`, most recent first:

| Tag | What it marks |
|-----|----------------|
| `v4.2-demo-integrity` | Role canonicalisation (ciso → admin) and demo integrity |
| `v4.1-astra-light-theme` | Astra GRC light theme and Audit Simulator landing |
| `v1.0.0-community-edition` | Community Edition snapshot |
| `v3.10-audit-chain` | Audit chain lock |
| `v3.9-role-fix` | Role and help-key fix |
| `v3.8-ce-coherence` | Community Edition coherence / CI follow-up |
| `v3.7-control-gaps` | Control gaps view |
| `v3.6-story-fix` | Learning-loop story fix |
| `v3.5-ci-green` | CI stabilisation |
| `v3.4-branding-complete` | Branding and routing |
| `v3.3-full-help-docs` | In-app help docs |
| `v3.2-registration-clean` | Registration / onboarding cleanup |
| `v3.1-claude-live` | Claude wired into `call_model()` |
| `v3.0-multi-scenario-fixed` | Multi-scenario stage transitions |
| `v2.9-docs-complete` | GitHub docs pass |
| `v2.8-help-rewrite` | Help system rewrite |
| `v2.7-five-scenarios` | CX-1005 (five ISO 27001 scenarios) |
| `v2.6-four-scenarios` | CX-1004 |
| `v2.5-three-scenarios` | CX-1003 |
| `v2.4-scenario-selector` | Scenario selector UI |

`safety/pre-recovery-20260820` exists on the remote but is **not** reachable from `main`.

## Architecture

FastAPI + PostgreSQL (RLS, append-only audit) + a React SPA. Agent output is schema-validated in `core/agents/harness.py` before it touches session state. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What's in this repository

This tree was forked from a broader compliance platform. Modules such as assessments, findings, posture, connectors, and GraphJin are **demo backdrop from that architecture**, not Community Edition product features. The product surface is the learning loop (scenarios, adversarial stakeholder, grading, debrief). Do not treat inherited screens as supported CE capabilities.

## Licence / contributing

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Contributions are under the same licence; see [CONTRIBUTING.md](CONTRIBUTING.md).

CI on `main` and PRs: Ruff, Bandit, ESLint, Vitest, `tsc`, frontend build, pip-audit, npm audit, gitleaks, commitlint.
