-- CORTEX 004 — Multi-tenancy: users, org onboarding columns, indexes.
-- Run manually on existing DBs: docker compose exec postgres psql -U cortex -d cortex -f ...

-- ─────────────────────────────────────────────
-- 1. Users — auth rows scoped to organization
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL DEFAULT '',
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  role          TEXT NOT NULL DEFAULT 'CISO',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─────────────────────────────────────────────
-- 2. Organisation onboarding / demo flags
-- ─────────────────────────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS entity_structure TEXT DEFAULT 'single';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS selected_frameworks TEXT[] DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'system';

UPDATE organizations SET is_demo = TRUE WHERE id = 'demo-org-001' OR id LIKE 'astralabs-%';

-- ─────────────────────────────────────────────
-- 3. assessment_results — index by org (column exists from prior migration)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ar_org ON assessment_results(org_id);

-- ─────────────────────────────────────────────
-- 4. Demo admin (admin@astralabs.com / admin) — bcrypt rounds 12
-- DEMO SEED ONLY. This is a publicly-known credential; do NOT ship in a production
-- deployment. DO NOTHING on conflict so an operator-changed password is never
-- silently reset back to the demo default on re-initialisation.
-- TODO(release): gate this seed behind an explicit CORTEX_SEED_DEMO flag.
-- ─────────────────────────────────────────────
INSERT INTO users (id, email, password_hash, full_name, org_id, role, is_active)
VALUES (
  'demo-user-001',
  'admin@astralabs.com',
  '$2b$12$cY0s5BgOrzUMAAnG9xeyTOMrwEx2PNHMNaELE7hVaeUcDX1ySRVvC',
  'Group CISO',
  'demo-org-001',
  'CISO',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

-- ─────────────────────────────────────────────
-- 5. Verify
-- ─────────────────────────────────────────────
SELECT 'users' AS tbl, COUNT(*)::text AS cnt FROM users
UNION ALL
SELECT 'organizations_demo', COUNT(*)::text FROM organizations WHERE is_demo = TRUE;
