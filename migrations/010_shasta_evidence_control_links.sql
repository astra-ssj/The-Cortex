-- Append-only finding → framework control references for audit / GRC joins (derived from framework_controls).
-- Populated when findings are persisted; never UPDATE/DELETE in application code.

CREATE TABLE IF NOT EXISTS shasta_evidence_control_links (
    id BIGSERIAL PRIMARY KEY,
    scan_run_id UUID NOT NULL REFERENCES shasta_scan_runs (id) ON DELETE CASCADE,
    org_id TEXT NOT NULL,
    finding_id BIGINT NOT NULL REFERENCES shasta_cloud_findings (id) ON DELETE CASCADE,
    framework_family TEXT NOT NULL,
    control_ref TEXT NOT NULL,
    source_engine TEXT NOT NULL DEFAULT 'shasta',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_shasta_evidence_link UNIQUE (finding_id, framework_family, control_ref)
);

CREATE INDEX IF NOT EXISTS idx_shasta_evidence_links_org_created
    ON shasta_evidence_control_links (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shasta_evidence_links_scan
    ON shasta_evidence_control_links (scan_run_id);
