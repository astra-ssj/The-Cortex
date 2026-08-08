# CORTEX — repo structure refactor checklist

PR-sized phases to move from the current hybrid monorepo toward a maintainable layout.  
**Phase 0** is implemented in this change set (docs hygiene + one migration lane).

## Target shape

```text
apps/
  api/                 # single FastAPI entry (absorb compliance-engine)
  web/                 # frontend
  worker/              # shasta worker
packages/
  core/                # audit, CB, RBAC, LLM
  compliance/          # frameworks
  ontology/
infra/
  docker/              # compose, Dockerfile
  migrations/          # one ordered chain only
docs/                  # product docs + archive/ for dated audits
```

---

## Phase 0 — Docs + migrations ✅

- [x] Move root audit/QA/SAST reports → `docs/archive/`
- [x] Move `CORTEX_SETUP.md` → `docs/CORTEX_SETUP.md`
- [x] Collapse GraphJin SQL into `migrations/` with continuous `002`–`015` order
- [x] Align `docker-compose.yml`, `scripts/apply_cortex_schema.sh`, verify scripts
- [x] Include `011_operational_persistence.sql` in Compose init (was missing)
- [x] Include `015_relationship_graph.sql` in apply script (was missing)

---

## Phase 1 — Absorb compliance-engine ✅

Goal: one FastAPI process without `sys.path` hacks.

- [x] Move live routers into `api/` (ingest, connectors AWS/Azure/Shasta legacy, integrations, reports, skills)
- [x] Delete stub routers that duplicated root `api/`
- [x] Move connectors → `core/connectors/`, ingestion → `core/ingestion/`, skills loader → `core/skills_loader.py`
- [x] Remove `sys.path.insert` from `api/main.py` and `PYTHONPATH=.../compliance-engine` from Dockerfile / Compose / CI
- [x] Remove engine `FINDINGS_STORE` (canonical: `api/findings.py` until Phase 3 Postgres)
- [x] Update tests, scripts, docs; layout map in [`STRUCTURE.md`](STRUCTURE.md)

**Risk:** route order / OpenAPI path collisions — smoke `scripts/smoke_happy_path.sh` + ingest smoke after merge.

---

## Phase 2 — Rename / thin `services/`

- [ ] Move `services/assessment_*.py`, `posture_calculator.py`, `context_builder.py` → `core/` (or `packages/assessment/`)
- [ ] Keep GraphJin config under `services/graphjin/` or relocate to `infra/graphjin/`
- [ ] Keep GRC skills under a clear path (`packages/skills/` or `content/skills/`)
- [ ] Stop using `services/` as both a Python package and a sidecar folder

---

## Phase 3 — Persist findings (ZTAIP alignment)

- [ ] Replace in-memory `FINDINGS_STORE` with Postgres model (SovereignModel + migration)
- [ ] Wire remediation UI + graph + intelligence insights to DB
- [ ] Audit fabric before/after finding mutations (already partial — verify)

---

## Phase 4 — Optional apps/ packages/ layout

Only after Phases 1–3 stabilize imports:

- [ ] Introduce `apps/api`, `apps/web`, `apps/worker` (or keep flat `api/` + `frontend/` if team prefers)
- [ ] Introduce `packages/core`, `packages/compliance` if publishable boundaries are needed
- [ ] Move Compose/Dockerfile under `infra/` and fix build contexts

---

## Phase 5 — CI / quality gates

- [ ] Mypy (incremental) on `api/` + `core/` in CI
- [ ] Restore modest `pytest-cov` floor on critical modules
- [ ] Playwright happy path in CI (login → dashboard → review → logout)
- [ ] Keep pip-audit / npm audit blocking on high

---

## Rules while refactoring

1. One phase per PR when possible; keep `main` green.
2. Do not disable auth, CircuitBreaker, or audit_fabric for convenience.
3. Prefer move+adapt over rewrite; update smokes in the same PR.
4. Archive dated reports under `docs/archive/`; do not re-grow root markdown sprawl.
