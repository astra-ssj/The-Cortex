-- CORTEX 005 — assessment_results columns, uniqueness, demo seeds, findings table, org scores.
-- Apply on existing DBs: docker compose exec postgres psql -U cortex -d cortex -f /graphjin/migrations/005_assessment_results_fix.sql
-- Requires postgres volume mount: ./services/graphjin/migrations:/graphjin/migrations:ro

-- ─────────────────────────────────────────────
-- 0. Supporting columns on organizations / frameworks
-- ─────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS overall_score INTEGER,
  ADD COLUMN IF NOT EXISTS audit_readiness INTEGER,
  ADD COLUMN IF NOT EXISTS risk_level TEXT;

ALTER TABLE frameworks
  ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS jurisdiction TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS control_count INTEGER NOT NULL DEFAULT 0;

INSERT INTO frameworks (id, name, version, jurisdiction, control_count) VALUES
  ('iso27001-2022', 'ISO/IEC 27001:2022', 'v2022', 'international', 93),
  ('gdpr-2016-679', 'GDPR 2016/679', 'v1.0', 'EU', 25),
  ('nis2-2022-2555', 'NIS2 Directive', 'v1.0', 'EU', 20),
  ('nist-csf-2.0', 'NIST CSF 2.0', 'v2.0', 'US', 106),
  ('csa-ccm-v4', 'CSA CCM v4.0', 'v4.0', 'international', 197),
  ('cyber-essentials-v3.1', 'Cyber Essentials v3.1', 'v3.1', 'UK', 18),
  ('eu-ai-act-2024', 'EU AI Act 2024', 'v2024', 'EU', 31),
  ('eu-cybersecurity-act', 'EU Cybersecurity Act', 'v1.0', 'EU', 22)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  version = EXCLUDED.version,
  jurisdiction = EXCLUDED.jurisdiction,
  control_count = EXCLUDED.control_count;

-- ─────────────────────────────────────────────
-- 1. Add missing columns on assessment_results
-- ─────────────────────────────────────────────
ALTER TABLE assessment_results
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS risk_level TEXT,
  ADD COLUMN IF NOT EXISTS trend NUMERIC(8, 2);

UPDATE assessment_results SET status = COALESCE(status, 'NOT_ASSESSED');
UPDATE assessment_results SET risk_level = COALESCE(risk_level, 'UNKNOWN');
UPDATE assessment_results SET trend = COALESCE(trend, 0.0);

ALTER TABLE assessment_results ALTER COLUMN status SET DEFAULT 'NOT_ASSESSED';
ALTER TABLE assessment_results ALTER COLUMN risk_level SET DEFAULT 'UNKNOWN';
ALTER TABLE assessment_results ALTER COLUMN trend SET DEFAULT 0.0;
ALTER TABLE assessment_results ALTER COLUMN status SET NOT NULL;
ALTER TABLE assessment_results ALTER COLUMN risk_level SET NOT NULL;

-- Prefer DECIMAL(4,1) for trend display (narrower than legacy NUMERIC(8,2)).
ALTER TABLE assessment_results ALTER COLUMN trend TYPE DECIMAL(4,1) USING round(trend::numeric, 1)::decimal(4,1);

-- ─────────────────────────────────────────────
-- 2. Unique constraint for ON CONFLICT (drop legacy unique index first)
-- ─────────────────────────────────────────────
DROP INDEX IF EXISTS idx_assessment_results_org_framework_unique;

DELETE FROM assessment_results a
  USING assessment_results b
WHERE a.id < b.id
  AND a.org_id = b.org_id
  AND a.framework_id = b.framework_id;

ALTER TABLE assessment_results
  DROP CONSTRAINT IF EXISTS uq_assessment_org_framework;

ALTER TABLE assessment_results
  ADD CONSTRAINT uq_assessment_org_framework
  UNIQUE (org_id, framework_id);

-- ─────────────────────────────────────────────
-- 3. Seed varied scores for demo org
-- ─────────────────────────────────────────────
INSERT INTO assessment_results
  (org_id, framework_id, score, gap_count, status, risk_level, trend)
VALUES
  ('demo-org-001','iso27001-2022', 62, 23, 'PARTIAL', 'HIGH', 2.1),
  ('demo-org-001','gdpr-2016-679', 58, 6, 'PARTIAL', 'HIGH', 0.0),
  ('demo-org-001','nis2-2022-2555', 44, 8, 'NON_COMPLIANT', 'CRITICAL', -1.5),
  ('demo-org-001','nist-csf-2.0', 67, 26, 'PARTIAL', 'MEDIUM', 3.2),
  ('demo-org-001','csa-ccm-v4', 61, 49, 'PARTIAL', 'HIGH', 0.0),
  ('demo-org-001','cyber-essentials-v3.1', 78, 4, 'PARTIAL', 'MEDIUM', 1.0),
  ('demo-org-001','eu-ai-act-2024', 41, 8, 'NON_COMPLIANT', 'CRITICAL', 0.0),
  ('demo-org-001','eu-cybersecurity-act', 55, 5, 'PARTIAL', 'HIGH', 0.5)
