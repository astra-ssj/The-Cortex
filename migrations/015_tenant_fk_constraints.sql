-- CORTEX 015 — Tenant integrity: foreign keys on org_id columns that lacked them.
-- Defense-in-depth for multi-tenant isolation (application still scopes every query).
-- Uses NOT VALID so it enforces new/updated rows without failing on any pre-existing data,
-- and DO blocks so the migration is idempotent (safe to re-run).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_assessment_results_org'
  ) THEN
    ALTER TABLE assessment_results
      ADD CONSTRAINT fk_assessment_results_org
      FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE NOT VALID;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_shasta_findings_org'
  ) THEN
    ALTER TABLE shasta_cloud_findings
      ADD CONSTRAINT fk_shasta_findings_org
      FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
