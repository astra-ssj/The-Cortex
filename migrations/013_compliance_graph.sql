-- Compliance graph: cross-framework control mappings, evidence vault, entity scope.
-- Powers "test once, comply many" and GET /api/v1/graph/{org_id}.

CREATE TABLE IF NOT EXISTS control_mappings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_control_id   TEXT NOT NULL,
  source_framework_id TEXT NOT NULL,
  target_control_id   TEXT NOT NULL,
  target_framework_id TEXT NOT NULL,
  relationship        TEXT NOT NULL DEFAULT 'OVERLAPS',
  confidence          DECIMAL(3,2) DEFAULT 1.0,
  basis               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_control_id, target_control_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_source ON control_mappings(source_control_id);
CREATE INDEX IF NOT EXISTS idx_cm_target ON control_mappings(target_control_id);

CREATE TABLE IF NOT EXISTS evidence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  evidence_type TEXT NOT NULL DEFAULT 'DOCUMENT',
  source        TEXT DEFAULT 'manual',
  collected_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  status        TEXT DEFAULT 'VALID',
  raw_data      JSONB DEFAULT '{}',
  hash          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_org ON evidence(org_id);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence(status);

CREATE TABLE IF NOT EXISTS evidence_controls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id   UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  control_id    TEXT NOT NULL,
  framework_id  TEXT NOT NULL,
  strength      TEXT DEFAULT 'FULL',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (evidence_id, control_id, framework_id)
);

CREATE INDEX IF NOT EXISTS idx_ec_evidence ON evidence_controls(evidence_id);
CREATE INDEX IF NOT EXISTS idx_ec_control ON evidence_controls(control_id);

