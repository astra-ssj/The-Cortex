-- CORTEX 033 — Support deterministic per-tenant audit-chain head discovery.

CREATE INDEX IF NOT EXISTS idx_audit_log_org_prev_hash
  ON audit_log (org_id, prev_hash);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_hash
  ON audit_log (org_id, hash);
