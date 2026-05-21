-- Microsoft 365 integration sync runs and normalized findings (mock + future Graph API).

CREATE TABLE IF NOT EXISTS microsoft_sync_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    engine          TEXT NOT NULL DEFAULT 'microsoft_graph',
    engine_sync_id  TEXT,
    findings_count  INT NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('running', 'completed', 'failed')),
    error_message   TEXT,
    mock_mode       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_m365_sync_runs_org_started
    ON microsoft_sync_runs (org_id, started_at DESC);

CREATE TABLE IF NOT EXISTS microsoft_cloud_findings (
    id                  BIGSERIAL PRIMARY KEY,
    sync_run_id         UUID NOT NULL REFERENCES microsoft_sync_runs (id) ON DELETE CASCADE,
    org_id              TEXT NOT NULL,
    finding_key         TEXT NOT NULL,
    external_id         TEXT,
    source_engine       TEXT NOT NULL DEFAULT 'microsoft_graph',
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
    CONSTRAINT uq_m365_finding_per_run UNIQUE (sync_run_id, finding_key)
);

CREATE INDEX IF NOT EXISTS idx_m365_findings_org_created
    ON microsoft_cloud_findings (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_m365_findings_sync
    ON microsoft_cloud_findings (sync_run_id);
