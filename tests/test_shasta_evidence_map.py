# Unit tests for Shasta evidence-map graph builder (no Postgres).

from __future__ import annotations

from core.shasta_evidence_map import build_evidence_map_from_findings


def test_build_evidence_map_links_findings_to_controls() -> None:
    rows = [
        {
            "id": 1,
            "finding_key": "k1",
            "title": "S3 bucket public",
            "severity_normalized": "High",
            "check_id": "s3.1",
            "resource_id": "arn:aws:s3:::x",
            "framework_controls": {"cis_aws": ["1.1", "2.2"], "soc2": ["CC6.1"]},
        }
    ]
    out = build_evidence_map_from_findings(
        scan_run_id="run-a",
        org_id="o1",
        scan_status="completed",
        cloud="aws",
        finding_rows=rows,
    )
    assert out.source == "shasta"
    assert out.summary.findings == 1
    assert out.summary.control_nodes == 3
    assert out.summary.edges == 3
    kinds = {n["kind"] for n in out.nodes}
    assert kinds == {"finding", "control"}
    assert any(e["kind"] == "maps_to" and e["source"] == "finding:1" for e in out.edges)


def test_build_evidence_map_empty_controls_still_has_finding_nodes() -> None:
    rows = [
        {
            "id": 42,
            "finding_key": "k2",
            "title": "No mappings",
            "severity_normalized": "Low",
            "check_id": None,
            "resource_id": None,
            "framework_controls": {},
        }
    ]
    out = build_evidence_map_from_findings(
        scan_run_id="run-b",
        org_id="o1",
        scan_status="completed",
        cloud="azure",
        finding_rows=rows,
    )
    assert out.summary.findings == 1
    assert out.summary.control_nodes == 0
    assert out.summary.edges == 0
    assert len(out.nodes) == 1
    assert out.nodes[0]["kind"] == "finding"
