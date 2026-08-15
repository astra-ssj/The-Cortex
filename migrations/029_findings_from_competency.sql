-- CORTEX 029 — Make `findings` able to hold competency-derived control gaps.
-- Idempotent. Apply after 028.
--
-- The findings table has existed since 007 and api/findings.py never read it: the
-- Control Gaps screen served twelve hardcoded GDPR/NIS2 rows from an in-memory
-- FINDINGS_STORE. A learner finishing an ISO 27001 scenario and clicking Control
-- Gaps saw findings about Spanish NIS2 registration, unrelated to anything they
-- had done. The screen looked more real than any other and was the least real.
--
-- Two groups of columns are added.
--
-- Presentation columns (framework, control_name, reference, entity, current_state,
-- required_state, actions, completed_actions, notes, priority, evidence) already
-- existed on the in-memory dicts and are what the Remediation Tracker renders.
--
-- Provenance columns are the new capability: source, dimension, scenario_slug,
-- session_id, learner_id, controls, competency_score. These record which weak
-- competency dimension in which scenario produced the gap, which is what lets
-- Remediation require a retake of that specific scenario to close it — the rule
-- that turns a ticket list into a training loop.
--
-- RLS is untouched: 007 already forces tenant_isolation on org_id.

ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS framework         TEXT,
  ADD COLUMN IF NOT EXISTS control_name      TEXT,
  ADD COLUMN IF NOT EXISTS reference         TEXT,
  ADD COLUMN IF NOT EXISTS entity            TEXT,
  ADD COLUMN IF NOT EXISTS current_state     TEXT,
  ADD COLUMN IF NOT EXISTS required_state    TEXT,
  ADD COLUMN IF NOT EXISTS actions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes             JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS priority          TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

-- Provenance: where this gap came from.
--   source 'competency' → generated from a weak dimension on a finished session.
--   source 'manual'     → created by a person; no retake requirement.
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS source            TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS dimension         TEXT,
  ADD COLUMN IF NOT EXISTS scenario_slug     TEXT,
  ADD COLUMN IF NOT EXISTS session_id        UUID,
  ADD COLUMN IF NOT EXISTS learner_id        TEXT,
  ADD COLUMN IF NOT EXISTS controls          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS competency_score  INTEGER,
  ADD COLUMN IF NOT EXISTS closed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_session UUID;

-- One live gap per (learner, scenario, dimension). Retaking the same scenario
-- must update the existing gap rather than pile up a duplicate every attempt.
CREATE UNIQUE INDEX IF NOT EXISTS findings_competency_unique
  ON findings (org_id, learner_id, scenario_slug, dimension)
  WHERE source = 'competency';

CREATE INDEX IF NOT EXISTS idx_findings_org_status ON findings (org_id, status);
CREATE INDEX IF NOT EXISTS idx_findings_learner ON findings (org_id, learner_id);

COMMENT ON COLUMN findings.source IS
  '''competency'' rows are generated from a weak dimension on a finished scenario '
  'session and are closed by retaking that scenario. ''manual'' rows are authored.';

-- Remove the demo fixture seeded by 007 (finding-001 … finding-012 on
-- demo-org-001): twelve GDPR/NIS2/EU-AI-Act findings about Spanish registration
-- and UK DPO appointments, unrelated to any scenario in the ISO 27001 track.
--
-- Runs after 007 in the migration lane, so fresh installs land clean without
-- rewriting an already-applied migration. Deleting this is the point: an empty
-- Control Gaps screen that fills up as the learner works is more credible than a
-- full one that never changes.
DELETE FROM findings
WHERE org_id = 'demo-org-001'
  AND source = 'manual'
  AND id IN (
    'finding-001', 'finding-002', 'finding-003', 'finding-004',
    'finding-005', 'finding-006', 'finding-007', 'finding-008',
    'finding-009', 'finding-010', 'finding-011', 'finding-012'
  );
