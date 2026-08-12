# Zero-trust rules — CORTEX Governance Playbook, Phase 1

## Control Status

This table is the honesty check for this rule set. Rules below are written
as forward standards (MUST) for all *new* code. That is not the same claim
as "this control is enforced product-wide today." Don't let one imply the
other in docs, PRs, or customer-facing claims.

| Control | Status |
|---|---|
| RLS tenant isolation (DB-enforced, Postgres row-level security policies) | LIVE |
| Tenant scoping (app-layer `org_id` filter on every query) | LIVE |
| Append-only `audit_log` (DB-enforced — no `UPDATE`/`DELETE` grants or trigger) | LIVE |
| Audit writes on consequential actions (app-layer, `core/audit_fabric.py`) | LIVE |
| Conventional commits | LIVE *(as of this change — enforced by `commitlint` CI, see `sdlc.md`)* |
| Branch protection on `main` (require PR + 1 approval + passing checks) | **PENDING — manual GitHub Settings step, not yet applied** (see `sdlc.md` § Status) |
| Secret scanning gate (gitleaks in CI) | LIVE *(as of this change)* |

Read this table before writing anything that says "CORTEX enforces
row-level tenant isolation" or "audit logs are immutable." Phase 2 is
**LIVE**: migration `016` enables FORCE RLS + `tenant_isolation` policies
(session GUC `app.current_org`), and `audit_log` is hash-chained with
UPDATE/DELETE blocked by grants on `cortex_app` plus a statement-level
trigger. App-layer `org_id` scoping and `audit_fabric.append_audit_log(...)`
in the same transaction remain required as defense in depth.

## Rules for new code (MUST)

- **New DB access MUST be tenant-scoped.** Every new query against a
  tenant-owned table MUST filter by `org_id` resolved from the
  authenticated principal (`resolve_scoped_org_id` or equivalent) — never
  from a client-supplied parameter. This is the current *live* control
  (app-layer). Once RLS policies land (Phase 2), this remains required in
  application code as defense in depth — RLS is a backstop, not a
  replacement for correct queries.
- **State-changing, sensitive-data, or webhook-handling actions MUST
  write an audit entry**, via `core/audit_fabric.py`, committed atomically
  with the change (same transaction/session) — not best-effort, not
  fire-and-forget after the response is sent.
- **Agents operate least-privilege.** An agent or service account should
  hold only the scopes/permissions its task needs, for as long as the
  task needs them. Don't widen a role or add a permission "just in case."
  New mutating/admin endpoints are gated by an explicit `Permission`
  (`core/rbac.py`) — never by the frontend hiding a button.
- **No agent acts autonomously below the confidence threshold**
  (`confidence_score < 0.75`, per `.cursorrules`) — route to human
  review instead. Changing that threshold is an ADLC-governed change
  (see `.cursor/rules/adlc.md`) requiring calibration + logged sign-off,
  not a one-line PR.

## What to never do

- Never write a cross-tenant query "temporarily for debugging" and ship it.
- Never skip the audit write because the surrounding code has an early
  return or an exception path — the failure path needs an audit entry
  (or an explicit, reviewed decision not to write one) as much as the
  happy path does.
- Never describe a Phase 2 target as already enforced in README/SECURITY.md
  or in a PR description. If you're not sure whether a control is LIVE or
  TARGET, check this table first, then ask — don't guess in the direction
  that sounds better.
