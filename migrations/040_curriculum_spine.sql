-- CORTEX 040 — Immutable, versioned curriculum spine.
-- Existing scenario tables remain the compatibility projection used by older clients.
-- Published version rows are append-only; tenant learning records remain RLS scoped.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS practices (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS practice_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id TEXT NOT NULL REFERENCES practices(id),
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content JSONB NOT NULL,
  provenance JSONB NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (practice_id, version)
);

CREATE TABLE IF NOT EXISTS scenario_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES scenarios(id),
  version INTEGER NOT NULL CHECK (version > 0),
  practice_version_id UUID REFERENCES practice_versions(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  track TEXT NOT NULL,
  frameworks TEXT[] NOT NULL DEFAULT '{}',
  difficulty TEXT NOT NULL CHECK (difficulty IN ('foundation', 'practitioner', 'expert')),
  entry_stage_id TEXT NOT NULL,
  answer_policy TEXT NOT NULL DEFAULT 'exactly_one'
    CHECK (answer_policy IN ('exactly_one', 'one_or_more', 'ungraded')),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scenario_id, version)
);

CREATE TABLE IF NOT EXISTS scenario_stage_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_version_id UUID NOT NULL REFERENCES scenario_versions(id),
  stable_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  agent_message TEXT NOT NULL DEFAULT '',
  demands JSONB NOT NULL DEFAULT '[]'::jsonb,
  terminal BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (scenario_version_id, stable_id),
  UNIQUE (scenario_version_id, sequence)
);

CREATE TABLE IF NOT EXISTS scenario_choice_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_version_id UUID NOT NULL REFERENCES scenario_stage_versions(id),
  stable_id TEXT NOT NULL,
  label TEXT NOT NULL,
  consequence TEXT NOT NULL DEFAULT '',
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  framework_rationale TEXT,
  next_stage_id TEXT,
  risk_outcome TEXT,
  dimension_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  control_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (stage_version_id, stable_id)
);

CREATE TABLE IF NOT EXISTS learning_tracks (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS track_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id TEXT NOT NULL REFERENCES learning_tracks(id),
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (track_id, version)
);

CREATE TABLE IF NOT EXISTS track_memberships (
  track_version_id UUID NOT NULL REFERENCES track_versions(id),
  scenario_version_id UUID NOT NULL REFERENCES scenario_versions(id),
  position INTEGER NOT NULL CHECK (position > 0),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (track_version_id, scenario_version_id),
  UNIQUE (track_version_id, position)
);

CREATE TABLE IF NOT EXISTS track_prerequisites (
  track_version_id UUID NOT NULL REFERENCES track_versions(id),
  prerequisite_track_version_id UUID NOT NULL REFERENCES track_versions(id),
  PRIMARY KEY (track_version_id, prerequisite_track_version_id),
  CHECK (track_version_id <> prerequisite_track_version_id)
);

CREATE TABLE IF NOT EXISTS curriculum_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('practice_version', 'scenario_version', 'track_version')),
  subject_id UUID NOT NULL,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS curriculum_validation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('practice_version', 'scenario_version', 'track_version')),
  subject_id UUID NOT NULL,
  validator_version TEXT NOT NULL,
  valid BOOLEAN NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE scenario_sessions
  ADD COLUMN IF NOT EXISTS scenario_version_id UUID REFERENCES scenario_versions(id),
  ADD COLUMN IF NOT EXISTS track_version_id UUID REFERENCES track_versions(id),
  ADD COLUMN IF NOT EXISTS learner_rationale TEXT,
  ADD COLUMN IF NOT EXISTS learner_confidence NUMERIC(4,3)
    CHECK (learner_confidence IS NULL OR learner_confidence BETWEEN 0 AND 1);

CREATE TABLE IF NOT EXISTS curriculum_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  track_version_id UUID NOT NULL REFERENCES track_versions(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (org_id, learner_id, track_version_id)
);

