-- GRC skills — authoritative citation metadata for frameworks and controls.
-- Idempotent: safe to re-run. Apply manually or via docker-entrypoint-initdb.d (see docker-compose).

-- ─── frameworks (GraphQL / read layer; may not exist on very old DBs) ───────
CREATE TABLE IF NOT EXISTS frameworks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT ''
);

ALTER TABLE frameworks
  ADD COLUMN IF NOT EXISTS skill_id TEXT,
  ADD COLUMN IF NOT EXISTS skill_name TEXT,
  ADD COLUMN IF NOT EXISTS citation_format TEXT;

INSERT INTO frameworks (id, name, skill_id, skill_name, citation_format) VALUES
  ('gdpr-2016-679', 'GDPR 2016/679', 'gdpr', 'GDPR 2016/679', 'Art.{n} GDPR'),
  ('iso27001-2022', 'ISO/IEC 27001:2022', 'iso27001', 'ISO/IEC 27001:2022', 'ISO 27001 {clause}'),
  ('nis2-2022-2555', 'NIS2 Directive', 'dora', 'DORA / NIS2', 'Art.{n}'),
  ('eu-cybersecurity-act', 'EU Cybersecurity Act', 'dora', 'DORA / NIS2', 'Art.{n}'),
  ('eu-ai-act-2024', 'EU AI Act 2024', 'iso42001', 'ISO/IEC 42001:2023', 'ISO 42001 {control}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  skill_id = EXCLUDED.skill_id,
  skill_name = EXCLUDED.skill_name,
  citation_format = EXCLUDED.citation_format;

-- ─── group-level controls (ontology) ───────────────────────────────────────
ALTER TABLE controls
  ADD COLUMN IF NOT EXISTS skill_id TEXT,
  ADD COLUMN IF NOT EXISTS citation TEXT,
  ADD COLUMN IF NOT EXISTS article_ref TEXT,
  ADD COLUMN IF NOT EXISTS penalty_ref TEXT;

-- Verify (commented for scripted runs)
-- SELECT id, name, skill_id, citation_format FROM frameworks ORDER BY id;
