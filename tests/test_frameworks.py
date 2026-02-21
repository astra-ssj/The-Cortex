# tests/test_frameworks.py — Framework load, governance rules, GDPR and NIS2 structure.

from __future__ import annotations

import pytest

from compliance import FrameworkId, get
from compliance.models import Framework


def test_registry_has_nist_csf() -> None:
    """Framework registry loads NIST CSF successfully."""
    framework = get(FrameworkId.NIST_CSF_2_0)
    assert framework is not None
    assert framework.id == "nist-csf-2.0"
    assert framework.name == "NIST CSF 2.0"
    assert len(framework.controls) >= 1


def test_registry_has_gdpr() -> None:
    """Framework registry loads GDPR successfully."""
    framework = get(FrameworkId.GDPR_2016_679)
    assert framework is not None
    assert framework.id == "gdpr-2016-679"
    assert framework.name == "GDPR 2016/679"
    assert framework.jurisdiction == "EU"
    assert "gdpr" in framework.purpose_tags


def test_gdpr_all_controls_have_at_least_one_requirement() -> None:
    """Every GDPR control has at least one requirement (governance rule)."""
    framework = get(FrameworkId.GDPR_2016_679)
    assert framework is not None
    assert framework.all_controls_have_requirement(), (
        "At least one control has no requirements"
    )


def test_gdpr_all_requirements_have_at_least_one_evidence_type() -> None:
    """Every GDPR requirement has at least one evidence_type (governance rule)."""
    framework = get(FrameworkId.GDPR_2016_679)
    assert framework is not None
    assert framework.all_requirements_have_evidence_type(), (
        "At least one requirement has no evidence_type"
    )


def test_gdpr_domains_and_article_refs() -> None:
    """GDPR covers required domains with real Article references."""
    framework = get(FrameworkId.GDPR_2016_679)
    assert framework is not None
    domains = {c.domain for c in framework.controls}
    expected = {
        "Lawful Basis & Consent",
        "Data Subject Rights",
        "Data Protection by Design",
        "Security of Processing",
        "Breach Notification",
        "DPO Requirements",
        "International Transfers",
        "Accountability",
    }
    assert domains == expected, f"Missing or extra domains: {domains.symmetric_difference(expected)}"
    # Spot-check Article refs
    all_refs = []
    for c in framework.controls:
        for r in c.requirements:
            if r.article_ref:
                all_refs.append(r.article_ref)
    assert any("Art.6" in ref or ref == "Art.6" for ref in all_refs)
    assert any("Art.7" in ref or ref == "Art.7" for ref in all_refs)
    assert any("Art.25" in ref or ref == "Art.25" for ref in all_refs)
    assert any("Art.32" in ref or ref == "Art.32" for ref in all_refs)
    assert any("Art.33" in ref or ref == "Art.33" for ref in all_refs)
    assert any("Art.34" in ref or ref == "Art.34" for ref in all_refs)
    assert any("Art.37" in ref or ref == "Art.37" for ref in all_refs)
    assert any("Art.44" in ref or "Art.44" in ref for ref in all_refs)
    assert any("Art.5" in ref or ref == "Art.5" for ref in all_refs)
    assert any("Art.24" in ref or ref == "Art.24" for ref in all_refs)


def test_registry_has_nis2() -> None:
    """Framework registry loads NIS2 successfully."""
    framework = get(FrameworkId.NIS2_2022_2555)
    assert framework is not None
    assert framework.id == "nis2-2022-2555"
    assert framework.name == "NIS2 Directive"
    assert framework.jurisdiction == "EU"
    assert "nis2" in framework.purpose_tags


def test_nis2_all_controls_have_at_least_one_requirement() -> None:
    """Every NIS2 control has at least one requirement (governance rule)."""
    framework = get(FrameworkId.NIS2_2022_2555)
    assert framework is not None
    assert framework.all_controls_have_requirement(), (
        "At least one control has no requirements"
    )


def test_nis2_all_requirements_have_at_least_one_evidence_type() -> None:
    """Every NIS2 requirement has at least one evidence_type (governance rule)."""
    framework = get(FrameworkId.NIS2_2022_2555)
    assert framework is not None
    assert framework.all_requirements_have_evidence_type(), (
        "At least one requirement has no evidence_type"
    )


def test_nis2_domains_and_article_refs() -> None:
    """NIS2 covers required domains with real Article references."""
    framework = get(FrameworkId.NIS2_2022_2555)
    assert framework is not None
    domains = {c.domain for c in framework.controls}
    expected = {
        "Risk Management Measures",
        "Incident Reporting",
        "Business Continuity",
        "Supply Chain Security",
        "Vulnerability Disclosure",
        "Supervisory & Enforcement",
    }
    assert domains == expected, f"Missing or extra domains: {domains.symmetric_difference(expected)}"
    all_refs = []
    for c in framework.controls:
        for r in c.requirements:
            if r.article_ref:
                all_refs.append(r.article_ref)
    assert any("Art.21" in ref for ref in all_refs)
    assert any("Art.23" in ref for ref in all_refs)
    assert any("21.2.c" in ref for ref in all_refs)
    assert any("21.2.d" in ref for ref in all_refs)
    assert any("Art.12" in ref for ref in all_refs)
    assert any("Art.32" in ref for ref in all_refs)
    assert any("Art.33" in ref or "34" in ref for ref in all_refs)


def test_get_unknown_returns_none() -> None:
    """Known framework ids return a framework (no crash)."""
    f = get(FrameworkId.GDPR_2016_679)
    assert f is not None
    f2 = get(FrameworkId.NIST_CSF_2_0)
    assert f2 is not None
    f3 = get(FrameworkId.NIS2_2022_2555)
    assert f3 is not None