CREATE TABLE IF NOT EXISTS curriculum_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  enrollment_id UUID REFERENCES curriculum_enrollments(id),
  scenario_version_id UUID NOT NULL REFERENCES scenario_versions(id),
  session_id UUID NOT NULL REFERENCES scenario_sessions(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id)
);

CREATE TABLE IF NOT EXISTS agent_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  session_id UUID NOT NULL REFERENCES scenario_sessions(id),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  provenance_type TEXT NOT NULL CHECK (provenance_type IN ('live_model', 'stub', 'safe_fallback')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  fixture_version TEXT,
  response_hash TEXT NOT NULL CHECK (response_hash ~ '^[0-9a-f]{64}$'),
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_scenario_versions_published
  ON scenario_versions (scenario_id, version DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_track_memberships_scenario ON track_memberships (scenario_version_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_org_learner ON curriculum_enrollments (org_id, learner_id);
CREATE INDEX IF NOT EXISTS idx_agent_turns_session ON agent_turns (session_id, sequence);

-- Snapshot current mutable curriculum into version 1. The digest is over the
-- canonical jsonb text generated by PostgreSQL, and therefore stable on re-run.
INSERT INTO practices (id)
SELECT DISTINCT source_skill_id FROM scenarios WHERE source_skill_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO practice_versions (
  practice_id, version, status, title, summary, content, provenance, content_hash, published_at
)
SELECT s.source_skill_id,
       COALESCE(NULLIF(s.source_skill_version, ''), 'v1'),
       'published',
       s.title,
       s.brief,
       jsonb_build_object(
         'practice_area', s.practice_area,
         'estimated_minutes', s.estimated_minutes,
         'learning_objectives', s.learning_objectives
       ),
       jsonb_build_object(
         'source_url', s.source_skill_url,
         'source_hash', s.source_skill_hash,
         'license', s.source_skill_license,
         'review_state', s.source_review_state
       ),
       encode(digest(jsonb_build_object(
         'title', s.title, 'brief', s.brief, 'objectives', s.learning_objectives
       )::text, 'sha256'), 'hex'),
       NOW()
FROM scenarios s
WHERE s.source_skill_id IS NOT NULL
ON CONFLICT (practice_id, version) DO NOTHING;

INSERT INTO scenario_versions (
  scenario_id, version, practice_version_id, status, slug, title, brief, track,
  frameworks, difficulty, entry_stage_id,
  answer_policy, content_hash, provenance, published_at
)
SELECT s.id, 1, pv.id, 'published', s.slug, s.title, s.brief, s.track,
       s.frameworks, s.difficulty,
       COALESCE((SELECT st.slug FROM scenario_stages st WHERE st.scenario_id = s.id ORDER BY st.sequence LIMIT 1), 'complete'),
       'exactly_one',
       encode(digest(jsonb_build_object(
         'slug', s.slug, 'title', s.title, 'brief', s.brief, 'track', s.track,
         'frameworks', s.frameworks, 'difficulty', s.difficulty
       )::text, 'sha256'), 'hex'),
       jsonb_build_object('backfilled_from', 'scenarios', 'migration', '040'),
       NOW()
FROM scenarios s
LEFT JOIN practice_versions pv
  ON pv.practice_id = s.source_skill_id
 AND pv.version = COALESCE(NULLIF(s.source_skill_version, ''), 'v1')
ON CONFLICT (scenario_id, version) DO NOTHING;

INSERT INTO scenario_stage_versions (
  scenario_version_id, stable_id, sequence, agent_message, demands, terminal
)
SELECT sv.id, st.slug, st.sequence, st.agent_message, to_jsonb(COALESCE(st.demands, ARRAY[]::TEXT[])),
       st.slug = 'complete'
FROM scenario_versions sv
JOIN scenario_stages st ON st.scenario_id = sv.scenario_id
WHERE sv.version = 1
ON CONFLICT (scenario_version_id, stable_id) DO NOTHING;

INSERT INTO scenario_choice_versions (
  stage_version_id, stable_id, label, consequence, is_correct,
  framework_rationale, next_stage_id, risk_outcome, dimension_weights,
  control_refs, display_order
)
SELECT stv.id, c.choice_id, c.label, c.consequence, c.is_correct,
       c.framework_rationale, c.next_stage, c.risk_outcome,
       COALESCE(c.dimension_weights, '{}'::jsonb),
       COALESCE(c.control_refs, '[]'::jsonb), c.display_order
FROM scenario_stage_versions stv
JOIN scenario_versions sv ON sv.id = stv.scenario_version_id
JOIN scenario_stages st ON st.scenario_id = sv.scenario_id AND st.slug = stv.stable_id
JOIN scenario_choices c ON c.stage_id = st.id
WHERE sv.version = 1
ON CONFLICT (stage_version_id, stable_id) DO NOTHING;

INSERT INTO learning_tracks (id)
SELECT DISTINCT track FROM scenarios
ON CONFLICT DO NOTHING;

INSERT INTO track_versions (track_id, version, status, title, content_hash, published_at)
SELECT t.id, 1, 'published', initcap(replace(t.id, '-', ' ')),
       encode(digest(jsonb_build_object('track', t.id, 'version', 1)::text, 'sha256'), 'hex'),
       NOW()
FROM learning_tracks t
ON CONFLICT (track_id, version) DO NOTHING;

INSERT INTO track_memberships (track_version_id, scenario_version_id, position, required)
SELECT tv.id, sv.id,
       row_number() OVER (PARTITION BY tv.id ORDER BY
         CASE s.difficulty WHEN 'foundation' THEN 1 WHEN 'practitioner' THEN 2 ELSE 3 END,
         s.slug),
       TRUE
FROM track_versions tv
JOIN scenarios s ON s.track = tv.track_id
JOIN scenario_versions sv ON sv.scenario_id = s.id AND sv.version = 1
WHERE tv.version = 1
ON CONFLICT (track_version_id, scenario_version_id) DO NOTHING;

-- The migration owner cannot see tenant rows while FORCE RLS is active. Lift
-- FORCE only for this deterministic null-only backfill, then restore it before
-- any grants are changed.
ALTER TABLE scenario_sessions NO FORCE ROW LEVEL SECURITY;

UPDATE scenario_sessions ss
SET scenario_version_id = sv.id
FROM scenarios s
JOIN scenario_versions sv ON sv.scenario_id = s.id AND sv.version = 1
WHERE ss.scenario = s.slug AND ss.scenario_version_id IS NULL;

UPDATE scenario_sessions ss
SET track_version_id = tm.track_version_id
FROM track_memberships tm
WHERE tm.scenario_version_id = ss.scenario_version_id
  AND ss.track_version_id IS NULL;

ALTER TABLE scenario_sessions FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION cortex_reject_published_curriculum_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('published', 'retired') THEN
    RAISE EXCEPTION 'published curriculum is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS practice_versions_immutable ON practice_versions;
CREATE TRIGGER practice_versions_immutable
BEFORE UPDATE OR DELETE ON practice_versions
FOR EACH ROW EXECUTE FUNCTION cortex_reject_published_curriculum_mutation();

DROP TRIGGER IF EXISTS scenario_versions_immutable ON scenario_versions;
CREATE TRIGGER scenario_versions_immutable
BEFORE UPDATE OR DELETE ON scenario_versions
FOR EACH ROW EXECUTE FUNCTION cortex_reject_published_curriculum_mutation();

DROP TRIGGER IF EXISTS track_versions_immutable ON track_versions;
CREATE TRIGGER track_versions_immutable
BEFORE UPDATE OR DELETE ON track_versions
FOR EACH ROW EXECUTE FUNCTION cortex_reject_published_curriculum_mutation();

CREATE OR REPLACE FUNCTION cortex_reject_published_scenario_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'scenario_stage_versions' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT status INTO parent_status FROM scenario_versions
        WHERE id = OLD.scenario_version_id;
    ELSE
      SELECT status INTO parent_status FROM scenario_versions
        WHERE id = NEW.scenario_version_id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      SELECT sv.status INTO parent_status
        FROM scenario_versions sv
        JOIN scenario_stage_versions stv ON stv.scenario_version_id = sv.id
        WHERE stv.id = OLD.stage_version_id;
    ELSE
      SELECT sv.status INTO parent_status
        FROM scenario_versions sv
        JOIN scenario_stage_versions stv ON stv.scenario_version_id = sv.id
        WHERE stv.id = NEW.stage_version_id;
    END IF;
  END IF;
  IF parent_status IN ('published', 'retired') THEN
    RAISE EXCEPTION 'published curriculum is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scenario_stage_versions_immutable ON scenario_stage_versions;
CREATE TRIGGER scenario_stage_versions_immutable
BEFORE INSERT OR UPDATE OR DELETE ON scenario_stage_versions
FOR EACH ROW EXECUTE FUNCTION cortex_reject_published_scenario_child_mutation();

DROP TRIGGER IF EXISTS scenario_choice_versions_immutable ON scenario_choice_versions;
CREATE TRIGGER scenario_choice_versions_immutable
BEFORE INSERT OR UPDATE OR DELETE ON scenario_choice_versions
FOR EACH ROW EXECUTE FUNCTION cortex_reject_published_scenario_child_mutation();

CREATE OR REPLACE FUNCTION cortex_reject_published_track_child_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status TEXT;
DECLARE parent_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    parent_id := OLD.track_version_id;
  ELSE
    parent_id := NEW.track_version_id;
  END IF;
  SELECT status INTO parent_status FROM track_versions WHERE id = parent_id;
  IF parent_status IN ('published', 'retired') THEN
    RAISE EXCEPTION 'published curriculum is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_memberships_immutable ON track_memberships;
CREATE TRIGGER track_memberships_immutable
BEFORE INSERT OR UPDATE OR DELETE ON track_memberships
FOR EACH ROW EXECUTE FUNCTION cortex_reject_published_track_child_mutation();

DROP TRIGGER IF EXISTS track_prerequisites_immutable ON track_prerequisites;
CREATE TRIGGER track_prerequisites_immutable
BEFORE INSERT OR UPDATE OR DELETE ON track_prerequisites
FOR EACH ROW EXECUTE FUNCTION cortex_reject_published_track_child_mutation();

CREATE OR REPLACE FUNCTION cortex_reject_agent_turn_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agent turns are append-only';
END;
$$;

DROP TRIGGER IF EXISTS agent_turns_append_only ON agent_turns;
CREATE TRIGGER agent_turns_append_only
BEFORE UPDATE OR DELETE ON agent_turns
FOR EACH ROW EXECUTE FUNCTION cortex_reject_agent_turn_mutation();

ALTER TABLE curriculum_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE curriculum_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_completions FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON curriculum_enrollments;
CREATE POLICY tenant_isolation ON curriculum_enrollments FOR ALL
  USING (org_id = cortex_current_org()) WITH CHECK (org_id = cortex_current_org());
DROP POLICY IF EXISTS tenant_isolation ON curriculum_completions;
CREATE POLICY tenant_isolation ON curriculum_completions FOR ALL
  USING (org_id = cortex_current_org()) WITH CHECK (org_id = cortex_current_org());
DROP POLICY IF EXISTS tenant_isolation ON agent_turns;
CREATE POLICY tenant_isolation ON agent_turns FOR ALL
  USING (org_id = cortex_current_org()) WITH CHECK (org_id = cortex_current_org());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    GRANT SELECT ON practices, practice_versions, scenario_versions,
      scenario_stage_versions, scenario_choice_versions, learning_tracks,
      track_versions, track_memberships, track_prerequisites,
      curriculum_reviews, curriculum_validation_runs TO cortex_app;
    GRANT SELECT, INSERT, UPDATE ON curriculum_enrollments TO cortex_app;
    GRANT SELECT, INSERT ON curriculum_completions, agent_turns TO cortex_app;
  END IF;
END $$;

REVOKE UPDATE, DELETE ON practice_versions, scenario_versions,
  scenario_stage_versions, scenario_choice_versions, track_versions,
  track_memberships, track_prerequisites FROM PUBLIC;
