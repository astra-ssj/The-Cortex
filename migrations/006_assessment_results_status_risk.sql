-- Extend assessment_results for persisted status, risk_level, trend + upsert key.
-- Safe on existing DBs: IF NOT EXISTS / dedupe before unique index.

ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS risk_level TEXT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS trend NUMERIC(8, 2);

-- Keep latest snapshot per org/framework for ON CONFLICT upserts.
DELETE FROM assessment_results ar
WHERE ar.ctid IN (
  SELECT ctid
  FROM (
    SELECT ctid,
           ROW_NUMBER() OVER (
             PARTITION BY org_id, framework_id
             ORDER BY assessed_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM assessment_results
  ) d
  WHERE d.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_results_org_framework_unique
  ON assessment_results (org_id, framework_id);
