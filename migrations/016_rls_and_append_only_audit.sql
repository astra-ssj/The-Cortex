-- CORTEX 016 — RLS tenant isolation + durable append-only audit_log (hash-chained).
-- Phase 2 zero-trust: DB enforces tenant boundaries and audit immutability.
-- Idempotent where practical. Apply after 015.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- 1. Rebuild audit_log as UUID + hash-chain schema
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_log'
      AND column_name = 'event_type'
  ) THEN
    ALTER TABLE audit_log RENAME TO audit_log_legacy_015;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT,
  actor         TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  payload       JSONB NOT NULL DEFAULT '{}',
  hash          TEXT NOT NULL,
  prev_hash     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
  ON audit_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created
  ON audit_log (created_at DESC);

-- Migrate legacy rows once (hash-chain rebuilt in chronological order).
DO $$
DECLARE
  r RECORD;
  prev TEXT := NULL;
  h TEXT;
  payload_txt TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_log_legacy_015'
  ) AND NOT EXISTS (SELECT 1 FROM audit_log LIMIT 1) THEN
    FOR r IN
      SELECT id, event_type, entity_type, entity_id, payload, created_at
      FROM audit_log_legacy_015
      ORDER BY id ASC
    LOOP
      payload_txt := COALESCE(r.payload::text, '{}');
      h := encode(
        digest(
          COALESCE(r.event_type, '') || '|' ||
          COALESCE(r.entity_type, '') || '|' ||
          COALESCE(r.entity_id, '') || '|' ||
          payload_txt || '|' ||
          COALESCE(prev, ''),
          'sha256'
        ),
        'hex'
      );
      INSERT INTO audit_log (
        org_id, actor, action, resource_type, resource_id,
        payload, hash, prev_hash, created_at
      ) VALUES (
        COALESCE(r.payload->>'org_id', NULL),
        COALESCE(r.payload->>'actor', 'system'),
        r.event_type,
        r.entity_type,
        r.entity_id,
        COALESCE(r.payload, '{}'::jsonb),
        h,
        prev,
        r.created_at
      );
      prev := h;
    END LOOP;
    DROP TABLE audit_log_legacy_015;
  END IF;
END $$;

-- Append-only at the grant layer for the non-superuser app role.
-- NOTE: Docker's POSTGRES_USER (cortex) is a superuser and bypasses GRANT checks
-- and RLS; the API must connect as cortex_app (created below).

-- Defense in depth: reject UPDATE/DELETE even for superusers / restored grants.
-- STATEMENT-level so empty-table DELETE/UPDATE still fail (ROW triggers would not fire).
CREATE OR REPLACE FUNCTION audit_log_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % not permitted', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;
DROP TRIGGER IF EXISTS trg_audit_log_append_only_stmt ON audit_log;
CREATE TRIGGER trg_audit_log_append_only_stmt
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH STATEMENT
  EXECUTE PROCEDURE audit_log_append_only_guard();

-- ─────────────────────────────────────────────
-- 1b. Non-superuser app role (subject to RLS + grants)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    CREATE ROLE cortex_app WITH LOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE INHERIT;
  ELSE
    ALTER ROLE cortex_app WITH NOSUPERUSER NOBYPASSRLS LOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE cortex TO cortex_app;
GRANT USAGE ON SCHEMA public TO cortex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cortex_app;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO cortex_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO cortex_app;

ALTER DEFAULT PRIVILEGES FOR ROLE cortex IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cortex_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cortex IN SCHEMA public
  GRANT SELECT, USAGE ON SEQUENCES TO cortex_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cortex IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO cortex_app;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM cortex_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
GRANT SELECT, INSERT ON audit_log TO cortex_app;

-- ─────────────────────────────────────────────
-- 2. Row-Level Security on org-scoped tables
-- ─────────────────────────────────────────────
-- FORCE so even the table owner is subject when not a superuser.
-- Policy uses app.current_org (SET LOCAL / set_config(..., true) per request).

CREATE OR REPLACE FUNCTION cortex_current_org()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org', true), '');
$$;

DO $$
DECLARE
  t TEXT;
  org_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations',
    'assessment_results',
    'findings'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    IF t = 'organizations' THEN
      org_expr := 'id';
    ELSE
      org_expr := 'org_id';
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         FOR ALL
         USING (%s = cortex_current_org())
         WITH CHECK (%s = cortex_current_org())',
      t, org_expr, org_expr
    );
  END LOOP;
END $$;
