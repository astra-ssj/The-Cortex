from __future__ import annotations

import json
from unittest.mock import Mock

import pytest

from core.agents.model import call_model, log_resolved_agent_provider
from core.offline_personas import OfflinePersonaError, offline_persona_turn
from core.practice_catalog import get_practice_catalog


SCENARIOS = {
    "cloud_access_onboarding": "DevOps Lead",
    "supplier_incident_response": "Supplier Account Manager",
    "change_management_failure": "Engineering Lead",
    "asset_classification_breach": "Junior Security Analyst",
    "ransomware_group_response": "Group SOC Lead",
    "evidence_freshness_audit": "Audit Manager",
    "incident_severity_triage": "Incident Commander",
    "nonconformity_corrective_action": "Process Owner",
    "risk_acceptance_memo": "Business Risk Owner",
    "soa_exclusion_review": "ISMS Manager",
    "audit_sampling_evidence_sufficiency": "Lead Auditor",
    "supplier_due_diligence": "Procurement Director",
    "access_review_exception_handling": "Application Owner",
    "dora_ict_incident_classification_reporting": "Regulatory Incident Lead",
    "ai_control_applicability_escalation": "AI Product Owner",
}


@pytest.mark.parametrize(("scenario", "speaker"), SCENARIOS.items())
def test_fixture_is_scenario_specific(scenario: str, speaker: str) -> None:
    turn = offline_persona_turn(scenario)
    assert turn.fixture_version == "2026.10.1"
    assert turn.scenario == scenario
    assert turn.speaker == speaker
    assert turn.message
    assert turn.demands


def test_every_active_launch_scenario_has_an_exact_persona_fixture() -> None:
    active = {
        practice.scenario_slug
        for practice in get_practice_catalog().list()
        if practice.status == "available"
    }
    assert None not in active
    assert active == set(SCENARIOS)
    assert {
        scenario: offline_persona_turn(scenario).speaker
        for scenario in active
        if scenario is not None
    } == SCENARIOS


@pytest.mark.asyncio
@pytest.mark.parametrize(("scenario", "speaker"), SCENARIOS.items())
async def test_stub_provider_uses_role_correct_fixture_without_generic_fallback(
    scenario: str,
    speaker: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "stub")
    raw = await call_model(
        "unused when a reviewed fixture exists",
        {
            "scenario": scenario,
            "stage": "brief",
            "last_choice": "",
            "situation": "deterministic test",
        },
    )
    assert json.loads(raw)["speaker"] == speaker


def test_fixture_is_deterministic_and_returns_fresh_payloads() -> None:
    first = offline_persona_turn("supplier_incident_response").as_agent_payload()
    second = offline_persona_turn("supplier_incident_response").as_agent_payload()
    assert first == second
    first["demands"].append("mutated by caller")
    assert first != offline_persona_turn("supplier_incident_response").as_agent_payload()


def test_unknown_scenario_fails_closed_without_generic_persona() -> None:
    with pytest.raises(OfflinePersonaError, match="No offline persona fixture"):
        offline_persona_turn("unknown_scenario")


@pytest.mark.parametrize("version", ("../v1", "/tmp", ".hidden"))
def test_invalid_fixture_version_is_rejected(version: str) -> None:
    with pytest.raises(OfflinePersonaError, match="Invalid fixture version"):
        offline_persona_turn("cloud_access_onboarding", version=version)


def test_stub_startup_warning_describes_complete_offline_fixtures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    logger = Mock()
    monkeypatch.setattr("core.agents.model.logger", logger)
    monkeypatch.setenv("MODEL_PROVIDER", "stub")

    log_resolved_agent_provider()

    detail = logger.warning.call_args.kwargs["detail"]
    assert "reviewed deterministic offline persona fixtures" in detail
    assert "will not match" not in detail
