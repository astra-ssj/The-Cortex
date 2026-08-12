-- CORTEX 018 — Drop tables created by the six decommissioned modules.
-- Sources: 009 (Shasta cloud), 010 (Shasta evidence links), 013 (compliance
-- graph), 014 (Microsoft integration), 015 (relationship graph).
--
-- 016 was rewritten first so it no longer creates tenant_isolation policies or
-- org_id backfills on any table dropped here. This migration therefore runs
-- without CASCADE: every dependency is resolved explicitly before the drops.
-- Idempotent — safe to re-run.

-- ─────────────────────────────────────────────
-- 0. Resolve RLS policy dependencies
-- ─────────────────────────────────────────────
-- Databases provisioned before 016 was rewritten still carry tenant_isolation
-- policies on these tables. Policies drop with their table, but we remove them
-- explicitly so the assertion below is a genuine check rather than a no-op on
-- fresh installs.
DO $$
DECLARE
  t TEXT;
  stale INT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'evidence',
    'evidence_controls',
    'framework_entities',
    'rel_people',
    'rel_teams',
    'rel_systems',
    'rel_risks',
    'relationship_edges'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    END IF;
  END LOOP;

  SELECT count(*) INTO stale
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'shasta_scan_runs', 'shasta_cloud_findings', 'shasta_evidence_control_links',
      'microsoft_sync_runs', 'microsoft_cloud_findings',
      'control_mappings', 'evidence', 'evidence_controls', 'framework_entities',
      'rel_people', 'rel_teams', 'rel_systems', 'rel_risks', 'relationship_edges'
    );

  IF stale > 0 THEN
    RAISE EXCEPTION
      'migration 018 aborted: % RLS policies still reference decommissioned tables', stale
      USING ERRCODE = '55006';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 1. Assert no retained table depends on a dropped table
-- ─────────────────────────────────────────────
-- A foreign key from outside the decommissioned set is the only thing that
-- would force CASCADE. Stop and report rather than drop something unexpected.
DO $$
DECLARE
  offender TEXT;
BEGIN
  SELECT string_agg(
           format('%s -> %s', src.relname, tgt.relname), ', ' ORDER BY src.relname
         )
    INTO offender
  FROM pg_constraint c
  JOIN pg_class src ON src.oid = c.conrelid
  JOIN pg_class tgt ON tgt.oid = c.confrelid
  WHERE c.contype = 'f'
    AND tgt.relname IN (
      'shasta_scan_runs', 'shasta_cloud_findings', 'shasta_evidence_control_links',
      'microsoft_sync_runs', 'microsoft_cloud_findings',
      'control_mappings', 'evidence', 'evidence_controls', 'framework_entities',
      'rel_people', 'rel_teams', 'rel_systems', 'rel_risks', 'relationship_edges'
    )
    AND src.relname NOT IN (
      'shasta_scan_runs', 'shasta_cloud_findings', 'shasta_evidence_control_links',
      'microsoft_sync_runs', 'microsoft_cloud_findings',
      'control_mappings', 'evidence', 'evidence_controls', 'framework_entities',
      'rel_people', 'rel_teams', 'rel_systems', 'rel_risks', 'relationship_edges'
    );

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'migration 018 aborted: retained tables still reference decommissioned tables (%)', offender
      USING ERRCODE = '55006';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 2. Drop tables, children before parents
-- ─────────────────────────────────────────────
-- Every index and constraint named in 009/010/013/014/015 (and the two org_id
-- indexes 016 added) belongs to a table below, so all drop implicitly. No
-- DROP INDEX statements are required and none are issued.

-- 010 → 009: Shasta cloud CSPM
DROP TABLE IF EXISTS shasta_evidence_control_links;
DROP TABLE IF EXISTS shasta_cloud_findings;
DROP TABLE IF EXISTS shasta_scan_runs;

-- 014: Microsoft 365 integration
DROP TABLE IF EXISTS microsoft_cloud_findings;
DROP TABLE IF EXISTS microsoft_sync_runs;

-- 013: compliance graph
DROP TABLE IF EXISTS evidence_controls;
DROP TABLE IF EXISTS evidence;
DROP TABLE IF EXISTS control_mappings;
DROP TABLE IF EXISTS framework_entities;

-- 015: relationship graph (edges reference nodes by bare id, no FKs)
DROP TABLE IF EXISTS relationship_edges;
DROP TABLE IF EXISTS rel_people;
DROP TABLE IF EXISTS rel_teams;
DROP TABLE IF EXISTS rel_systems;
DROP TABLE IF EXISTS rel_risks;
