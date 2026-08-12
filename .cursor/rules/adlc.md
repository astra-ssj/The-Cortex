# ADLC rules — AI Development Lifecycle, Phase 1

Forward standards for how AI assets (prompts, eval rubrics, skill
harnesses, confidence scoring, ZTAIP thresholds) are created and changed.
These govern *how CORTEX builds AI features*, distinct from `sdlc.md`
(how code ships) and `zero-trust.md` (how agents access data).

## Prompts and eval rubrics are versioned code

- Prompts and eval rubrics MUST live in source control as reviewable code,
  not be edited through a hosted UI/console that bypasses PR review.
- Canonical location going forward: `src/ai/prompts/`. **Status note:**
  this repo's existing prompt modules currently live under `core/llm/`
  (e.g. `core/llm/mapping_prompt.py`, `core/llm/assessment_prompt.py`,
  `core/assessment_llm.py`) — predating this rule. That's a known gap
  between "forward standard" and current layout, not a claim that a
  migration already happened. Don't invent a `src/ai/prompts/` directory
  just to satisfy the letter of this rule; either add new prompt code
  consistently with the existing `core/llm/` convention, or do a
  deliberate, reviewed migration as its own PR (Phase 2 candidate) —
  never a silent one-off move mixed into an unrelated change.
- Any prompt or rubric change is a diff like any other: it goes through
  PR review, not a live edit against a running environment.

## Agent actions run inside skill harnesses with schema validation

- Every agent-invoked action (tool call, mutation, external API call)
  MUST be wrapped in a harness that validates inputs/outputs against an
  explicit schema (Pydantic on the backend, Zod on the frontend) before
  the result is trusted or acted on.
- LLM output MUST NOT be trusted as-is for control decisions — it is
  validated data, not code, and not an authorization decision. See
  `.cursorrules`: "No agent acts autonomously with confidence_score < 0.75
  — route to human review."
- Every LLM call MUST go through `core/circuit_breaker.py` — no naked
  provider SDK calls. This is enforced by code review and is a
  `.cursorrules` non-negotiable; there is no automated CI check that
  greps for bypasses yet (Phase 2 candidate: a lint rule or grep-based CI
  gate for direct `openai.`/`anthropic.` client construction outside
  `core/llm/`).

## AI asset changes require evaluation, not vibes

- A change to a prompt, rubric, or eval dataset MUST have an eval run
  attached to the PR (results pasted or linked — see PR template).
- A change to confidence scoring or the ZTAIP autonomy threshold
  (currently 0.75, per `.cursorrules`) is higher-stakes: it MUST include
  a calibration re-run and a **logged human sign-off** before merge, not
  just an approval click. Record the sign-off in the PR description
  (who, what evidence, what threshold was chosen and why).
- "Eval run attached" means enough to let a reviewer judge regression,
  not just "tests pass" — e.g. before/after accuracy on the eval set for
  prompt changes, or a before/after confusion matrix for threshold
  changes.

## Status

- The schema-validation and circuit-breaker requirements above are
  enforced by code review today, not by an automated CI gate. Treat them
  as MUST for new code; a dedicated static check is Phase 2 scope, not
  claimed as already existing.
