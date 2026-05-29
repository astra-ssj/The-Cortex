-- Relationship graph: evolve the compliance graph into a full organizational
-- relationship graph. Adds people / teams / systems / risks node tables plus a
-- generic relationship_edges table that wires accountability + exposure into the
-- existing framework/control/evidence/finding/entity graph.
--
-- Powers the expanded GET /api/v1/graph/{org_id}, the per-person accountability
-- view, and the finding → control → owner → team → system → entity → risk trace.
--
-- NAMING: tables are prefixed `rel_` because the CORTEX ontology (migration 002)
-- already owns `people` and `systems` with a different schema and purpose. The
-- graph node *types* remain person/team/system/risk — only the storage tables
-- are namespaced to avoid clobbering the ontology.
--
-- Seed note: finding source ids reference the live FINDINGS_STORE ids
-- (finding-002, finding-003, finding-008) and people own the controls those
-- findings violate so the trace chain resolves end-to-end for the demo.

-- ─────────────────────────────────────────────────────────────────────────────
-- rel_people — org actors with accountability (CISO, DPO, leads, engineers)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rel_people (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,
  -- CISO | DPO | Security Lead | IT Admin | Compliance Officer | Engineer | Auditor
  email       TEXT,
  team_id     UUID,
  reports_to  UUID,
  -- self-referential — org hierarchy
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rel_people_org ON rel_people(org_id);
CREATE INDEX IF NOT EXISTS idx_rel_people_team ON rel_people(team_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- rel_teams — functional units that own frameworks
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rel_teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  -- Security | Legal | IT Operations | Data Protection | Engineering
  function    TEXT,
  lead_id     UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rel_teams_org ON rel_teams(org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- rel_systems — AI systems + infrastructure that process data
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rel_systems (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  name          TEXT NOT NULL,
  system_type   TEXT NOT NULL DEFAULT 'APPLICATION',
  -- AI_SYSTEM | APPLICATION | INFRASTRUCTURE | DATABASE | CLOUD_SERVICE
  criticality   TEXT DEFAULT 'MEDIUM',
  -- CRITICAL | HIGH | MEDIUM | LOW
  processes_pii BOOLEAN DEFAULT FALSE,
  owner_id      UUID,
  ai_risk_class TEXT,
  -- For AI systems: HIGH | LIMITED | MINIMAL (Annex III reference if applicable)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rel_systems_org ON rel_systems(org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- rel_risks — financial / regulatory exposure
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rel_risks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'REGULATORY',
  -- REGULATORY | FINANCIAL | OPERATIONAL | REPUTATIONAL
  likelihood      TEXT DEFAULT 'MEDIUM',
  -- HIGH | MEDIUM | LOW
  impact_eur      BIGINT DEFAULT 0,
  -- estimated financial exposure
  framework_id    TEXT,
  -- which regulation drives this risk
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rel_risks_org ON rel_risks(org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- relationship_edges — generic edge table for the new relationships
-- (owns, responsible_for, operates, exposes_to, member_of, reports_to,
--  processes_data_on, subject_to, mitigates)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationship_edges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  -- person | team | system | risk | control | finding | evidence | framework | entity
  target_id     TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  relationship  TEXT NOT NULL,
  -- owns | responsible_for | operates | exposes_to | reports_to | member_of |
  -- processes_data_on | mitigates | subject_to
  weight        DECIMAL(3,2) DEFAULT 1.0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_id, target_id, relationship)
);
CREATE INDEX IF NOT EXISTS idx_re_org ON relationship_edges(org_id);
CREATE INDEX IF NOT EXISTS idx_re_source ON relationship_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_re_target ON relationship_edges(target_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Teams
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO rel_teams (id, org_id, name, function)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'demo-org-001', 'Security', 'Information Security'),
  ('11111111-0000-0000-0000-000000000002', 'demo-org-001', 'Data Protection', 'Privacy & GDPR'),
  ('11111111-0000-0000-0000-000000000003', 'demo-org-001', 'IT Operations', 'Infrastructure'),
  ('11111111-0000-0000-0000-000000000004', 'demo-org-001', 'Engineering', 'Product Development'),
  ('11111111-0000-0000-0000-000000000005', 'demo-org-001', 'Legal', 'Legal & Compliance')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: People (generic role-based names — never real individuals)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO rel_people (id, org_id, name, role, team_id, reports_to)
VALUES
  ('22222222-0000-0000-0000-000000000001', 'demo-org-001', 'Group CISO', 'CISO',
   '11111111-0000-0000-0000-000000000001', NULL),
  ('22222222-0000-0000-0000-000000000002', 'demo-org-001', 'Data Protection Officer', 'DPO',
   '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000003', 'demo-org-001', 'Security Lead', 'Security Lead',
   '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000004', 'demo-org-001', 'IT Operations Lead', 'IT Admin',
   '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000005', 'demo-org-001', 'Engineering Lead', 'Engineer',
   '11111111-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000006', 'demo-org-001', 'Compliance Officer', 'Compliance Officer',
   '11111111-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Set team leads
UPDATE rel_teams SET lead_id = '22222222-0000-0000-0000-000000000003'
WHERE id = '11111111-0000-0000-0000-000000000001';
UPDATE rel_teams SET lead_id = '22222222-0000-0000-0000-000000000002'
WHERE id = '11111111-0000-0000-0000-000000000002';
UPDATE rel_teams SET lead_id = '22222222-0000-0000-0000-000000000004'
WHERE id = '11111111-0000-0000-0000-000000000003';
UPDATE rel_teams SET lead_id = '22222222-0000-0000-0000-000000000005'
WHERE id = '11111111-0000-0000-0000-000000000004';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Systems
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO rel_systems
  (id, org_id, name, system_type, criticality, processes_pii, owner_id, ai_risk_class)
VALUES
  ('33333333-0000-0000-0000-000000000001', 'demo-org-001', 'HR Candidate Screening',
   'AI_SYSTEM', 'HIGH', TRUE, '22222222-0000-0000-0000-000000000005', 'HIGH'),
  ('33333333-0000-0000-0000-000000000002', 'demo-org-001', 'CORTEX Assessment Engine',
   'AI_SYSTEM', 'CRITICAL', FALSE, '22222222-0000-0000-0000-000000000005', 'HIGH'),
  ('33333333-0000-0000-0000-000000000003', 'demo-org-001', 'Customer Database',
   'DATABASE', 'CRITICAL', TRUE, '22222222-0000-0000-0000-000000000004', NULL),
  ('33333333-0000-0000-0000-000000000004', 'demo-org-001', 'Azure AD / Entra ID',
   'CLOUD_SERVICE', 'CRITICAL', TRUE, '22222222-0000-0000-0000-000000000004', NULL),
  ('33333333-0000-0000-0000-000000000005', 'demo-org-001', 'Document Intelligence',
   'AI_SYSTEM', 'MEDIUM', TRUE, '22222222-0000-0000-0000-000000000005', 'LIMITED')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Risks
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO rel_risks
  (id, org_id, title, category, likelihood, impact_eur, framework_id)
VALUES
  ('44444444-0000-0000-0000-000000000001', 'demo-org-001',
   'NIS2 non-compliance penalty', 'REGULATORY', 'HIGH', 2400000, 'nis2-2022-2555'),
  ('44444444-0000-0000-0000-000000000002', 'demo-org-001',
   'GDPR enforcement action', 'REGULATORY', 'MEDIUM', 3200000, 'gdpr-2016-679'),
  ('44444444-0000-0000-0000-000000000003', 'demo-org-001',
   'EU AI Act conformity failure', 'REGULATORY', 'HIGH', 8400000, 'eu-ai-act-2024'),
  ('44444444-0000-0000-0000-000000000004', 'demo-org-001',
   'Data breach via unpatched system', 'OPERATIONAL', 'MEDIUM', 1500000, NULL)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Relationship edges — wires the new nodes into the existing graph.
-- Source/target ids use the same bare identifiers the graph builder resolves:
--   control  → control_id (e.g. ISO-A.5.17, NIS2-IR-01)
--   framework → framework_id (e.g. nis2-2022-2555)
--   finding   → live finding id (e.g. finding-003)
--   entity    → entity_id (e.g. astralabs-de)
--   person/team/system/risk → UUID
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO relationship_edges
  (org_id, source_id, source_type, target_id, target_type, relationship)
VALUES
  -- People own controls (mapped framework controls + the controls findings violate)
  ('demo-org-001', '22222222-0000-0000-0000-000000000003', 'person', 'ISO-A.5.17', 'control', 'owns'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000003', 'person', 'NIS2-IR-01', 'control', 'owns'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000002', 'person', 'GDPR-Art.32', 'control', 'owns'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000002', 'person', 'GDPR-Art.33', 'control', 'owns'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000004', 'person', 'ISO-A.5.23', 'control', 'owns'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000005', 'person', 'EUAI-Art.14', 'control', 'owns'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000005', 'person', 'EUAI-HO-01', 'control', 'owns'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000003', 'person', 'ISO-A.8.8', 'control', 'owns'),

  -- Teams responsible for frameworks
  ('demo-org-001', '11111111-0000-0000-0000-000000000001', 'team', 'iso27001-2022', 'framework', 'responsible_for'),
  ('demo-org-001', '11111111-0000-0000-0000-000000000001', 'team', 'nis2-2022-2555', 'framework', 'responsible_for'),
  ('demo-org-001', '11111111-0000-0000-0000-000000000002', 'team', 'gdpr-2016-679', 'framework', 'responsible_for'),
  ('demo-org-001', '11111111-0000-0000-0000-000000000004', 'team', 'eu-ai-act-2024', 'framework', 'responsible_for'),

  -- People are members of teams
  ('demo-org-001', '22222222-0000-0000-0000-000000000003', 'person', '11111111-0000-0000-0000-000000000001', 'team', 'member_of'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000002', 'person', '11111111-0000-0000-0000-000000000002', 'team', 'member_of'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000004', 'person', '11111111-0000-0000-0000-000000000003', 'team', 'member_of'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000005', 'person', '11111111-0000-0000-0000-000000000004', 'team', 'member_of'),

  -- People report to people (hierarchy)
  ('demo-org-001', '22222222-0000-0000-0000-000000000002', 'person', '22222222-0000-0000-0000-000000000001', 'person', 'reports_to'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000003', 'person', '22222222-0000-0000-0000-000000000001', 'person', 'reports_to'),

  -- People operate systems
  ('demo-org-001', '22222222-0000-0000-0000-000000000005', 'person', '33333333-0000-0000-0000-000000000001', 'system', 'operates'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000005', 'person', '33333333-0000-0000-0000-000000000002', 'system', 'operates'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000004', 'person', '33333333-0000-0000-0000-000000000004', 'system', 'operates'),
  ('demo-org-001', '22222222-0000-0000-0000-000000000003', 'person', '33333333-0000-0000-0000-000000000003', 'system', 'operates'),

  -- Systems process data on entities
  ('demo-org-001', '33333333-0000-0000-0000-000000000001', 'system', 'astralabs-de', 'entity', 'processes_data_on'),
  ('demo-org-001', '33333333-0000-0000-0000-000000000001', 'system', 'astralabs-es', 'entity', 'processes_data_on'),
  ('demo-org-001', '33333333-0000-0000-0000-000000000003', 'system', 'astralabs-de', 'entity', 'processes_data_on'),

  -- Findings expose to risks (live finding ids so the trace resolves end-to-end)
  ('demo-org-001', 'finding-003', 'finding', '44444444-0000-0000-0000-000000000003', 'risk', 'exposes_to'),
  ('demo-org-001', 'finding-002', 'finding', '44444444-0000-0000-0000-000000000001', 'risk', 'exposes_to'),
  ('demo-org-001', 'finding-008', 'finding', '44444444-0000-0000-0000-000000000004', 'risk', 'exposes_to'),

  -- AI systems linked to the AI Act human-oversight control
  ('demo-org-001', '33333333-0000-0000-0000-000000000001', 'system', 'EUAI-Art.14', 'control', 'subject_to'),
  ('demo-org-001', '33333333-0000-0000-0000-000000000002', 'system', 'EUAI-Art.14', 'control', 'subject_to')
ON CONFLICT (source_id, target_id, relationship) DO NOTHING;
