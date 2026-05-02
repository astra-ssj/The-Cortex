# Unit tests for framework_controls → link pairs (no DB).

from __future__ import annotations

from core.shasta_evidence_links import iter_control_links_from_framework_controls


def test_iter_control_links_expands_families() -> None:
    fw = {"cis_aws": ["1.1", "2.2"], "soc2": ["CC6.1"]}
    pairs = iter_control_links_from_framework_controls(fw)
    assert ("cis_aws", "1.1") in pairs
    assert ("cis_aws", "2.2") in pairs
    assert ("soc2", "CC6.1") in pairs
    assert len(pairs) == 3


def test_iter_control_links_skips_empty() -> None:
    assert iter_control_links_from_framework_controls({}) == []
    assert iter_control_links_from_framework_controls(None) == []
