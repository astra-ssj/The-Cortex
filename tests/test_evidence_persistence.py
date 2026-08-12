# tests/test_evidence_persistence.py — Finding ↔ evidence attachment in the findings store.

from __future__ import annotations

from api.findings import FINDINGS_STORE, attach_evidence_to_finding


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
