# CORTEX — Quality gates and branch protection

For the standard git workflow (branch from main, add specific files, PR, CI green), see [AGENT_WORKFLOW.md](./AGENT_WORKFLOW.md).

## CI workflow (`.github/workflows/ci.yml`)

| Job              | Purpose |
|------------------|--------|
| **python-test**  | Pytest with coverage (≥57%); env: `DATABASE_URL`, `OPENAI_API_KEY` (mock in CI). |
| **python-sast**  | Bandit on `services/compliance-engine/app/`, `api/`, `core/`, `compliance/`; pip-audit on deps. |
| **typescript-build** | `frontend`: `npm ci` and `npm run build`. |
| **branch-cleanup**   | On `main` only: delete remote branches already merged into `main` (optional). |

Branch protection should require **python-test**, **python-sast**, and **typescript-build** to pass before merging to `main`.

---

## Branch protection (run locally with `gh`)

```bash
gh api repos/OWNER/The-Cortex/branches/main/protection \
  --method PUT \
  -f required_status_checks='{"strict":true,"contexts":["python-test","python-sast","typescript-build"]}' \
  -f enforce_admins=false \
  -f required_pull_request_reviews='{"required_approving_review_count":1}' \
  -f restrictions=null
```

Replace `OWNER` with your org/user (e.g. `SristiNative`). This enforces:

- No merge to `main` unless CI passes.
- PR required (no direct push to `main`).

---

## Clean up merged/rogue branches (run locally)

```bash
# Delete specific remote branches
git push origin --delete lazy-imports
git push origin --delete compliance-api-505e1
```

The **branch-cleanup** job in CI can also delete merged branches automatically when pushing to `main`.

---

## Pre-commit (local)

```bash
pip install pre-commit
pre-commit install
```

Hooks: **ruff** (check + fix), **ruff-format**, **mypy**, **bandit**, **detect-private-key**, **check-added-large-files**, **no-commit-to-branch** (main).

Config: `.pre-commit-config.yaml` in repo root.

---

## Verification checklist

1. **Pre-commit**: Make a small change and `git commit` — hooks should run (ruff, mypy, bandit, etc.).
2. **CI on push**: Push to a feature branch and confirm all jobs (python-test, python-sast, typescript-build) are green.
3. **Branch protection**: Try to push directly to `main` — should be rejected if protection is enabled; use a PR instead.
