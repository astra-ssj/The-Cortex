# tests/test_evidence_persistence.py — Ingest evidence persistence helpers.

from __future__ import annotations

from api.findings import FINDINGS_STORE, attach_evidence_to_finding
from core.evidence_persistence import IngestLinkHints, collect_control_links
from ontology.models import ControlRef, OntologyMappingResult


def test_collect_control_links_merges_mapping_and_hints() -> None:
    mapping = OntologyMappingResult(
        controls=[ControlRef(framework_id="gdpr-2016-679", control_id="GDPR-Art.33")],
        confidence_score=0.9,
    )
    hints = IngestLinkHints(
        control_id="GDPR-BN-02",
        framework_id="gdpr-2016-679",
    )
    links = collect_control_links(mapping, hints)
    ids = {c for c, _ in links}
    assert "GDPR-Art.33" in ids
    assert "GDPR-BN-02" in ids


def test_attach_evidence_to_finding_idempotent() -> None:
    fid = FINDINGS_STORE[0]["id"]
    assert attach_evidence_to_finding(
        fid,
        evidence_id="e-test-001",
        title="Breach procedure upload",
        document_id="doc-abc",
    )
    assert attach_evidence_to_finding(
        fid,
        evidence_id="e-test-001",
        title="Breach procedure upload",
        document_id="doc-abc",
    )
    ev = FINDINGS_STORE[0].get("evidence") or []
    assert sum(1 for e in ev if e.get("id") == "e-test-001") == 1
