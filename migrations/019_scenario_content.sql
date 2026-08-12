-- CORTEX 019 — Scenario content model: scenarios, scenario_stages, scenario_choices.
-- Idempotent. Apply after 018.
--
-- Scenario content is shared curriculum, not tenant data: every org sees the same
-- scenario definitions, so these tables carry NO row-level security. Tenant state
-- stays in scenario_sessions (017), which remains RLS-scoped and untouched here.
--
-- Grants follow the same least-privilege posture as audit_log: cortex_app reads all
-- three tables and may write scenarios only. Stages and choices carry the graded
-- reference answers, so they are authored through migration/seed and are read-only
-- to the application — the app must not be able to rewrite the answer key.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- 1. scenarios — top-level scenario definition
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  brief       TEXT NOT NULL,
  track       TEXT NOT NULL,
  frameworks  TEXT[] NOT NULL DEFAULT '{}',
  difficulty  TEXT NOT NULL
                CHECK (difficulty IN ('foundation', 'practitioner', 'expert')),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_active_track
  ON scenarios (track) WHERE active;

-- ─────────────────────────────────────────────
-- 2. scenario_stages — ordered turns within a scenario
-- ─────────────────────────────────────────────
-- slug matches the runtime stage vocabulary owned by
-- core/agents/scenario.py::stage_after_choice ('access_request',
-- 'escalation', 'complete'), so a session's stage column joins directly here.
CREATE TABLE IF NOT EXISTS scenario_stages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id    UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL,
  sequence       INT NOT NULL,
  agent_message  TEXT NOT NULL,
  demands        TEXT[],
  UNIQUE (scenario_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_scenario_stages_scenario_seq
  ON scenario_stages (scenario_id, sequence);

-- ─────────────────────────────────────────────
-- 3. scenario_choices — learner options + graded reference answer
-- ─────────────────────────────────────────────
-- choice_id is the stable identifier the API validates against
-- (api/learning.py::_VALID_CHOICES). UNIQUE(stage_id, choice_id) is what makes
-- seed re-runs idempotent via ON CONFLICT DO NOTHING.
CREATE TABLE IF NOT EXISTS scenario_choices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id             UUID NOT NULL REFERENCES scenario_stages(id) ON DELETE CASCADE,
  choice_id            TEXT NOT NULL,
  label                TEXT NOT NULL,
  consequence          TEXT NOT NULL,
  is_correct           BOOLEAN NOT NULL,
  framework_rationale  TEXT,
  UNIQUE (stage_id, choice_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_choices_stage
  ON scenario_choices (stage_id);

-- ─────────────────────────────────────────────
-- 4. Grants — shared content, no RLS
-- ─────────────────────────────────────────────
-- 016 granted full DML on ALL TABLES (and via default privileges), so the writes
-- must be revoked explicitly rather than merely left ungranted.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    REVOKE ALL ON scenarios, scenario_stages, scenario_choices FROM cortex_app;

    GRANT SELECT ON scenarios, scenario_stages, scenario_choices TO cortex_app;
    GRANT INSERT, UPDATE ON scenarios TO cortex_app;
  END IF;
END $$;

REVOKE ALL ON scenarios, scenario_stages, scenario_choices FROM PUBLIC;
