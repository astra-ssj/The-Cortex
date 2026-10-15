# tests/test_grader.py — Comprehensive pytest suite for pure compliance decision grader.

from __future__ import annotations

import copy
from typing import Any, Dict, List

import pytest
from pydantic import ValidationError

from grader import GradingResult, evaluate_decision


# ==============================================================================
# Fixtures
# ==============================================================================

@pytest.fixture
def canonical_reference_data() -> Dict[str, Any]:
    return {
        "correct_control": "ISO-27001-A.8.8",
        "correct_evidence": "vuln_scan_report_q3.pdf",
        "correct_escalation": "notify_secops_lead",
        "correct_remediation": "patch_within_14_days",
    }


@pytest.fixture
def perfect_choice() -> Dict[str, Any]:
    return {
        "selected_control": "ISO-27001-A.8.8",
        "selected_evidence": "vuln_scan_report_q3.pdf",
        "selected_escalation": "notify_secops_lead",
        "selected_remediation": "patch_within_14_days",
    }


# ==============================================================================
# 1. Bounds & Edge Cases Tests
# ==============================================================================

def test_perfect_choice_returns_all_maximum_scores(
    perfect_choice: Dict[str, Any],
    canonical_reference_data: Dict[str, Any],
):
    """A perfect choice with clean history must yield 1.0 across all four grading dimensions."""
    result = evaluate_decision(
        choice=perfect_choice,
        reference_data=canonical_reference_data,
        decision_history=[],
    )

    assert isinstance(result, GradingResult)
    assert result.control_mapping_score == 1.0
    assert result.evidence_score == 1.0
    assert result.escalation_score == 1.0
    assert result.remediation_score == 1.0


def test_completely_wrong_choice_returns_all_zero_scores(canonical_reference_data: Dict[str, Any]):
    """A choice where every dimension is mismatched must yield 0.0 across all four dimensions."""
    wrong_choice = {
        "selected_control": "WRONG-CONTROL",
        "selected_evidence": "unrelated_document.txt",
        "selected_escalation": "ignore_alert",
        "selected_remediation": "do_nothing",
    }

    result = evaluate_decision(
        choice=wrong_choice,
        reference_data=canonical_reference_data,
        decision_history=[],
    )

    assert result.control_mapping_score == 0.0
    assert result.evidence_score == 0.0
    assert result.escalation_score == 0.0
    assert result.remediation_score == 0.0


def test_malformed_choice_empty_dict(canonical_reference_data: Dict[str, Any]):
    """An empty choice dictionary must evaluate safely without raising exceptions, returning 0.0."""
    result = evaluate_decision(
        choice={},
        reference_data=canonical_reference_data,
        decision_history=[],
    )

    assert isinstance(result, GradingResult)
    assert result.control_mapping_score == 0.0
    assert result.evidence_score == 0.0
    assert result.escalation_score == 0.0
    assert result.remediation_score == 0.0


def test_malformed_choice_with_none_and_missing_keys():
    """Choice payload with None values and lacking expected keys evaluates gracefully."""
    choice = {
        "selected_control": None,
        "unexpected_key": 12345,
    }
    ref = {
        "correct_control": "NIST-CSF-PR.AC-1",
    }

    result = evaluate_decision(choice, ref, [])
    assert result.control_mapping_score == 0.0
    assert result.evidence_score == 0.0
    assert result.escalation_score == 0.0
    assert result.remediation_score == 0.0


def test_malformed_reference_data_empty():
    """Empty reference data must evaluate safely without crashing."""
    choice = {
        "selected_control": "NIST-800-53-AC-2",
        "selected_evidence": "audit_logs.csv",
    }
    result = evaluate_decision(choice, {}, [])

    assert result.control_mapping_score == 0.0
    assert result.evidence_score == 0.0
    assert result.escalation_score == 0.0
    assert result.remediation_score == 0.0


# ==============================================================================
# 2. Escalation Penalty Logic Tests
# ==============================================================================

def test_escalation_penalty_applied_on_prior_failed_escalation(
    perfect_choice: Dict[str, Any],
    canonical_reference_data: Dict[str, Any],
):
    """Prior failed escalation in history applies a strict 0.2 penalty (1.0 -> 0.8)."""
    history_with_failed_escalation = [
        {"action": "investigate", "correct": True},
        {"action": "escalate", "correct": False, "status": "failed"},
    ]

    result = evaluate_decision(
        choice=perfect_choice,
        reference_data=canonical_reference_data,
        decision_history=history_with_failed_escalation,
    )

    assert result.control_mapping_score == 1.0
    assert result.evidence_score == 1.0
    assert result.escalation_score == 0.8  # 1.0 - 0.2 penalty
    assert result.remediation_score == 1.0


