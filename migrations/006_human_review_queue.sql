-- CORTEX 006 — Human review queue (demo-org assessments UI). Apply on existing DBs like other migrations.

CREATE TABLE IF NOT EXISTS human_review_pending (
  id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework TEXT NOT NULL,
  control_id TEXT NOT NULL,
  name TEXT NOT NULL,
  assessment TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  severity TEXT NOT NULL,
  reference TEXT NOT NULL,
  date_flagged TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

CREATE TABLE IF NOT EXISTS human_review_reviewed (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  framework TEXT NOT NULL,
  control_id TEXT NOT NULL,
  action TEXT NOT NULL,
  acted_by TEXT NOT NULL,
  acted_at TIMESTAMPTZ NOT NULL,
  original_confidence DOUBLE PRECISION NOT NULL,
  final_decision TEXT NOT NULL,
  audit_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_human_review_reviewed_org ON human_review_reviewed(org_id);
