# Astra GRC Architecture

Competence you can evidence.

Astra GRC Community Edition is a case-based GRC competency
training platform. This document covers the runtime architecture,
data model, and key design decisions.

## User journey

After authentication the SPA lands on **`/audit-simulator`**.
The learner picks a framework (ISO 27001:2022 or GDPR) and an
audit type, then **Run Assessment** opens the Learning Loop at
`/learning`. Direct `/learning` access still lists all active
scenarios. The old Intelligence demo at `/intelligence/simulator`
redirects to the Audit Simulator.

## Runtime Services

| Service | Port | Role |
|---------|------|------|
| FastAPI (`api`) | 8000 | REST API — auth, learning loop, scenarios, audit |
| PostgreSQL | 5432 (internal) | System of record |
| Vite frontend | 3000 | React SPA (proxies `/api` → FastAPI) |

Start locally:

```bash
docker compose up -d postgres
bash scripts/apply_cortex_schema.sh
uvicorn api.main:app --port 8000
cd frontend && npm run dev
```

## Model providers

Learning-loop calls go through `core/agents/model.py` →
`call_model()`, then `core/agents/harness.py` validates the
string as `AgentResponse` **before** anything is written to
`scenario_sessions.state`. Markdown fences are stripped once
(`_strip_markdown_fences`) on live providers so fenced JSON
does not fail schema validation.

| `MODEL_PROVIDER` | Result |
|------------------|--------|
| unset | Anthropic if `ANTHROPIC_API_KEY` is set, else stub |
| `anthropic` | Anthropic; missing key is a startup/config error (no silent stub) |
| `ollama` | `POST {OLLAMA_BASE_URL}/v1/chat/completions` (default `http://localhost:11434`), model `AGENT_MODEL` or `gemma4:12b`, 120s timeout |
| `stub` | Deterministic canned JSON (tests / no key) |

Every path is wrapped by the module-level circuit breaker
`learning_agent_model` (open after 5 consecutive failures).
Ollama connection refusal raises with `OLLAMA_BASE_URL` and
does not fall through to stub.

`MODEL_PROVIDER=ollama` and fence-sharing live on
`feat/ollama-provider` until that branch merges. On current
`main`, selection is still `AGENT_MODEL` + `ANTHROPIC_API_KEY`
→ Claude or stub, with fence-stripping on the Claude path only.

Authenticated operator snapshot (JWT required — not on public
`/api/v1/system/ztaip-status`):

`GET /api/v1/system/agent-status` → `{ provider, model, breaker_open }`
(shipped on `feat/ollama-provider`).

## Role model

Canonical roles are `admin`, `analyst`, and `viewer`.
`ciso` (and `administrator`) normalise to `admin` on both
the server (`core/canonical_roles.py`) and the SPA
(`frontend/src/lib/roles.ts`). `tests/test_role_mapping_parity.py`
fails the build if those maps diverge.

## Core Principles

**Auth first**: Every endpoint requires JWT. Row-level security
enforces tenant isolation at the database layer via
`cortex_current_org()`. A missing or other-tenant row returns
403, not 404 — no information leakage.

**Audit fabric**: Every consequential write is bracketed by
`append_audit_log` before and after. The audit log is
append-only — enforced by a Postgres trigger. It cannot be
modified or deleted by `cortex_app`.

**Harness-validated state**: Agent output never touches
`scenario_sessions.state` directly. All model output is
validated through `core/agents/harness.py` against
`AgentResponse` schema before persistence. Malformed model
output triggers a safe fallback — it never enters state.

**Content over code**: Scenarios, stages, and graded reference
answers are database rows, not hardcoded logic. Adding a
scenario requires only a seed migration. The harness fallback
(`CORTEX_SCENARIO_HARDCODED=1`) allows harness tests to run
without a database.

## Data Model

### Learning loop tables

```
scenario_sessions — one row per learner session
id uuid PK
org_id uuid — tenant scope (RLS enforced)
scenario text — scenario slug
learner_id uuid
state jsonb — messages, choices, decisions, brief
stage text — current stage slug
risk text — current risk level
competency jsonb — four-dimension scores (DEFAULT '{}')
created_at / updated_at

scenarios — shared content, no RLS
id uuid PK
slug text UNIQUE
title / brief / track / frameworks / difficulty / active

scenario_stages — one row per stage per scenario
id uuid PK
scenario_id uuid FK
slug / sequence / agent_message / demands

scenario_choices — graded reference answers
id uuid PK
stage_id uuid FK
choice_id / label / consequence
is_correct boolean — reference answer flag
framework_rationale text — cited control and rationale
display_order int
```

