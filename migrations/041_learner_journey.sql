-- CORTEX 041 — Tenant-scoped learner diagnostic and recommendation records.
-- The diagnostic is deterministic; authored answers and the resulting curriculum
-- pin are retained so an onboarding decision can be reproduced and audited.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS diagnostic_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  role TEXT NOT NULL,
  experience_level TEXT NOT NULL,
  target_framework TEXT NOT NULL,
  learning_goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'skipped')),
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","onboarding"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS diagnostic_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  attempt_id UUID NOT NULL REFERENCES diagnostic_attempts(id),
  question_id TEXT NOT NULL,
  response TEXT NOT NULL,
  rationale TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","onboarding","assessment"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS diagnostic_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  attempt_id UUID NOT NULL UNIQUE REFERENCES diagnostic_attempts(id),
  track_version_id UUID REFERENCES track_versions(id),
  recommended_practice_version_id UUID REFERENCES practice_versions(id),
  rationale TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  algorithm_version TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","onboarding","recommendation"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_learner
  ON diagnostic_attempts (org_id, learner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_responses_attempt
  ON diagnostic_responses (attempt_id, created_at);

ALTER TABLE diagnostic_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_recommendations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON diagnostic_attempts;
CREATE POLICY tenant_isolation ON diagnostic_attempts FOR ALL
  USING (org_id = cortex_current_org()) WITH CHECK (org_id = cortex_current_org());
DROP POLICY IF EXISTS tenant_isolation ON diagnostic_responses;
CREATE POLICY tenant_isolation ON diagnostic_responses FOR ALL
  USING (org_id = cortex_current_org()) WITH CHECK (org_id = cortex_current_org());
DROP POLICY IF EXISTS tenant_isolation ON diagnostic_recommendations;
CREATE POLICY tenant_isolation ON diagnostic_recommendations FOR ALL
  USING (org_id = cortex_current_org()) WITH CHECK (org_id = cortex_current_org());

CREATE OR REPLACE FUNCTION cortex_reject_diagnostic_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'diagnostic evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS diagnostic_responses_append_only ON diagnostic_responses;
CREATE TRIGGER diagnostic_responses_append_only
BEFORE UPDATE OR DELETE ON diagnostic_responses
FOR EACH ROW EXECUTE FUNCTION cortex_reject_diagnostic_evidence_mutation();

DROP TRIGGER IF EXISTS diagnostic_recommendations_append_only ON diagnostic_recommendations;
CREATE TRIGGER diagnostic_recommendations_append_only
BEFORE UPDATE OR DELETE ON diagnostic_recommendations
FOR EACH ROW EXECUTE FUNCTION cortex_reject_diagnostic_evidence_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    GRANT SELECT, INSERT, UPDATE ON diagnostic_attempts TO cortex_app;
    GRANT SELECT, INSERT ON diagnostic_responses, diagnostic_recommendations TO cortex_app;
  END IF;
END $$;

REVOKE DELETE ON diagnostic_attempts, diagnostic_responses,
  diagnostic_recommendations FROM PUBLIC;
REVOKE UPDATE ON diagnostic_responses, diagnostic_recommendations FROM PUBLIC;
