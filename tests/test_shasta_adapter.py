# tests/test_shasta_adapter.py — Normalization + fixture round-trip without optional Shasta install.

from __future__ import annotations

import json
from pathlib import Path

from ontology.models import Finding
from core.connectors.shasta.shasta_adapter import (
    normalized_to_finding,
    shasta_finding_payload_to_normalized,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "shasta_sample_finding.json"


def test_fixture_maps_to_normalized_finding() -> None:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    n = shasta_finding_payload_to_normalized("scan-xyz", payload)
    assert n.source_engine == "shasta"
    assert n.check_id == "iam-root-mfa-enabled"
    assert n.severity_normalized == "High"
    assert n.cloud_provider == "aws"
    assert "soc2" in n.framework_controls
    assert n.framework_controls["soc2"] == ["CC6.1"]


def test_normalized_to_legacy_finding() -> None:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    n = shasta_finding_payload_to_normalized("scan-xyz", payload)
    f = normalized_to_finding(n)
    assert isinstance(f, Finding)
    assert f.source == "shasta"
    assert f.severity == "High"


def test_is_shasta_installed_is_boolean() -> None:
    from core.connectors.shasta.shasta_adapter import is_shasta_installed

    assert isinstance(is_shasta_installed(), bool)