ON CONFLICT (org_id, framework_id)
  DO UPDATE SET
    score       = EXCLUDED.score,
    gap_count   = EXCLUDED.gap_count,
    status      = EXCLUDED.status,
    risk_level  = EXCLUDED.risk_level,
    trend       = EXCLUDED.trend,
    assessed_at = NOW();

-- ─────────────────────────────────────────────
-- 4. Findings (executive summary reads from DB)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS findings (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  framework_id  TEXT,
  control_id    TEXT,
  severity      TEXT NOT NULL DEFAULT 'MEDIUM',
  status        TEXT NOT NULL DEFAULT 'OPEN',
  owner         TEXT,
  due_date      DATE,
  days_open     INTEGER DEFAULT 0,
  confidence    NUMERIC(5,2) DEFAULT 1.0,
  entity_code   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_org ON findings(org_id);

INSERT INTO findings (id, org_id, title, framework_id, control_id, severity, status, owner, due_date, days_open, confidence, entity_code)
VALUES
  ('finding-001', 'demo-org-001', '72-hour breach notification procedure not tested', 'gdpr-2016-679', 'GDPR-BN-02', 'CRITICAL', 'OPEN', 'CISO', '2026-03-15', 45, 1.0, 'DE'),
  ('finding-002', 'demo-org-001', 'NIS2 24-hour CSIRT notification process undefined', 'nis2-2022-2555', 'NIS2-IR-01', 'CRITICAL', 'IN_PROGRESS', 'Security Lead DE', '2026-03-01', 45, 1.0, 'DE'),
  ('finding-003', 'demo-org-001', 'Human oversight for AI decisions absent', 'eu-ai-act-2024', 'EUAI-HO-01', 'CRITICAL', 'OPEN', 'Unassigned', '2026-04-01', 45, 1.0, 'DE'),
  ('finding-004', 'demo-org-001', 'US transfer SCCs post-Schrems II review overdue', 'gdpr-2016-679', 'GDPR-IT-01', 'HIGH', 'IN_PROGRESS', 'DPO', '2026-02-28', 60, 1.0, 'DE'),
  ('finding-005', 'demo-org-001', 'Supply chain security assessment not performed', 'nis2-2022-2555', 'NIS2-RM-04', 'HIGH', 'OPEN', 'CISO', '2026-04-30', 30, 1.0, 'DE'),
  ('finding-006', 'demo-org-001', 'NIS2 entity registration not completed', 'nis2-2022-2555', 'NIS2-SC-01', 'HIGH', 'OPEN', 'Security Lead ES', '2026-03-31', 20, 1.0, 'ES'),
  ('finding-007', 'demo-org-001', 'DPO not appointed for UK entity', 'gdpr-2016-679', 'GDPR-DPO-01', 'HIGH', 'IN_PROGRESS', 'DPO', '2026-03-15', 35, 1.0, 'UK'),
  ('finding-008', 'demo-org-001', 'Penetration test overdue — last performed 18 months ago', 'iso27001-2022', 'ISO-A.8.8', 'HIGH', 'OPEN', 'CTO', '2026-03-31', 25, 1.0, 'DE'),
  ('finding-009', 'demo-org-001', 'GDPR RoPA incomplete — missing 3 processing activities', 'gdpr-2016-679', 'GDPR-AG-01', 'MEDIUM', 'IN_PROGRESS', 'DPO', '2026-02-28', 40, 1.0, 'UK'),
  ('finding-010', 'demo-org-001', 'Cloud service security not formally assessed', 'iso27001-2022', 'ISO-A.5.23', 'MEDIUM', 'OPEN', 'Security Lead AU', '2026-05-31', 10, 1.0, 'AU'),
  ('finding-011', 'demo-org-001', 'Business continuity plan not tested', 'nis2-2022-2555', 'NIS2-RM-03', 'MEDIUM', 'REMEDIATED', 'CISO', '2026-01-31', 0, 1.0, 'DE'),
  ('finding-012', 'demo-org-001', 'Security awareness training completion below 90%', 'iso27001-2022', 'ISO-A.6.3', 'LOW', 'IN_PROGRESS', 'Security Lead TH', '2026-02-28', 15, 1.0, 'TH')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 5. Organisations aggregate scores (persisted)
-- ─────────────────────────────────────────────
UPDATE organizations
  SET overall_score   = 58,
      audit_readiness = 53,
      risk_level      = 'CRITICAL'
WHERE id = 'demo-org-001';

-- ─────────────────────────────────────────────
-- 6. Verify
-- ─────────────────────────────────────────────
SELECT framework_id, score, status, risk_level, trend
FROM assessment_results
WHERE org_id = 'demo-org-001'
ORDER BY score ASC;

SELECT id, overall_score, audit_readiness, risk_level
FROM organizations
WHERE id = 'demo-org-001';
