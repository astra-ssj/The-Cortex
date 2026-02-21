-- CORTEX assessment_results — Store per-framework assessment scores for trend.
-- Run after init.sql. Idempotent (CREATE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS assessment_results (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT NOT NULL,
    framework_id TEXT NOT NULL,
    score       NUMERIC(5,2),
    gap_count   INT,
    assessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_results_org_framework
    ON assessment_results (org_id, framework_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_assessed_at
    ON assessment_results (assessed_at DESC);
