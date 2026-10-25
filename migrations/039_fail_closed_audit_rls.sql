-- ASTRA 039 — Fail closed when no tenant context is bound.
-- Existing audit rows remain append-only and are never rewritten.

-- Historical migration 005 created a published admin/admin identity. Keep the
-- row only as non-login demo attribution so upgrades and fresh installs are safe.
UPDATE users
SET is_active = FALSE,
    updated_at = NOW()
WHERE email = 'admin@astralabs.com'
  AND password_hash = '$2b$12$cY0s5BgOrzUMAAnG9xeyTOMrwEx2PNHMNaELE7hVaeUcDX1ySRVvC';

CREATE OR REPLACE FUNCTION astra_current_tenant()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_org', true), ''),
    NULLIF(current_setting('app.current_tenant', true), '')
  );
$$;

ALTER TABLE tenant_audit_tail ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_audit_tail FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tail ON tenant_audit_tail;
CREATE POLICY tenant_isolation_tail ON tenant_audit_tail
  FOR ALL
  TO cortex_app
  USING (
    astra_current_tenant() IS NOT NULL
    AND tenant_id::text = astra_current_tenant()
  )
  WITH CHECK (
    astra_current_tenant() IS NOT NULL
    AND tenant_id::text = astra_current_tenant()
  );

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant_select ON audit_log;
DROP POLICY IF EXISTS audit_log_tenant_insert ON audit_log;
CREATE POLICY audit_log_tenant_select ON audit_log
  FOR SELECT
  TO cortex_app
  USING (
    astra_current_tenant() IS NOT NULL
    AND (
      org_id = astra_current_tenant()
      OR tenant_id::text = astra_current_tenant()
    )
  );
CREATE POLICY audit_log_tenant_insert ON audit_log
  FOR INSERT
  TO cortex_app
  WITH CHECK (
    astra_current_tenant() IS NOT NULL
    AND (
      org_id = astra_current_tenant()
      OR tenant_id::text = astra_current_tenant()
    )
  );

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM cortex_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