### Session state shape (JSONB)

```json
{
  "brief": "...",
  "messages": [
    { "speaker": "...", "stance": "...", "message": "...", "demands": [] }
  ],
  "choices": [
    { "id": "least_privilege", "label": "Grant least privilege only" }
  ],
  "decisions": [
    {
      "choice": "least_privilege",
      "at": "2026-08-13T...",
      "graded": {
        "correct": true,
        "rationale": "...",
        "observations": ["..."]
      }
    }
  ],
  "last_harness": { "speaker": "...", "stance": "...", "message": "...", "demands": [] },
  "scenario_id": "cloud_access_onboarding"
}
```

### Competency shape (JSONB)

```json
{
  "control_mapping":  { "score": 65, "delta": 15, "observations": ["..."] },
  "evidence":         { "score": 60, "delta": 10, "observations": ["..."] },
  "escalation":       { "score": 60, "delta": 10, "observations": ["..."] },
  "remediation":      { "score": 50, "delta": 0,  "observations": [] }
}
```

## Learning Loop Flow

```
POST /api/v1/learning/sessions
→ load_scenario() from DB
→ seed scenario_sessions row
→ call_agent() via harness
→ persist opening state
→ audit_log(.start)
→ return SessionOut

POST /api/v1/learning/sessions/{id}/decide
→ validate choice against stage
→ advance_after_decision()
→ grade_decision() — four-dimension scoring
→ persist state + competency in single UPDATE
→ audit_log(.complete)
→ return SessionOut (includes competency)
```

## Grading Engine

`core/agents/grading.py` — pure function, no DB access.

```
grade_decision(
  choice_id, stage, scenario_choices,
  current_competency, decisions_so_far
) → GradingResult
```

Scoring rules per dimension:

| Dimension | Trigger | Delta |
|-----------|---------|-------|
| control_mapping | correct at access_request | +15 |
| control_mapping | wrong at access_request | -10 |
| control_mapping | correct at escalation | +10 |
| control_mapping | wrong at escalation | -8 |
| escalation | challenge choice | +20 |
| escalation | least_privilege | +10 |
| escalation | approve_all | -15 |
| escalation | deny | 0 |
| evidence | correct decision | +10 |
| evidence | wrong + prior wrong (decisions[:-1]) | -5 |
| remediation | correct at escalation stage | +15 |
| remediation | wrong at escalation stage | -10 |
| remediation | access_request stage | 0 |

All scores clamp 0–100. All dimensions start at 50.

## Migration Lane

Single ordered lane: `init.sql` → `002` → ... → `024`.
Applied by `scripts/apply_cortex_schema.sh` and mounted in
`docker-compose.yml` under `/docker-entrypoint-initdb.d/`.

Key migrations:

- `016` — RLS policies and append-only audit trigger
- `017` — scenario_sessions (learning loop)
- `018` — drops decommissioned compliance-platform tables
- `019` — scenarios, scenario_stages, scenario_choices
- `020` — competency column on scenario_sessions
- `021–024` — scenario seeds CX-1001 through CX-1005

## Security Baseline

- JWT HS256 via PyJWT with an explicit algorithm allowlist
- RLS enforced at Postgres level — `cortex_app` role only
- CORS: explicit origins, no wildcard with credentials
- Rate limiting: SlowAPI on session create and decide endpoints
- Audit log: append-only trigger, no UPDATE/DELETE by cortex_app
- OWASP Top 10 and OWASP LLM Top 10 reviewed at v2.1
- Dependency audit: pip-audit with no advisory suppressions

## Repository Layout

```
api/                    REST routers (auth, learning, scenarios, system)
core/
  agents/               Harness, model, scenario, grading
  audit_fabric.py       Append-only audit log writer
  security.py           JWT, bcrypt
  tenant.py             Org scoping, RLS binding
compliance/             Framework registry and posture primitives
migrations/             Single ordered lane 002–024
scripts/                apply_cortex_schema.sh, smoke_happy_path.sh
frontend/
  src/
    pages/              LearningLoop.tsx, Login.tsx, ...
    api/                learning.ts, client.ts
    components/         HelpPanel.tsx, Sidebar.tsx, ...
    lib/                helpDocsContent.ts
docs/                   Architecture and setup docs
```