def test_escalation_penalty_clamps_at_zero():
    """Penalty on a 0.0 base score must be clamped at 0.0 and never become negative."""
    wrong_escalation_choice = {
        "selected_control": "ISO-27001-A.8.8",
        "selected_escalation": "wrong_path",
    }
    ref = {
        "correct_control": "ISO-27001-A.8.8",
        "correct_escalation": "notify_secops_lead",
    }
    history = [
        {"action": "escalate", "is_correct": False},
    ]

    result = evaluate_decision(wrong_escalation_choice, ref, history)
    assert result.escalation_score == 0.0


def test_no_penalty_when_prior_escalation_was_successful(
    perfect_choice: Dict[str, Any],
    canonical_reference_data: Dict[str, Any],
):
    """Prior successful escalation does NOT incur the 0.2 penalty."""
    history = [
        {"action": "escalate", "correct": True, "status": "approved"},
    ]

    result = evaluate_decision(perfect_choice, canonical_reference_data, history)
    assert result.escalation_score == 1.0


def test_no_penalty_when_prior_failed_action_was_not_an_escalation(
    perfect_choice: Dict[str, Any],
    canonical_reference_data: Dict[str, Any],
):
    """Prior failure in a non-escalation action (e.g. remediation) must not penalize escalation score."""
    history = [
        {"action": "remediate_firewall", "correct": False},
    ]

    result = evaluate_decision(perfect_choice, canonical_reference_data, history)
    assert result.escalation_score == 1.0


# ==============================================================================
# 3. Pure Function & Immutability Verification
# ==============================================================================

def test_evaluate_decision_is_pure_and_does_not_mutate_inputs(
    perfect_choice: Dict[str, Any],
    canonical_reference_data: Dict[str, Any],
):
    """Pure function guarantee: inputs are never mutated in-place."""
    choice_before = copy.deepcopy(perfect_choice)
    ref_before = copy.deepcopy(canonical_reference_data)
    history = [{"action": "escalate", "correct": False}]
    history_before = copy.deepcopy(history)

    result_1 = evaluate_decision(perfect_choice, canonical_reference_data, history)
    result_2 = evaluate_decision(perfect_choice, canonical_reference_data, history)

    # Identical deterministic results
    assert result_1 == result_2

    # Inputs must remain completely unmodified
    assert perfect_choice == choice_before
    assert canonical_reference_data == ref_before
    assert history == history_before


def test_grader_module_has_zero_external_network_or_db_dependencies():
    """Verify that grader.py strictly imports only typing and pydantic, with zero DB/network/LLM libraries."""
    import inspect
    import grader

    source = inspect.getsource(grader)
    forbidden_tokens = [
        "asyncpg",
        "sqlalchemy",
        "redis",
        "httpx",
        "requests",
        "aiohttp",
        "openai",
        "anthropic",
        "urllib.request",
    ]
    for token in forbidden_tokens:
        assert token not in source, f"Forbidden dependency '{token}' found in grader.py source code"


# ==============================================================================
# 4. Pydantic Model Validation
# ==============================================================================

def test_grading_result_pydantic_bounds_validation():
    """GradingResult enforces bounds: values < 0.0 or > 1.0 raise ValidationError."""
    with pytest.raises(ValidationError):
        GradingResult(
            control_mapping_score=-0.1,
            evidence_score=0.5,
            escalation_score=0.5,
            remediation_score=0.5,
        )

    with pytest.raises(ValidationError):
        GradingResult(
            control_mapping_score=1.1,
            evidence_score=0.5,
            escalation_score=0.5,
            remediation_score=0.5,
        )


# ==============================================================================
# 5. Parameterized Multi-Trajectory Determinism (5+ Trajectories)
# ==============================================================================

