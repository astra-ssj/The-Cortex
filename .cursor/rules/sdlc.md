# SDLC rules — CORTEX Governance Playbook, Phase 1

These are forward coding standards for all new work in this repo. They apply
to code Cursor writes and to code humans write. "MUST" is enforced by CI
and/or branch protection where noted; where enforcement isn't wired up yet,
that's called out explicitly rather than implied.

## Commits

- Commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): summary`, where `type` is one of
  `feat | fix | chore | refactor | docs | test | style | perf | build | ci | revert`.
- Commits tied to a tracked story MUST include the story ID in brackets,
  e.g. `feat(assessments): add SSE resume [CORTEX-104]`. Put it at the end
  of the subject line or in a footer line, not buried mid-sentence.
- Machine-enforced: see `commitlint.config.mjs` and
  `.github/workflows/commitlint.yml`. Automated dependency-bump commits
  (`chore(deps): ...` from Dependabot) are exempt from the story-ID
  requirement since they aren't tied to a story.
- Merge commits are exempt (commitlint's default merge-commit detection).

## Branching

- No direct commits to `main`. All work lands via a feature branch and a
  pull request — including chores, docs, and dependency bumps.
- Branch names should be descriptive and prefixed by type where practical
  (e.g. `feat/...`, `fix/...`, `chore/...`).
- Rebase or merge `main` into your branch before requesting review if it's
  gone stale enough that CI results are no longer trustworthy.

## Pull requests

Every PR MUST have, before merge:

- **1 approval** from a reviewer who is not the author (see `CODEOWNERS`
  for path-based required reviewers).
- **All required status checks passing** — not "passing except for the one
  I'll fix later." Checks that block merge:
  - `ruff` / lint (backend)
  - frontend `tsc --noEmit` + `npm run build`
  - `pytest` (backend test suite)
  - `pip-audit` (dependency CVE gate)
  - secret scan (`gitleaks`)
  - `commitlint` (commit message format)
- Use the PR template (`.github/pull_request_template.md`) — don't delete
  the checklist, answer it.
- Keep PRs scoped to one logical change. Large multi-feature drops should
  be split so they can actually be reviewed.

## Status

- Branch protection on `main` (require PR + 1 approval + passing checks,
  no direct pushes) is a **manual GitHub Settings step**, not something a
  CI file can enforce on its own. Until that setting is turned on, the
  rules above are the honor-system standard, not a hard technical gate.
  See `.cursor/rules/zero-trust.md` for the control-status table.
