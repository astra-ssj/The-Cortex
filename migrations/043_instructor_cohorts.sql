-- CORTEX 043 — Tenant-scoped instructor cohorts, assignments, and coaching.
-- Learners can read only their own targeting and learner-visible notes through
-- the API; RLS supplies the non-bypassable tenant boundary.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","instruction"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, id)
);

CREATE TABLE IF NOT EXISTS cohort_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  cohort_id UUID NOT NULL,
  learner_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","instruction","membership"]'::jsonb,
  UNIQUE (org_id, cohort_id, learner_id),
  FOREIGN KEY (org_id, cohort_id) REFERENCES cohorts(org_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  cohort_id UUID,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  instructions TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  created_by TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","instruction","assignment"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, cohort_id) REFERENCES cohorts(org_id, id)
);

CREATE TABLE IF NOT EXISTS assignment_practices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  assignment_id UUID NOT NULL,
  scenario_slug TEXT NOT NULL REFERENCES scenarios(slug),
  position INT NOT NULL DEFAULT 1 CHECK (position > 0),
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","instruction","curriculum"]'::jsonb,
  UNIQUE (org_id, assignment_id, scenario_slug),
  FOREIGN KEY (org_id, assignment_id) REFERENCES assignments(org_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignment_learners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  assignment_id UUID NOT NULL,
  learner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'completed', 'excused')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","instruction","assignment"]'::jsonb,
  UNIQUE (org_id, assignment_id, learner_id),
  FOREIGN KEY (org_id, assignment_id) REFERENCES assignments(org_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coaching_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  cohort_id UUID,
  assignment_id UUID,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 8000),
  visibility TEXT NOT NULL CHECK (visibility IN ('learner_visible', 'private')),
  jurisdiction TEXT NOT NULL DEFAULT 'internal',
  purpose_tags JSONB NOT NULL DEFAULT '["learning","instruction","coaching"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (org_id, cohort_id) REFERENCES cohorts(org_id, id),
  FOREIGN KEY (org_id, assignment_id) REFERENCES assignments(org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_memberships_learner
  ON cohort_memberships (org_id, learner_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due
  ON assignments (org_id, due_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_assignment_learners_learner
  ON assignment_learners (org_id, learner_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_coaching_notes_learner
  ON coaching_notes (org_id, learner_id, created_at DESC);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cohorts', 'cohort_memberships', 'assignments', 'assignment_practices',
    'assignment_learners', 'coaching_notes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL USING (org_id = cortex_current_org()) WITH CHECK (org_id = cortex_current_org())',
      table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION cortex_reject_coaching_note_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'coaching notes are append-only';
END;
$$;

DROP TRIGGER IF EXISTS coaching_notes_append_only ON coaching_notes;
CREATE TRIGGER coaching_notes_append_only
BEFORE UPDATE OR DELETE ON coaching_notes
FOR EACH ROW EXECUTE FUNCTION cortex_reject_coaching_note_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      cohorts, cohort_memberships, assignments, assignment_practices,
      assignment_learners TO cortex_app;
    GRANT SELECT, INSERT ON coaching_notes TO cortex_app;
  END IF;
END $$;

REVOKE UPDATE, DELETE, TRUNCATE ON coaching_notes FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON coaching_notes FROM cortex_app;