CREATE TABLE IF NOT EXISTS framework_entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id  TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  scope         TEXT DEFAULT 'FULL',
  nca           TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (framework_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_fe_framework ON framework_entities(framework_id);
CREATE INDEX IF NOT EXISTS idx_fe_entity ON framework_entities(entity_id);

INSERT INTO control_mappings
  (source_control_id, source_framework_id,
   target_control_id, target_framework_id,
   relationship, confidence, basis)
VALUES
  ('ISO-A.5.17', 'iso27001-2022', 'NIS2-Art.21(2)(i)', 'nis2-2022-2555', 'EQUIVALENT', 0.95, 'Both require MFA for privileged access'),
  ('ISO-A.5.17', 'iso27001-2022', 'GDPR-Art.32', 'gdpr-2016-679', 'OVERLAPS', 0.80, 'Authentication is a security measure under Art.32'),
  ('ISO-A.5.17', 'iso27001-2022', 'NIST-PR.AC-1', 'nist-csf-2.0', 'EQUIVALENT', 0.92, 'Identity management and access control'),
  ('NIS2-Art.21(2)(i)', 'nis2-2022-2555', 'GDPR-Art.32', 'gdpr-2016-679', 'OVERLAPS', 0.78, 'MFA is a technical security measure'),
  ('ISO-A.5.23', 'iso27001-2022', 'GDPR-Art.32', 'gdpr-2016-679', 'OVERLAPS', 0.75, 'Cloud security is part of processing security'),
  ('ISO-A.5.23', 'iso27001-2022', 'CSA-IVS-04', 'csa-ccm-v4', 'EQUIVALENT', 0.90, 'Both address cloud infrastructure security'),
  ('ISO-A.8.8', 'iso27001-2022', 'NIS2-Art.21(2)(e)', 'nis2-2022-2555', 'OVERLAPS', 0.85, 'Technical vulnerability handling'),
  ('ISO-A.8.8', 'iso27001-2022', 'NIST-DE.CM-8', 'nist-csf-2.0', 'EQUIVALENT', 0.88, 'Vulnerability scanning and management'),
  ('GDPR-Art.33', 'gdpr-2016-679', 'NIS2-Art.23', 'nis2-2022-2555', 'OVERLAPS', 0.70, 'Both require incident notification but to different authorities with different timelines'),
  ('GDPR-Art.33', 'gdpr-2016-679', 'NIST-RS.CO-2', 'nist-csf-2.0', 'PARTIAL', 0.60, 'NIST response communication includes but is broader than breach notification'),
  ('ISO-A.5.15', 'iso27001-2022', 'NIS2-Art.21(2)(i)', 'nis2-2022-2555', 'OVERLAPS', 0.82, 'Access control policies support MFA requirements'),
  ('ISO-A.5.15', 'iso27001-2022', 'NIST-PR.AC-1', 'nist-csf-2.0', 'EQUIVALENT', 0.90, 'Both define identity and access management'),
  ('ISO-A.5.21', 'iso27001-2022', 'NIS2-Art.21(2)(d)', 'nis2-2022-2555', 'OVERLAPS', 0.85, 'Supply chain security assessment'),
  ('EUAI-Art.14', 'eu-ai-act-2024', 'ISO42001-A.6.2', 'eu-ai-act-2024', 'EQUIVALENT', 0.95, 'Human oversight for AI — both reference same obligation'),
  ('EUAI-Art.9', 'eu-ai-act-2024', 'ISO42001-A.4.2', 'eu-ai-act-2024', 'EQUIVALENT', 0.92, 'AI risk management system'),
  ('ISO-A.8.15', 'iso27001-2022', 'NIS2-Art.21(2)(g)', 'nis2-2022-2555', 'OVERLAPS', 0.80, 'Logging and monitoring of network activity'),
  ('ISO-A.8.15', 'iso27001-2022', 'NIST-DE.CM-1', 'nist-csf-2.0', 'EQUIVALENT', 0.88, 'Network monitoring and logging')
ON CONFLICT (source_control_id, target_control_id) DO NOTHING;

INSERT INTO evidence
  (id, org_id, title, description, evidence_type, source, status, collected_at, expires_at)
VALUES
  ('e0000001-0000-0000-0000-000000000001', 'demo-org-001', 'MFA coverage report — 95% enabled',
   '340 total users, 323 with MFA. 17 without (3 admin accounts flagged). Conditional access policies configured for all privileged roles.',
   'SCAN', 'microsoft', 'VALID', '2026-04-15', '2026-07-15'),
  ('e0000002-0000-0000-0000-000000000002', 'demo-org-001', 'Cloud security policy v2.3',
   'Group-level cloud security policy covering AWS, Azure, and GCP. Approved by CISO. Last review: February 2025 (14 months ago — overdue).',
   'POLICY', 'manual', 'STALE', '2025-02-01', '2026-02-01'),
  ('e0000003-0000-0000-0000-000000000003', 'demo-org-001', 'Penetration test report — April 2026',
   'External pen test by SecureAudit GmbH. 3 critical, 7 high, 12 medium findings. Remediation in progress.',
   'REPORT', 'manual', 'VALID', '2026-04-10', '2027-04-10'),
  ('e0000004-0000-0000-0000-000000000004', 'demo-org-001', 'Incident response procedure v3.1',
   'Tested via tabletop exercise March 2026. Covers GDPR Art.33 72h and NIS2 Art.23 24h timelines. Approved by board.',
   'DOCUMENT', 'manual', 'VALID', '2026-03-20', '2027-03-20'),
  ('e0000005-0000-0000-0000-000000000005', 'demo-org-001', 'AWS Security Hub findings export',
   '14 S3 buckets scanned. 2 public (prod-backups, staging-assets). CloudTrail enabled in 3/4 regions.',
   'SCAN', 'aws', 'VALID', '2026-04-28', '2026-05-28'),
  ('e0000006-0000-0000-0000-000000000006', 'demo-org-001', 'GitHub security overview',
   '12 repos scanned. Branch protection on 10/12. Dependabot enabled on 8/12. 3 secret scanning alerts open.',
   'SCAN', 'github', 'VALID', '2026-04-28', '2026-05-28'),
  ('e0000007-0000-0000-0000-000000000007', 'demo-org-001', 'AI system human oversight procedure',
   'Draft procedure for CORTEX ZTAIP engine. Defines confidence threshold (0.75), escalation path, override logging. NOT YET APPROVED.',
   'DOCUMENT', 'manual', 'PENDING', '2026-04-20', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO evidence_controls (evidence_id, control_id, framework_id, strength)
VALUES
  ('e0000001-0000-0000-0000-000000000001', 'ISO-A.5.17', 'iso27001-2022', 'FULL'),
  ('e0000001-0000-0000-0000-000000000001', 'NIS2-Art.21(2)(i)', 'nis2-2022-2555', 'FULL'),
  ('e0000001-0000-0000-0000-000000000001', 'GDPR-Art.32', 'gdpr-2016-679', 'PARTIAL'),
  ('e0000001-0000-0000-0000-000000000001', 'NIST-PR.AC-1', 'nist-csf-2.0', 'FULL'),
  ('e0000002-0000-0000-0000-000000000002', 'ISO-A.5.23', 'iso27001-2022', 'FULL'),
  ('e0000002-0000-0000-0000-000000000002', 'GDPR-Art.32', 'gdpr-2016-679', 'PARTIAL'),
  ('e0000002-0000-0000-0000-000000000002', 'CSA-IVS-04', 'csa-ccm-v4', 'PARTIAL'),
  ('e0000003-0000-0000-0000-000000000003', 'ISO-A.8.8', 'iso27001-2022', 'FULL'),
  ('e0000003-0000-0000-0000-000000000003', 'NIS2-Art.21(2)(e)', 'nis2-2022-2555', 'PARTIAL'),
  ('e0000004-0000-0000-0000-000000000004', 'GDPR-Art.33', 'gdpr-2016-679', 'FULL'),
  ('e0000004-0000-0000-0000-000000000004', 'NIS2-Art.23', 'nis2-2022-2555', 'FULL'),
  ('e0000005-0000-0000-0000-000000000005', 'ISO-A.8.15', 'iso27001-2022', 'PARTIAL'),
  ('e0000005-0000-0000-0000-000000000005', 'NIS2-Art.21(2)(g)', 'nis2-2022-2555', 'PARTIAL'),
  ('e0000006-0000-0000-0000-000000000006', 'ISO-A.8.8', 'iso27001-2022', 'PARTIAL'),
  ('e0000007-0000-0000-0000-000000000007', 'EUAI-Art.14', 'eu-ai-act-2024', 'PARTIAL')
ON CONFLICT (evidence_id, control_id, framework_id) DO NOTHING;

INSERT INTO framework_entities (framework_id, entity_id, scope, nca)
VALUES
  ('iso27001-2022', 'astralabs-de', 'FULL', NULL),
  ('iso27001-2022', 'astralabs-uk', 'FULL', NULL),
  ('iso27001-2022', 'astralabs-au', 'FULL', NULL),
  ('iso27001-2022', 'astralabs-es', 'FULL', NULL),
  ('gdpr-2016-679', 'astralabs-de', 'FULL', 'BfDI'),
  ('gdpr-2016-679', 'astralabs-uk', 'FULL', 'ICO'),
  ('gdpr-2016-679', 'astralabs-es', 'FULL', 'AEPD'),
  ('nis2-2022-2555', 'astralabs-de', 'FULL', 'BSI'),
  ('nis2-2022-2555', 'astralabs-es', 'FULL', 'INCIBE-CERT'),
  ('eu-ai-act-2024', 'astralabs-de', 'FULL', 'EU AI Office'),
  ('eu-ai-act-2024', 'astralabs-es', 'PARTIAL', 'EU AI Office'),
  ('nist-csf-2.0', 'astralabs-us', 'FULL', NULL),
  ('nist-csf-2.0', 'astralabs-au', 'FULL', NULL),
  ('csa-ccm-v4', 'astralabs-us', 'FULL', NULL),
  ('cyber-essentials-v3.1', 'astralabs-uk', 'FULL', 'NCSC')
ON CONFLICT (framework_id, entity_id) DO NOTHING;

INSERT INTO frameworks (id, name) VALUES
  ('nist-csf-2.0', 'NIST CSF 2.0'),
  ('csa-ccm-v4', 'CSA CCM v4'),
  ('cyber-essentials-v3.1', 'Cyber Essentials v3.1')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
