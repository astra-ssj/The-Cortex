-- CORTEX init.sql — Schema and seed data. Append-only audit_log; domain tables aligned with SovereignModel.

-- Organization profile: jurisdiction + purpose_tags for governance (ZTAIP).
CREATE TABLE IF NOT EXISTS organizations (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    jurisdiction TEXT NOT NULL DEFAULT 'internal',
    purpose_tags JSONB NOT NULL DEFAULT '[]',
    industry   TEXT,
    region     TEXT,
    description TEXT,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only audit log (never UPDATE/DELETE).
CREATE TABLE IF NOT EXISTS audit_log (
    id         BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id  TEXT,
    payload    JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Demo organization for assessment runs (GDPR + NIS2).
INSERT INTO organizations (id, name, jurisdiction, purpose_tags, industry, region, description, metadata)
VALUES (
    'demo-org-001',
    'Acme EU Services Ltd',
    'EU',
    '["compliance-demo", "gdpr", "nis2"]',
    'Technology',
    'EU',
    'Demo organization for CORTEX assessment engine. Simulated EU entity with personal data and critical infrastructure exposure.',
    '{"employees": 150, "data_subjects_estimate": "50k"}'
)
ON CONFLICT (id) DO NOTHING;
