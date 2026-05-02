# CORTEX — Product workflow audit & fixture phases

End-to-end flows from **login → authenticated navigation → logout**, covering **nine primary nav areas** (Roadmap intentionally excluded per request). This document lists **gaps** and **improvements**, then maps them into **fixture phases** (product + engineering hardening).

---

## 1. Auth spine (pre-dashboard)

| Step | What happens | Backend / client touchpoints |
|------|----------------|------------------------------|
| **Register** | Company + user form → JWT + org | `POST /api/v1/auth/register` (and related); writes `cortex_token`, `cortex_user`, `cortex_company`, `cortex_jurisdiction`, `cortex_demo_mode`, onboarding blob |
| **Login** | OAuth2-style form → JWT | `POST /api/v1/auth/token`; merges user/org/onboarding into `localStorage` |
| **Onboarding gate** | If `onboarding_complete === false`, redirect to `/onboarding` | Reads/writes `cortex_onboarding` only on client; completion may lag server truth |
| **Auth gate** | No token → `/login` | `getToken()` only |
| **401 handling** | Token cleared, event fired | `fetchApi` removes token + `cortex_user`, dispatches `cortex:auth-expired`; header user may desync until navigation |

### Gaps (auth)

1. **Logout is incomplete** — `onLogout` clears `cortex_token`, `cortex_user`, `cortex_org_id`, `cortex_demo_mode`, `cortex_jurisdiction` but **not** `cortex_onboarding`, **`cortex_company`**, or other keys. Next login can inherit **stale onboarding or registration context**.
2. **Two Login implementations** — `pages/Login.tsx` vs `components/Login.tsx` risk **drift** (e.g. `setStoredOrgId` usage).
3. **Login UX** — No `<form onSubmit>`; Enter key and some assistive patterns are weaker than a native form.
4. **Session visibility** — No explicit “session expires at …” or idle warning (enterprise expectation).
5. **Org context vs JWT** — `useOrgContext()` derives **effective** org from demo toggle + stored org; server always scopes by JWT `org_id`. Edge cases if localStorage and token disagree (should be rare but undocumented).

### Improvements (auth)

- Single logout helper: clear **all** `cortex_*` keys (or whitelist known keys + document).
- Consolidate login page to **one** component.
- Wrap credentials in `<form onSubmit>` + `aria-live` on errors.
- Optional: short-lived token refresh or visible expiry from JWT payload.

---

## 2. Global chrome (all nine tabs)

| Capability | Behaviour |
|------------|-----------|
| **Run Assessment** | Calls `startStream(orgId, ALL_FRAMEWORK_IDS.split(",")))`, navigates to `/dashboard`; SSE via `buildStreamUrl` (token often passed as **query param** — exposure in logs/history). |
| **Demo toggle** | Hidden when tenant is demo org only; flips demo vs “live” view for **client-selected** org scope. |
| **Keyboard shortcuts** | `d`, `g`, `i`, `a`, `r`, `h` (help); no visible cheatsheet except Help panel. |
| **Help** | Overlay (`HelpPanel`). |

### Gaps (chrome)

1. **SSE URL token** — Passing JWT in query string is convenient but **weaker for secrecy** (proxy logs, Referer). Prefer **Authorization** header if EventSource limitations addressed (polyfill / fetch stream).
2. **Nav active state** — `/frameworks/gdpr-…` may not highlight **Frameworks** as active (pathname exact match).
3. **Responsive nav** — Ten items + pipes + CTA: likely awkward on **narrow viewports** (no collapse/menu).

### Improvements (chrome)

- Document shortcut keys in header or first-run tooltip.
- Parent-route highlighting for nested paths (`/frameworks/:id`).
- Collapsible nav or grouped sections for enterprise density.

---

## 3. Tab-by-tab workflows (excluding Roadmap)

### 3.1 Dashboard (`/dashboard`) — `ComplianceDashboard`

**Flow:** Load frameworks list + organisation posture + ZTAIP status (TanStack Query / store); optional SSE panel when assessment runs; framework cards link to detail.

