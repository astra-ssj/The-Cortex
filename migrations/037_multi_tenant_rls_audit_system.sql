-- =============================================================================
-- Migration 037: Multi-Tenant RLS Audit System Schema
--
-- Features:
--   1. Partitioned tenant tail tracking (tenant_audit_tail).
--   2. Tamper-evident, hash-chained audit log (audit_log).
--   3. Strict Row-Level Security (RLS) matching app.current_tenant session setting.
--   4. Defense-in-depth immutability via role privileges and BEFORE triggers.
--   5. PgBouncer transaction-pooling compatible session binding.
-- =============================================================================

-- Ensure required UUID and cryptographic extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Create tenant_audit_tail table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_audit_tail (
    tenant_id        UUID PRIMARY KEY,
    last_hash        TEXT NOT NULL,
    current_sequence BIGINT NOT NULL DEFAULT 0
);

COMMENT ON TABLE tenant_audit_tail IS
    'Maintains the atomic tail state (latest hash and sequence) per tenant for serialized chain commits.';

-- -----------------------------------------------------------------------------
-- 2. Create audit_log table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id           BIGSERIAL PRIMARY KEY,
    tenant_id    UUID NOT NULL,
    sequence     BIGINT NOT NULL,
    user_id      UUID NOT NULL,
    action_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
    prev_hash    TEXT,
    current_hash TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 3. UNIQUE constraint on (tenant_id, sequence)
    CONSTRAINT uq_audit_log_tenant_sequence UNIQUE (tenant_id, sequence)
);

COMMENT ON TABLE audit_log IS
    'Append-only, immutable multi-tenant audit ledger with cryptographic hash chaining.';

-- Performance indexes for tenant timeline queries
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
    ON audit_log (tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Role Creation & Granular Privilege Grants
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
        CREATE ROLE cortex_app WITH LOGIN;
    END IF;
END $$;

-- Sequence usage for BIGSERIAL auto-increment (if present in public schema)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'audit_log_id_seq' AND c.relkind = 'S'
    ) THEN
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO cortex_app';
    END IF;
END $$;

-- Table permissions: cortex_app can INSERT, SELECT, UPDATE, DELETE on tail, and INSERT, SELECT on audit_log
GRANT INSERT, SELECT, UPDATE, DELETE ON tenant_audit_tail TO cortex_app;
GRANT INSERT, SELECT ON audit_log TO cortex_app;

-- 5. Immutability: Explicitly revoke UPDATE, DELETE, and TRUNCATE on audit_log
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM cortex_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
REVOKE TRUNCATE ON tenant_audit_tail FROM cortex_app;
REVOKE TRUNCATE ON tenant_audit_tail FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 6. Trigger Defense: Immutable Deadbolt on audit_log
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable: UPDATE and DELETE operations are strictly prohibited on table audit_log (tenant_id: %, id: %)',
        OLD.tenant_id, OLD.id
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_audit_log_immutability();

-- -----------------------------------------------------------------------------
-- 7. Row-Level Security (RLS) Configuration
-- -----------------------------------------------------------------------------
-- Enable RLS and FORCE RLS so table owners and application roles are strictly bound
ALTER TABLE tenant_audit_tail ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_audit_tail FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- Clean up any existing policies
DROP POLICY IF EXISTS tenant_isolation_tail ON tenant_audit_tail;
DROP POLICY IF EXISTS audit_log_tenant_select ON audit_log;
DROP POLICY IF EXISTS audit_log_tenant_insert ON audit_log;

-- Policy for tenant_audit_tail (read & update locked strictly to current tenant when set)
CREATE POLICY tenant_isolation_tail ON tenant_audit_tail
    FOR ALL
    TO cortex_app
    USING (
        NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        OR tenant_id::text = current_setting('app.current_tenant', true)
        OR tenant_id::text = current_setting('app.current_org', true)
    )
    WITH CHECK (
        NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        OR tenant_id::text = current_setting('app.current_tenant', true)
        OR tenant_id::text = current_setting('app.current_org', true)
    );

-- Policy for audit_log: SELECT restricted to current tenant when set
CREATE POLICY audit_log_tenant_select ON audit_log
    FOR SELECT
    TO cortex_app
    USING (
        NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        OR tenant_id::text = current_setting('app.current_tenant', true)
        OR org_id = current_setting('app.current_org', true)
    );

-- Policy for audit_log: INSERT restricted to current tenant when set
CREATE POLICY audit_log_tenant_insert ON audit_log
    FOR INSERT
    TO cortex_app
    WITH CHECK (
        NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        OR tenant_id::text = current_setting('app.current_tenant', true)
        OR org_id = current_setting('app.current_org', true)
    );

-- =============================================================================
-- 8. Application Integration & Verification Guide
-- =============================================================================
/*
================================================================================
APPLICATION & GRAPHJIN INTEGRATION DEMONSTRATION
================================================================================

When operating behind PgBouncer in transaction pooling mode, or connecting from
FastAPI (asyncpg), Node.js, or GraphJin:

Connection state must never be stored globally across connection checkouts.
Instead, execute `SET LOCAL app.current_tenant` within each database transaction.
`SET LOCAL` binds the setting exclusively for the duration of the current
transaction and automatically clears upon COMMIT or ROLLBACK.

Example Execution Workflow:

-- 1. Begin a scoped transaction
BEGIN;

-- 2. Bind the authenticated tenant identity:
SET LOCAL app.current_tenant = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

-- 3. Fetch tail for update (RLS enforces that only a0eebc99's tail is visible/lockable):
SELECT last_hash, current_sequence
FROM tenant_audit_tail
WHERE tenant_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
FOR UPDATE;

-- 4. Bulk insert audit log entries:
INSERT INTO audit_log (tenant_id, sequence, user_id, action_data, prev_hash, current_hash)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    1,
    'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    '{"decision": "grant_access", "resource": "prod_db"}'::jsonb,
    '0000000000000000000000000000000000000000000000000000000000000000',
    '8f434346648f6b96df89dda901c5176b10e6d0ceec3e6a88e727ec2938a9d185'
);

-- 5. Cross-tenant queries are completely invisible:
-- SELECT * FROM audit_log WHERE tenant_id = 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f';
-- -> Returns 0 rows (completely isolated)

-- 6. Cross-tenant writes are strictly blocked:
-- INSERT INTO audit_log (tenant_id, sequence, user_id, action_data, current_hash)
-- VALUES ('c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f', 1, ...);
-- -> ERROR: new row violates row-level security policy for table "audit_log"

-- 7. Tampering is physically prevented by the immutable trigger:
-- UPDATE audit_log SET current_hash = 'tampered' WHERE id = 1;
-- -> ERROR: Audit log entries are immutable: UPDATE and DELETE operations are strictly prohibited

-- 8. Commit and automatically clear tenant context:
COMMIT;
================================================================================
*/
