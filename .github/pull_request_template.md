## What & why

<!-- Describe the user-visible behaviour change and the reason for it. Link related issues. -->

## Changes

<!-- Bullet the notable changes. Call out API contract, schema/migration, or auth changes explicitly. -->

## How tested

<!-- Commands run locally: pytest, npm run build/test, smoke scripts, manual steps. -->

---

## Reviewer checklist (ZTAIP non-negotiables)

Reviewer confirms before approving:

- [ ] **Tenant isolation** — every new DB query is scoped by `org_id` from the authenticated principal (`resolve_scoped_org_id`); no cross-tenant read or write path was added.
- [ ] **AuthZ** — new mutating/admin endpoints are gated by an explicit `Permission` (`core/rbac.py`); nothing relies on the frontend alone.
- [ ] **LLM safety** — no LLM call bypasses the circuit breaker; untrusted document/user text is not concatenated into prompts without delimiting; LLM output is not trusted for access-control or human-review routing decisions.
- [ ] **Secrets** — no credentials, tokens, default passwords, or signing keys added to code, compose, migrations, or `.env.example` (placeholders must be obviously invalid).
- [ ] **Audit** — consequential mutations write an audit record atomically with the change.
- [ ] **Migrations** — schema changes ship as a migration; `db/session.py` `ensure_*` mirrors are updated if applicable.
- [ ] **Docs match reality** — README/SECURITY.md claims touched by this PR are still accurate.
- [ ] **Scope** — this PR is focused enough to review (large multi-feature drops should be split).

> A second person must approve. Authors do not self-approve or merge before required checks pass.
