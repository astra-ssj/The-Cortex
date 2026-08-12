-- CORTEX 017 — Learning Loop v1: scenario_sessions (RLS-scoped, audit via app layer).
-- One-agent onboarding scenario state store. Idempotent. Apply after 016.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS scenario_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  scenario    TEXT NOT NULL,
  learner_id  TEXT NOT NULL,
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage       TEXT NOT NULL DEFAULT 'brief',
  risk        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenario_sessions_org
  ON scenario_sessions (org_id);
CREATE INDEX IF NOT EXISTS idx_scenario_sessions_org_updated
  ON scenario_sessions (org_id, updated_at DESC);

-- Same tenant_isolation policy pattern as Phase 2 (016).
ALTER TABLE scenario_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON scenario_sessions;
CREATE POLICY tenant_isolation ON scenario_sessions
  FOR ALL
  USING (org_id = cortex_current_org())
  WITH CHECK (org_id = cortex_current_org());

-- Grants for non-superuser app role (016 creates cortex_app).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON scenario_sessions TO cortex_app;
  END IF;
END $$;
