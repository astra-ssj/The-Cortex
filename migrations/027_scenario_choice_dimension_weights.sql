-- CORTEX 027 — Per-dimension competency weights on scenario_choices.
-- Idempotent. Apply after 026.
--
-- Competency scoring used to live in core/agents/grading.py as CX-1001-only
-- literals: control_mapping and remediation only moved when the stage slug was
-- 'access_request' or 'escalation', and escalation was keyed to the choice ids
-- approve_all / least_privilege / challenge. CX-1002 through CX-1005 use
-- different stage slugs and choice ids, so three of the four dimensions scored
-- exactly zero for four of the five scenarios — a learner could finish the
-- expert track with three bars frozen at the starting 50.
--
-- This column moves the scoring model onto the content row the loader already
-- reads, so a new scenario ships its own competency signal with its seed. The
-- application role stays SELECT-only on scenario_choices (019): authors ship
-- weights via migration, not through the API. No RLS change — shared curriculum.
--
-- Semantics consumed by core.agents.grading._point_deltas():
--   Absolute point delta per dimension for THIS choice. is_correct is already on
--   the row, so no correct/incorrect branching is needed here. A wrong answer may
--   still carry positive credit on a dimension it genuinely demonstrates (CX-1001
--   'challenge' earns escalation judgment while missing the control).
--   Missing key  → 0 for that dimension.
--   NULL column  → fall back to the compiled-in CX-1001 heuristic.
--
-- Cross-decision rules stay in Python: the repeated-miss evidence penalty
-- depends on session history, not on any single choice row.

ALTER TABLE scenario_choices
  ADD COLUMN IF NOT EXISTS dimension_weights JSONB;

COMMENT ON COLUMN scenario_choices.dimension_weights IS
  'Absolute per-dimension competency point deltas for this choice: '
  '{"control_mapping": int, "evidence": int, "escalation": int, "remediation": int}. '
  'NULL falls back to the compiled-in CX-1001 heuristic in core/agents/grading.py.';
