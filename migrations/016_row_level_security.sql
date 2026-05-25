-- CORTEX 016 — Row-Level Security (database-layer tenant isolation).
--
-- Defense-in-depth so a missing application-layer org filter cannot leak cross-tenant data.
-- SEMANTICS (validated):
--   * When app.current_org is unset/empty (system connections: migrations, workers, audit,
--     background tasks) RLS is bypassed — preserves existing operational behaviour.
--   * When app.current_org is set (every authenticated request sets it via set_config),
--     a session may SELECT its own org rows + the shared demo org, and may only
--     INSERT/UPDATE/DELETE rows for its own org.
--
-- ACTIVATION: RLS is bypassed by superusers and table owners' superuser status. The default
-- POSTGRES_USER is a superuser, so applying this migration is a NO-OP until the application
-- connects as the non-superuser role `cortex_app` created below. To enforce:
--   ALTER ROLE cortex_app LOGIN PASSWORD '...';
--   -- point DATABASE_URL at cortex_app, then redeploy.
-- (FORCE ROW LEVEL SECURITY also subjects the table owner to policies once it is non-superuser.)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    CREATE ROLE cortex_app NOLOGIN;
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO cortex_app;
GRANT SELECT ON organizations TO cortex_app;

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'assessment_results',
    'human_review_pending',
    'human_review_reviewed',
    'human_review_ingestion_pending',
    'shasta_scan_runs',
    'shasta_cloud_findings',
    'shasta_evidence_control_links',
    'evidence',
    'framework_entities',
    'findings',
    'microsoft_sync_runs',
    'microsoft_cloud_findings'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- Only touch tables that exist and are actually tenant-scoped (have org_id).
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO cortex_app', t);
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

      EXECUTE format('DROP POLICY IF EXISTS rls_tenant_read ON %I', t);
      EXECUTE format(
        'CREATE POLICY rls_tenant_read ON %I FOR SELECT USING ('
        || 'nullif(current_setting(''app.current_org'', true), '''') IS NULL '
        || 'OR org_id = current_setting(''app.current_org'', true) '
        || 'OR org_id = ''demo-org-001'')',
        t
      );

      EXECUTE format('DROP POLICY IF EXISTS rls_tenant_write ON %I', t);
      EXECUTE format(
        'CREATE POLICY rls_tenant_write ON %I FOR ALL USING ('
        || 'nullif(current_setting(''app.current_org'', true), '''') IS NULL '
        || 'OR org_id = current_setting(''app.current_org'', true)) '
        || 'WITH CHECK ('
        || 'nullif(current_setting(''app.current_org'', true), '''') IS NULL '
        || 'OR org_id = current_setting(''app.current_org'', true))',
        t
      );
    END IF;
  END LOOP;

  -- Sequences needed for INSERTs by the app role.
  EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO cortex_app';
END$$;
