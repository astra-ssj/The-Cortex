# ADR 0001: Separate Cortex Platform and Astra GRC releases

Status: Accepted

## Context

Cortex Platform and Astra GRC Community Edition share a code lineage but serve
different jobs:

- Cortex Platform operates compliance workflows over organizational data.
- Astra GRC trains analysts and auditors through simulated decisions.

Keeping both products behind runtime feature flags would couple their releases,
leave unsupported operational surfaces in Community Edition, and risk exposing
Enterprise capabilities or data dependencies in an Astra build.

## Decision

Maintain three separately versioned repositories:

1. `cortex-platform` owns operational assessments, risks, evidence, policies,
   connectors, governed agent runs, artifacts, approvals, and reporting.
2. `astra-grc` owns scenarios, the Learning Loop, deterministic grading,
   competency, debriefs, and gap-driven retakes.
3. `grc-contracts` owns language-neutral schemas and static metadata shared by
   both products, with generated or validated Python and TypeScript packages.

The products may depend on pinned `grc-contracts` releases. They must not import
each other's source trees or require the other product at runtime.

## Current repository classification

This repository is the Astra GRC lineage.

### Astra

- `api/learning.py`
- `core/agents/`
- `core/competency.py`
- `core/gaps.py`
- `core/control_posture.py` where posture is derived only from training
- `frontend/src/pages/AuditSimulator.tsx`
- `frontend/src/pages/LearningLoop.tsx`
- `frontend/src/pages/CompetencyHistory.tsx`
- `frontend/src/pages/TeamCompetencyLedger.tsx`
- scenario and competency migrations `017`, `019` through `030`, `034`, `035`,
  and skill-practice migration `038`

### Cortex extraction candidates

- `api/assessments.py`
- `api/ingest.py`
- `core/assessment_engine.py`
- `core/assessment_llm.py`
- `core/ingestion/`
- cloud connector and operational persistence modules
- broad assessment, connector, and operational evidence UI that is not driven
  by the Astra learning loop

Extraction requires fresh Cortex-owned migrations. Astra migrations that
decommissioned inherited tables are not a supported Cortex schema.

### Shared-contract candidates

- framework identifiers and display metadata
- control-reference schema
- skill manifest, version, provenance, capability, learning-objective, and
  artifact-citation schemas
- cross-language fixtures used to verify Python/TypeScript parity

Shared contracts contain no database sessions, HTTP clients, product navigation,
mutable global state, or service orchestration.

### Retire from Astra

- static demo fixtures that do not derive from learner sessions
- feature-flagged operational screens with no Community Edition commitment
- raw instruction previews that expose bundled `SKILL.md` content

Removal is incremental so existing Community Edition learning flows remain
deployable throughout the split.

## Skill adaptation

A pinned, reviewed skill source may produce two independent artifacts:

- a Cortex workflow with typed inputs, outputs, capabilities, artifacts, and
  approvals;
- an Astra curriculum adaptation with learning objectives, scenario decisions,
  grading weights, and debrief provenance.

Neither adapter executes raw upstream Markdown. Upstream updates create new
candidate versions and never silently alter an active workflow or scenario.

## Consequences

- Each product has independent persistence, audit history, CI, deployment, and
  rollback.
- Contract evolution requires semantic versioning and compatibility tests.
- Shared code is deliberately smaller than the common code lineage.
- Astra learner performance is not Cortex control-effectiveness evidence. Any
  future credential import requires an explicit governed boundary.
