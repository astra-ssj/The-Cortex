-- CORTEX 031 — Organisation invitations.
--
-- Registration still creates one org per founder. A team exists only when an
-- admin invites a learner into that org. The token is hashed at rest; the raw
-- value is shown once. No RLS: accept-invite looks the row up by token hash
-- before any tenant context exists (same pattern as password_reset_tokens).

CREATE TABLE IF NOT EXISTS org_invitations (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'ANALYST',
  full_name       TEXT NOT NULL DEFAULT '',
  token_hash      TEXT NOT NULL UNIQUE,
  invited_by      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jurisdiction    TEXT NOT NULL DEFAULT 'EU',
  purpose_tags    JSONB NOT NULL DEFAULT '["org-invite"]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations (org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations (org_id, email);

COMMENT ON TABLE org_invitations IS
  'Pending membership in an existing org. Accepting creates a users row in that org, not a new org.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cortex_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON org_invitations TO cortex_app;
  END IF;
END $$;
