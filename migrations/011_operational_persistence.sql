-- CORTEX 011 — Circuit breaker durability + ingestion human-review backlog (Postgres-only operations).
-- Apply after init.sql and earlier migrations that define organizations.

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
