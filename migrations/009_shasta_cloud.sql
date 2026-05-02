-- Shasta / cloud CSPM scan results — Postgres is SoT; not Shasta SQLite.
-- Rationale: org-scoped evidence for audit; raw_finding JSONB is append-on-write at insert time.

CREATE TABLE IF NOT EXISTS shasta_scan_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    cloud           TEXT NOT NULL CHECK (cloud IN ('aws', 'azure')),
    engine          TEXT NOT NULL DEFAULT 'shasta',
    engine_scan_id  TEXT,
    findings_count  INT NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
    error_message   TEXT,
    created_by      TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shasta_scan_runs_org_started
    ON shasta_scan_runs (org_id, started_at DESC);

CREATE TABLE IF NOT EXISTS shasta_cloud_findings (
    id                  BIGSERIAL PRIMARY KEY,
    scan_run_id         UUID NOT NULL REFERENCES shasta_scan_runs (id) ON DELETE CASCADE,
    org_id              TEXT NOT NULL,
    finding_key         TEXT NOT NULL,
    external_id         TEXT,
    source_engine       TEXT NOT NULL DEFAULT 'shasta',
    cloud_provider      TEXT,
    account_scope       TEXT,
    region              TEXT,
    check_id            TEXT,
    title               TEXT,
    description         TEXT,
    severity_normalized TEXT,
    compliance_status   TEXT,
    resource_type       TEXT,
    resource_id         TEXT,
    framework_controls  JSONB NOT NULL DEFAULT '{}',
    remediation         TEXT,
    collected_at        TIMESTAMPTZ,
    raw_finding         JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_shasta_finding_per_scan UNIQUE (scan_run_id, finding_key)
);

CREATE INDEX IF NOT EXISTS idx_shasta_findings_org_created
    ON shasta_cloud_findings (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shasta_findings_scan
    ON shasta_cloud_findings (scan_run_id);

CREATE INDEX IF NOT EXISTS idx_shasta_findings_severity
    ON shasta_cloud_findings (org_id, severity_normalized);