**Gaps**

- Same component backs **`/frameworks`** — OK, but **route naming** confuses “dashboard vs frameworks list”.
- Heavy **inline token duplication** vs Tailwind/CSS variables (maintenance).

**Improvements**

- Consider distinct copy/layout for `/dashboard` (KPI hero) vs `/frameworks` (catalog-first).
- Centralise design tokens (fixture phase).

---

### 3.2 Group (`/group`) — `GroupDashboard`

**Flow:** `GET /api/v1/groups/posture?org_id=…` scoped by `useOrgContext().orgId`.

**Gaps**

- Large inline **token object** duplicated from Dashboard pattern.
- Empty/error states depend on API shape; verify **non-demo org** always returns sensible payloads.

**Improvements**

- Shared layout primitives + skeleton contracts across Dashboard / Group.

---

### 3.3 Frameworks (`/frameworks`, `/frameworks/:id`)

**Flow:** List: same as dashboard catalog. Detail: `useFramework(id)` → `fetchFramework`; controls list via paginated API.

**Gaps**

1. **Visual inconsistency** — `FrameworkDetailPage` uses **light** Tailwind (slate/white) inside a **dark** app shell — breaks enterprise polish and accessibility consistency.
2. **Broken back link** — “Back” links point to **`/`** (root → dashboard), not **`/frameworks`**.
3. **HumanReview-style framework filters** vs API framework ids — naming alignment already partly mapped elsewhere; detail page is id-driven (good).

**Improvements**

- Restyle framework detail to **dark shell tokens** (or intentional printable mode only).
- Fix `Link to="/frameworks"` for back navigation.

---

### 3.4 Intelligence (`/intelligence`)

**Flow:** Local tabs: **Simulator** · **Signals** · **Regulation** · **Vault** (`AuditSimulator`, `TelemetryFusion`, `RegulationIntel`, `EvidenceVault`). Mixed **demo/simulation** and API-backed content depending on sub-component.

**Gaps**

- **Four products in one** — inconsistent data sources (mock vs live); hard for users to know what is **production evidence** vs **illustration**.
- Heavy animations; ensure **reduced-motion** and CPU impact are acceptable on low-end laptops.

**Improvements**

- Badge each sub-tab: **Demo** | **Live data** | **Beta**.
- Shared empty/error pattern with Review / Remediation.

---

### 3.5 AI Systems (`/ai-systems`)

**Flow:** Mostly **static in-memory inventory** (`SYSTEMS` array), countdown to EU AI Act date; minimal or no persistence/API for CRUD.

**Gaps**

- **Not a governed register** yet — no backend linkage to assessments/review/evidence for Annex III classification lifecycle.
- Roadmap epics still list commercial items as “not started” while UI exists — **documentation drift**.

**Improvements**

- Persist inventory via API + tie to `org_id` and audit events (ZTAIP alignment).
- Align internal roadmap JSON with actual shipped UI.

---

### 3.6 Review Queue (`/review-queue`) — `HumanReview`

**Flow:** `GET review-queue` (optional `org_id` query); filter/sort client-side; `POST …/approve` and `…/override` with notes/justification; refetch after action.

**Gaps**

- **Resolved items UX** — When queue drains after approve, **smoke/tests assume ≥1 item**; fresh DB might need seed path (server already seeds demo pending when tables exist).
- **Actor identity** — Approve acts as generic “CISO” in API in places; not always the **logged-in user** display name (audit accountability).

**Improvements**

- Surface **reviewer identity** from JWT on API + UI.
- Explicit empty state when **zero** pending (productised, not error).

---

### 3.7 Remediation (`/evidence`) — `RemediationTracker`

**Flow:** `fetchFindings` + `updateFinding` (Kanban); filters by severity/framework/entity; org context for display.

**Gaps**

- Framework labels duplicated as **string lists** vs ids (same pattern as Review — drift risk).
- Drag-drop status updates must stay **idempotent** if network flaky (verify optimistic UI rollback).

