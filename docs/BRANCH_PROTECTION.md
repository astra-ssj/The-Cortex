# Branch protection — `main`

The most common failure mode in this repo's history has been large, unreviewed
changes self-merged into `main` before CI completed (e.g. PR #37: 96 files /
+5,833 lines, no review, merged ~83s before the failing pytest check finished).
Before the public open-source release, `main` must be protected so that change
is gated on review and green CI.

This is a repository **Settings** action (admin only) — it cannot be set from
application code or the files in this repo. Apply it once via the GitHub UI or
the REST API below.

## Required settings (Settings → Branches → Add rule, pattern `main`)

- **Require a pull request before merging**
  - Require approvals: **1**
  - Require review from **Code Owners** (uses `.github/CODEOWNERS`)
  - Dismiss stale approvals on new commits
- **Require status checks to pass before merging** → **Require branches to be up to date**, and select:
  - `Backend — Pytest (Postgres)`
  - `Backend — Lint + SAST`
  - `Frontend — Build + Lint`
  - `Backend — HTTP smoke (happy path)`
  - `Security — Dependency Audit`
  - `SAST — Bandit + Safety`
- **Require conversation resolution before merging**
- **Do not allow bypassing the above** (uncheck "Allow administrators to bypass"),
  except deliberately and rarely.
- **Restrict force pushes and deletions** on `main`.

## Equivalent REST call (run as a repo admin with a token that has `repo` scope)

```bash
gh api -X PUT repos/AstraLabs-AI/The-Cortex/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[checks][][context]=Backend — Pytest (Postgres)' \
  -f 'required_status_checks[checks][][context]=Backend — Lint + SAST' \
  -f 'required_status_checks[checks][][context]=Frontend — Build + Lint' \
  -f 'required_status_checks[checks][][context]=Backend — HTTP smoke (happy path)' \
  -f 'required_status_checks[checks][][context]=Security — Dependency Audit' \
  -f 'required_status_checks[checks][][context]=SAST — Bandit + Safety' \
  -F 'enforce_admins=true' \
  -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'required_pull_request_reviews[require_code_owner_reviews]=true' \
  -F 'required_pull_request_reviews[dismiss_stale_reviews]=true' \
  -F 'required_conversation_resolution=true' \
  -F 'restrictions=null' \
  -F 'allow_force_pushes=false' \
  -F 'allow_deletions=false'
```

## Single-maintainer caveat

"Require 1 approval from Code Owners" cannot be satisfied by the PR author. With
only one maintainer (`@SristiNative` in `.github/CODEOWNERS`), the maintainer's
own PRs cannot be merged under this rule. Resolve by adding at least one second
maintainer to the org/CODEOWNERS before enabling enforcement, which is the
correct posture for an open-source project accepting external contributions.
