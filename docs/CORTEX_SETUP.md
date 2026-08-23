# Astra GRC — Cursor Setup & Development Guide

One-time Cursor configuration and daily development workflow
for the Astra GRC learning platform.

## Checklist Before Your First Session

| Item | Status | Where |
|------|--------|-------|
| Privacy Mode | ✅ ON | Cursor Settings |
| `.cursor/rules/` | ✅ | Repo root |
| `.cursorignore` | ✅ | Repo root |
| Default model | ✅ claude-sonnet-4-6 | Cursor Settings → Models |
| Agent Auto Run | ⬜ OFF | Cursor Settings → Features → Agent |

**Agent Auto Run OFF**: Every terminal command is proposed
before execution. Human-in-the-loop by default.

## Environment Setup

```bash
# Clone
git clone https://github.com/astra-ssj/The-Cortex
cd The-Cortex

# Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -e "."

# Database
docker compose up -d postgres
bash scripts/apply_cortex_schema.sh

# Verify schema
docker exec -it the-cortex-1-postgres-1 \
  psql -U cortex -d cortex -c "\dt"
# Should show 26 tables through migration 024
```

## Running the Stack

**Terminal 1 — API:**
```bash
source .venv/bin/activate
export PYTHONPATH=.
# Host-run API against CI-style Postgres (port 5432). Local Docker
# Compose in this repo does not publish Postgres; if your engine
# maps it (this machine: 5434, user `cortex` / `cortex_ci_test`),
# point DATABASE_URL at that socket instead. See AGENTS.md.
export DATABASE_URL="postgresql+asyncpg://cortex_app:cortex_ci_test@127.0.0.1:5432/cortex"
export JWT_SECRET="dev-secret-key-minimum-32-characters-long-xx"
export CORTEX_LEGACY_DEMO_PASSWORD="admin"
# Learning-loop agent — see README "Quickstart"
# export MODEL_PROVIDER=anthropic   # requires ANTHROPIC_API_KEY
# export MODEL_PROVIDER=ollama      # requires ollama serve; AGENT_MODEL default gemma4:12b
export COMPLIANCE_ENGINE_STUB_PASSWORD="dev-stub"
export COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN="dev-stub-token"
uvicorn api.main:app --port 8000
```

Do NOT use `--reload` when running the test suite —
`--reload` holds advisory locks on the audit chain and
causes pytest to hang.

**Terminal 2 — Frontend:**
```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. Log in with the seeded demo account
`admin@astralabs.com` / `admin` (username `admin` is the same account).

## Running Tests

```bash
# Full suite (API must not be running with --reload)
pytest --tb=short -q

# Learning loop only
pytest tests/test_learning_loop.py tests/test_grading.py \
       tests/test_learning_harness.py -v

# Frontend
cd frontend && npm run typecheck && npm run build
```

All commits follow Phase 1+2 governance rules in `.cursor/rules/`.
There is no `sadlc.md`. Security / agent-access rules live in
`.cursor/rules/zero-trust.md`; how code ships is `.cursor/rules/sdlc.md`.
How AI assets are changed is `.cursor/rules/adlc.md`.
commitlint enforces a bracketed story ID in every commit subject:

```
feat(learning): add grading engine [CORTEX-LEARN-8]
```

Story ID series:

- `CORTEX-LEARN-*` — learning platform features
- `CORTEX-SEC-*` — security fixes
- `CORTEX-PIVOT-*` — compliance platform removal

## Branch Strategy

Trunk-based. Short-lived feature branches off main.
One agent worktree per branch. PRs required — no direct
pushes to main.

```bash
git checkout main && git pull origin main
git checkout -b feat/your-feature
# ... build ...
git push origin feat/your-feature
# Open PR → merge → tag if milestone
```

## Release Tags

Tag every milestone on main:

```bash
git tag v2.x-description
git push origin v2.x-description
```

See README.md for the full tag history.

## Cursor Agent Workflow

Every multi-file change goes through a Cursor Agent prompt.
Structure every prompt with:

```
═══════════════════════════════════════════
AGENT: NAME
PURPOSE: What this agent does
BRANCH: feat/branch-name
RULES: .cursor/rules/ (Phase 1+2)
INVARIANTS: what must not change
═══════════════════════════════════════════
GIT SETUP

git checkout main && git pull origin main
git checkout -b feat/branch-name

... work ...
VERIFY

npm run typecheck && npm run build
pytest --tb=short -q

COMMIT

git add <specific files>
git commit -m "type(scope): description [STORY-ID]"
git push origin feat/branch-name

FINAL REPORT

Always paste discovery output here before confirming
destructive or architectural steps.
```

## Adding a Scenario

Scenarios are database content, not code. To add a scenario:

1. Create `migrations/0NN_scenario_CXNNNN_seed.sql`
   following the pattern in `021_scenario_cx1002_seed.sql`
2. Register in `scripts/apply_cortex_schema.sh`
3. Mount in `docker-compose.yml`
4. Apply: `docker exec -i the-cortex-1-postgres-1 psql
   -U cortex -d cortex -f /path/to/migration.sql`
5. Verify: DB query confirms scenario/stage/choice counts
6. Commit and PR

No application code changes required for new scenarios.

## GraphJin (Optional)

GraphJin provides a GraphQL read layer on port 8080.
Health check may time out on first startup — this is a
one-off pool warmup issue, not a failure.

Blocked tables (by design): `users`, `audit_log`.
Allowed tables: `organizations`, `frameworks`, `controls`,
`findings`, `assessment_results`, `entities`.

Dev auth is bound to `127.0.0.1:8080` only — never
reachable off-host.

## Security Notes

- Connect as `cortex_app`, not `cortex` — RLS only binds
  for `cortex_app`
- `cortex_app` password: `cortex_ci_test` (local dev)
- Audit log is append-only — no UPDATE or DELETE
- Do not run `--reload` with pytest (advisory lock conflict)
- PYSEC-2026-1325 suppressed in pip-audit — see
  `.github/workflows/ci.yml` for documented justification
