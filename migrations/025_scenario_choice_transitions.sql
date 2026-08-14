-- CORTEX 025 — Choice transition columns on scenario_choices.
-- Idempotent. Apply after 024.
--
-- Stage transitions and risk labels used to live in core/agents/scenario.py as
-- CX-1001-only maps (approve_all / least_privilege / challenge / deny). Every
-- later scenario's choice_ids missed those maps, so sessions never left the
-- entry stage and risk stayed 'unknown'.
--
-- These columns move that control data onto the content row the loader already
-- reads. The application role remains SELECT-only on scenario_choices (019) —
-- authors still ship transitions via migration/seed, not through the API.
-- No RLS change: this is shared curriculum, same as the rest of the table.
--
-- Semantics consumed by risk_for_choice() / stage_after_choice():
--   next_stage   NULL → terminal ('complete')
--   risk_outcome NULL → 'unknown'

ALTER TABLE scenario_choices
  ADD COLUMN IF NOT EXISTS next_stage TEXT;

ALTER TABLE scenario_choices
  ADD COLUMN IF NOT EXISTS risk_outcome TEXT;