**Improvements**

- Single shared **framework catalogue** constant (ids + display names) imported everywhere.

---

### 3.8 Audit Report (`/audit-report`) — `AuditReport`

**Flow:** User picks report type, scope, date → `fetchExecutiveSummary` / executive summary path; print-friendly CSS.

**Gaps**

- Multiple report **labels** in UI may not all map to **distinct backend implementations** (verify 404 or duplicate payloads).
- Export beyond **print** (PDF API, downloadable artefact) may be incomplete.

**Improvements**

- Disable or clearly mark **“coming soon”** report types without backends.
- Optional server-side PDF for auditor-grade exports.

---

### 3.9 Integrations (`/integrations`)

**Flow:** `integrationsApi.list`, `get`, `test`; credential panels per integration.

**Gaps**

- **Secrets in browser** — Any credential capture must be **handled policy-compliant** (never log; CSRF; rate limit). Confirm backend alignment.
- **coming_soon** integrations — UX clarity vs clickable dead ends.

**Improvements**

- Clear status badges and disable actions for **coming_soon**.
- Link each integration to **docs/runbook**.

---

## 4. Cross-cutting workflow gaps

| Area | Issue |
|------|--------|
| **TanStack Query** | Cache invalidation after approve/remediation/stream complete may be **incomplete** — stale posture until manual refresh. |
| **Org scope** | Demo toggle changes **effective** org without changing JWT — correct for demo storytelling; **dangerous if misunderstood** as “switch tenant” without re-auth. |
| **Deep links** | Opening `/review-queue` cold works if token valid; **no breadcrumb** or tenant banner (“Acting as org X”). |
| **E2E** | No Playwright/Cypress covering **multi-tab** journeys; smoke script covers API only. |

---

## 5. Fixture phases (ordered)

Phases bundle **workflow fixes** with earlier **B→A engineering** items. Execute in order; each phase should leave CI green.

### Phase F1 — Session & navigation correctness

- Unified **logout** clearing all session-related localStorage keys.
- Single **Login** implementation path.
- Framework detail: **back link** + **dark theme alignment** (or scoped light mode with explicit toggle).
- Nav **active state** for `/frameworks/:id`.

### Phase F2 — Trust & clarity UX

- Header: **organisation id / name** (from JWT user payload) + optional **environment** badge (dev/staging).
- Intelligence / AI Systems: **Demo vs Live** labelling.
- Review Queue: **reviewer** attribution end-to-end.

### Phase F3 — Data model consistency (frontend)

- Shared **framework registry** module (id ↔ label) for Review + Remediation + filters.
- TanStack Query **invalidation** after assessment complete, approve/override, finding update.

### Phase F4 — Engineering “A” tier (from prior audit)

- **Mypy** (or Pyright) on `api/` + `core/` in CI (incremental strictness).
- **pytest-cov** with modest thresholds on critical modules (raise over time).
- **ESLint**: reduce or justify **security plugin warnings** (policy: warn vs error).
- **Design tokens**: one source → Tailwind + CSS variables + components.

### Phase F5 — Security hardening (product)

- SSE: move off **token-in-query** where feasible.
- Integrations: security review of credential flow + CSP headers if missing.

### Phase F6 — Test fixtures & E2E

- Frontend: Vitest **RTL** tests for Login form submit + Review queue empty state.
- Optional: **Playwright** happy path: login → dashboard → review queue → logout.

---

## 6. Summary

| Dimension | Current state |
|-----------|----------------|
| **Coverage of nine tabs** | All reachable post-login; **AI Systems** and parts of **Intelligence** skew **demo/static**. |
| **Strongest flows** | Login → Dashboard/Frameworks → Review → Remediation (API-backed). |
| **Weakest flows** | Logout cleanliness, framework detail UX/theming, SSE token handling, AI inventory persistence. |
| **Fixture roadmap** | F1–F6 above — start with **F1** for immediate user-visible correctness. |

---

*Maintainers: update this file when nav routes or primary workflows change.*
