-- CORTEX 032 — Grant UPDATE on audit_log to cortex_app so SELECT FOR UPDATE
-- can serialise hash-chain tail reads across concurrent writers.
-- The append-only trigger (migration 016) still prevents actual
-- row modifications — UPDATE privilege is needed only for the
-- advisory lock, not for data mutation.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    GRANT UPDATE ON audit_log TO cortex_app;
  END IF;
END $$;
