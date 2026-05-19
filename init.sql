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
    'AstraLabs Group',
    'EU',
    '["compliance-demo", "gdpr", "nis2"]',
    'Technology',
    'EU',
    'Demo organization for CORTEX assessment engine. Simulated EU entity with personal data and critical infrastructure exposure.',
    '{"employees": 150, "data_subjects_estimate": "50k"}'
)
ON CONFLICT (id) DO NOTHING;

-- Operational persistence (ZTAIP): circuit breaker state survives restart; ingestion backlog for human review.
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    name TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    failures INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS human_review_ingestion_pending (
    id BIGSERIAL PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_human_review_ingestion_org_doc UNIQUE (org_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_human_review_ingestion_org ON human_review_ingestion_pending(org_id);
