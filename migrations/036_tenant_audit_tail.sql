-- 036_tenant_audit_tail.sql — Partitioned tenant audit tail state for distributed worker

CREATE TABLE IF NOT EXISTS tenant_audit_tail (
    tenant_id TEXT PRIMARY KEY,
    last_hash TEXT NOT NULL,
    current_sequence BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS sequence BIGINT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action_data JSONB;

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_seq
    ON audit_log (tenant_id, sequence);

GRANT SELECT, INSERT, UPDATE ON tenant_audit_tail TO cortex_app;
GRANT SELECT, INSERT ON audit_log TO cortex_app;
