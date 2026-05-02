import type { ShastaEvidenceMapOut } from "../api/client";

/**
 * Static graph matching GET /api/v1/shasta/scans/{id}/evidence-map — for UI demos without AWS/Azure.
 * Not fetched from the API; labelled as sample in the Cloud scans page.
 */
export const SHASTA_EVIDENCE_MAP_SAMPLE: ShastaEvidenceMapOut = {
  source: "shasta",
  scan_run_id: "00000000-0000-4000-8000-00000000c0de",
  org_id: "demo-org-001",
  scan_status: "completed",
  cloud: "aws",
  summary: {
    findings: 3,
    control_nodes: 7,
    edges: 9,
  },
  nodes: [
    {
      id: "finding:90001",
      kind: "finding",
      label: "S3 bucket allows public read ACL",
      finding_key: "demo-s3-public",
      severity: "High",
      check_id: "S3.1",
      resource_id: "arn:aws:s3:::demo-app-assets",
    },
    {
      id: "control::cis_aws::2.1.1",
      kind: "control",
      label: "CIS_AWS · 2.1.1",
      family: "cis_aws",
      control_ref: "2.1.1",
    },
    {
      id: "control::soc2::CC6.1",
      kind: "control",
      label: "SOC2 · CC6.1",
      family: "soc2",
      control_ref: "CC6.1",
    },
    {
      id: "finding:90002",
      kind: "finding",
      label: "RDS instance not encrypted at rest",
      finding_key: "demo-rds-encrypt",
      severity: "Medium",
      check_id: "RDS.3",
      resource_id: "arn:aws:rds:eu-west-1:123456789012:db:prd",
    },
    {
      id: "control::cis_aws::2.3.1",
      kind: "control",
      label: "CIS_AWS · 2.3.1",
      family: "cis_aws",
      control_ref: "2.3.1",
    },
    {
      id: "control::iso27001::A.8.24",
      kind: "control",
      label: "ISO27001 · A.8.24",
      family: "iso27001",
      control_ref: "A.8.24",
    },
    {
      id: "finding:90003",
      kind: "finding",
      label: "Security group opens SSH to 0.0.0.0/0",
      finding_key: "demo-sg-ssh",
      severity: "High",
      check_id: "EC2.2",
      resource_id: "sg-0abc123",
    },
    {
      id: "control::cis_aws::5.2",
      kind: "control",
      label: "CIS_AWS · 5.2",
      family: "cis_aws",
      control_ref: "5.2",
    },
    {
      id: "control::hipaa::164.312(e)(1)",
      kind: "control",
      label: "HIPAA · 164.312(e)(1)",
      family: "hipaa",
      control_ref: "164.312(e)(1)",
    },
    {
      id: "control::mcsb::NS-2",
      kind: "control",
      label: "MCSB · NS-2",
      family: "mcsb",
      control_ref: "NS-2",
    },
  ],
  edges: [
    { id: "maps_to-1", kind: "maps_to", source: "finding:90001", target: "control::cis_aws::2.1.1" },
    { id: "maps_to-2", kind: "maps_to", source: "finding:90001", target: "control::soc2::CC6.1" },
    { id: "maps_to-3", kind: "maps_to", source: "finding:90002", target: "control::cis_aws::2.3.1" },
    { id: "maps_to-4", kind: "maps_to", source: "finding:90002", target: "control::iso27001::A.8.24" },
    { id: "maps_to-5", kind: "maps_to", source: "finding:90003", target: "control::cis_aws::5.2" },
    { id: "maps_to-6", kind: "maps_to", source: "finding:90003", target: "control::hipaa::164.312(e)(1)" },
    { id: "maps_to-7", kind: "maps_to", source: "finding:90003", target: "control::mcsb::NS-2" },
    { id: "maps_to-8", kind: "maps_to", source: "finding:90002", target: "control::cis_aws::2.1.1" },
    { id: "maps_to-9", kind: "maps_to", source: "finding:90001", target: "control::iso27001::A.8.24" },
  ],
};