@pytest.mark.parametrize(
    "trajectory_name, choice, reference_data, decision_history, expected_scores",
    [
        # Trajectory 1: Flawless Onboarding Flow
        (
            "flawless_onboarding_trajectory",
            {
                "selected_control": "NIST-CSF-ID.AM-1",
                "selected_evidence": "asset_inventory.json",
                "selected_escalation": "delegate_to_asset_owner",
                "selected_remediation": "tag_unmanaged_cloud_assets",
            },
            {
                "correct_control": "NIST-CSF-ID.AM-1",
                "correct_evidence": "asset_inventory.json",
                "correct_escalation": "delegate_to_asset_owner",
                "correct_remediation": "tag_unmanaged_cloud_assets",
            },
            [],
            (1.0, 1.0, 1.0, 1.0),
        ),
        # Trajectory 2: Premature False-Alarm Escalation Penalty
        (
            "premature_escalation_trajectory",
            {
                "selected_control": "GDPR-Art-33",
                "selected_evidence": "breach_timeline_log.csv",
                "selected_escalation": "notify_dpa_supervisory_authority",
                "selected_remediation": "contain_compromised_bucket",
            },
            {
                "correct_control": "GDPR-Art-33",
                "correct_evidence": "breach_timeline_log.csv",
                "correct_escalation": "notify_dpa_supervisory_authority",
                "correct_remediation": "contain_compromised_bucket",
            },
            [
                {"step": 1, "action": "escalate", "status": "failed", "correct": False},
            ],
            (1.0, 1.0, 0.8, 1.0),
        ),
        # Trajectory 3: Weighted Dictionary Lookup Table
        (
            "weighted_lookup_trajectory",
            {
                "selected_control": "SOC2-CC6.3",
                "selected_evidence": "okta_admin_export.csv",
                "selected_escalation": "schedule_emergency_uar",
                "selected_remediation": "revoke_orphaned_credentials",
            },
            {
                "correct_control": "SOC2-CC6.3",
                "evidence_scores": {
                    "okta_admin_export.csv": 0.85,
                    "manual_spreadsheet.xlsx": 0.30,
                },
                "escalation_scores": {
                    "schedule_emergency_uar": 0.90,
                    "pagerduty_director": 0.40,
                },
                "remediation_scores": {
                    "revoke_orphaned_credentials": 0.95,
                    "send_email_reminder": 0.20,
                },
            },
            [],
            (1.0, 0.85, 0.90, 0.95),
        ),
        # Trajectory 4: Catastrophic Wrong Choice with Previous Failure
        (
            "catastrophic_failure_trajectory",
            {
                "selected_control": "RANDOM-WRONG-CONTROL",
                "selected_evidence": "corrupted_file.bin",
                "selected_escalation": "panic_and_delete_logs",
                "selected_remediation": "disable_all_firewalls",
            },
            {
                "correct_control": "DORA-Art-9",
                "correct_evidence": "bcp_dr_drill_report.pdf",
                "correct_escalation": "convene_crisis_management_team",
                "correct_remediation": "failover_to_standby_region",
            },
            [
                {"step": 1, "action": "escalate", "correct": False},
                {"step": 2, "action": "remediate", "correct": False},
            ],
            (0.0, 0.0, 0.0, 0.0),
        ),
        # Trajectory 5: Successful Escalation in History (No Penalty) with Partial Match
        (
            "successful_prior_escalation_trajectory",
            {
                "selected_control": "HIPAA-164.312",
                "selected_evidence": "tls_1_3_cipher_audit.json",
                "selected_escalation": "engage_hipaa_privacy_officer",
                "selected_remediation": "wrong_remediation_choice",
            },
            {
                "correct_control": "HIPAA-164.312",
                "correct_evidence": "tls_1_3_cipher_audit.json",
                "correct_escalation": "engage_hipaa_privacy_officer",
                "correct_remediation": "enforce_aes_gcm_at_rest",
            },
            [
                {"step": 1, "action": "escalate", "correct": True, "status": "approved"},
            ],
            (1.0, 1.0, 1.0, 0.0),
        ),
    ],
)
def test_decision_trajectories_determinism(
    trajectory_name: str,
    choice: Dict[str, Any],
    reference_data: Dict[str, Any],
    decision_history: List[Dict[str, Any]],
    expected_scores: tuple[float, float, float, float],
):
    """Prove determinism across multiple diverse learning loop decision trajectories."""
    # Execute 3 consecutive times to prove mathematical determinism
    for _ in range(3):
        res = evaluate_decision(choice, reference_data, decision_history)

        assert res.control_mapping_score == expected_scores[0], f"Failed on {trajectory_name}"
        assert res.evidence_score == expected_scores[1], f"Failed on {trajectory_name}"
        assert res.escalation_score == expected_scores[2], f"Failed on {trajectory_name}"
        assert res.remediation_score == expected_scores[3], f"Failed on {trajectory_name}"
