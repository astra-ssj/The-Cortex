-- CORTEX 020 — Four-dimension competency scores on scenario_sessions.
-- Idempotent. Apply after 017 (table exists). No RLS change: the column
-- inherits scenario_sessions.tenant_isolation. Existing rows get '{}'::jsonb.
--
-- Accumulated shape (written by core/agents/grading.py, not the schema):
--   {
--     "control_mapping": { "score": 0–100, "delta": -1|0|1, "observations": [] },
--     "evidence":        { "score": 0–100, "delta": -1|0|1, "observations": [] },
--     "escalation":      { "score": 0–100, "delta": -1|0|1, "observations": [] },
--     "remediation":     { "score": 0–100, "delta": -1|0|1, "observations": [] }
--   }

ALTER TABLE scenario_sessions
  ADD COLUMN IF NOT EXISTS competency jsonb NOT NULL DEFAULT '{}'::jsonb;
