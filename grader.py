# grader.py — 100% Pure functional decision evaluator for cybersecurity compliance learning loop.
#
# Constraints:
#   - 100% Pure Functions: NO network calls, NO DB connections, NO LLM calls, NO side effects.
#   - Strict type annotations on all signatures.
#   - Deterministic grading and penalty calculation.

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class GradingResult(BaseModel):
    """Pydantic model representing the four evaluation dimensions of a compliance decision.

    All scores are normalized float values strictly bounded between 0.0 and 1.0 inclusive.
    """

    control_mapping_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Accuracy of the selected cybersecurity control against canonical baseline (0.0 to 1.0)",
    )
    evidence_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Relevance and validity score of selected evidence artifacts (0.0 to 1.0)",
    )
    escalation_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Appropriateness of crisis/incident escalation path with penalty applied (0.0 to 1.0)",
    )
    remediation_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Quality and posture alignment of the chosen remediation actions (0.0 to 1.0)",
    )


def _clamp_score(score: float) -> float:
    """Pure helper to constrain scores strictly between 0.0 and 1.0 with 4-decimal precision."""
    return max(0.0, min(1.0, round(float(score), 4)))


def _has_prior_failed_escalation(decision_history: List[Dict[str, Any]]) -> bool:
    """Determine if decision history contains a prior failed escalation attempt.

    Criteria for a failed escalation:
      1. Action indicates an escalation attempt ('escalate', 'escalation', or matching escalation keys).
      2. Status indicates failure (e.g. correct=False, is_correct=False, status='failed', success=False).
    """
    for entry in decision_history:
        if not isinstance(entry, dict):
            continue

        action = str(
            entry.get("action")
            or entry.get("selected_action")
            or entry.get("selected_escalation")
            or ""
        ).strip().lower()

        # Check if action was an escalation attempt
        is_escalation_attempt = (
            action == "escalate"
            or "escalat" in action
            or entry.get("action_type") == "escalate"
        )

        if not is_escalation_attempt:
            continue

        # Check failure indicators
        is_failed = (
            entry.get("correct") is False
            or entry.get("is_correct") is False
            or entry.get("success") is False
            or entry.get("escalation_success") is False
            or str(entry.get("status", "")).lower() in ("failed", "incorrect", "rejected", "error")
            or (
                entry.get("correct_action") is not None
                and entry.get("action") != entry.get("correct_action")
            )
        )

        if is_failed:
            return True

    return False


def evaluate_decision(
    choice: Dict[str, Any],
    reference_data: Dict[str, Any],
    decision_history: List[Dict[str, Any]],
) -> GradingResult:
    """Pure evaluation function that computes compliance learning loop scores.

    Args:
        choice: Learner's choice payload containing selected options.
        reference_data: Ground-truth reference criteria, correct answers, and lookup score weights.
        decision_history: Chronological list of previous decision records in the session.

    Returns:
        GradingResult with 4 normalized scores in [0.0, 1.0].
    """
    # Defensive copies of incoming structures to guarantee 100% immutability and no side effects
    choice_dict = dict(choice) if isinstance(choice, dict) else {}
    ref_dict = dict(reference_data) if isinstance(reference_data, dict) else {}
    history_list = list(decision_history) if isinstance(decision_history, list) else []

    # --------------------------------------------------------------------------
    # 1. Control Mapping Score
    # Compare choice['selected_control'] against reference_data['correct_control']
    # If they match and are not None/empty -> 1.0, else 0.0
    # --------------------------------------------------------------------------
    selected_control = choice_dict.get("selected_control")
    correct_control = ref_dict.get("correct_control")

    if selected_control is not None and correct_control is not None and selected_control == correct_control:
        control_mapping_score = 1.0
    else:
        control_mapping_score = 0.0

    # --------------------------------------------------------------------------
    # 2. Evidence Score
    # Lookup in reference_data['evidence_scores'] or match reference_data['correct_evidence']
    # --------------------------------------------------------------------------
    selected_evidence = choice_dict.get("selected_evidence") or choice_dict.get("evidence")
    correct_evidence = ref_dict.get("correct_evidence")
    evidence_scores_lookup = ref_dict.get("evidence_scores")

    if isinstance(evidence_scores_lookup, dict) and selected_evidence in evidence_scores_lookup:
        raw_evidence_score = float(evidence_scores_lookup[selected_evidence])
    elif selected_evidence is not None and correct_evidence is not None and selected_evidence == correct_evidence:
        raw_evidence_score = 1.0
    else:
        raw_evidence_score = 0.0

    evidence_score = _clamp_score(raw_evidence_score)

    # --------------------------------------------------------------------------
    # 3. Escalation Score (with 0.2 penalty for prior failed escalation)
    # --------------------------------------------------------------------------
    selected_escalation = (
        choice_dict.get("selected_escalation")
        or choice_dict.get("escalation")
        or choice_dict.get("action")
    )
    correct_escalation = (
        ref_dict.get("correct_escalation")
        or ref_dict.get("correct_action")
    )
    escalation_scores_lookup = ref_dict.get("escalation_scores")

    if isinstance(escalation_scores_lookup, dict) and selected_escalation in escalation_scores_lookup:
        base_escalation_score = float(escalation_scores_lookup[selected_escalation])
    elif (
        selected_escalation is not None
        and correct_escalation is not None
        and selected_escalation == correct_escalation
    ):
        base_escalation_score = 1.0
    else:
        base_escalation_score = 0.0

    # Apply 0.2 penalty if decision_history shows a prior failed escalation attempt
    if _has_prior_failed_escalation(history_list):
        effective_escalation = base_escalation_score - 0.2
    else:
        effective_escalation = base_escalation_score

    escalation_score = _clamp_score(effective_escalation)

    # --------------------------------------------------------------------------
    # 4. Remediation Score
    # Lookup in reference_data['remediation_scores'] or match reference_data['correct_remediation']
    # --------------------------------------------------------------------------
    selected_remediation = (
        choice_dict.get("selected_remediation")
        or choice_dict.get("remediation")
    )
    correct_remediation = ref_dict.get("correct_remediation")
    remediation_scores_lookup = ref_dict.get("remediation_scores")

    if isinstance(remediation_scores_lookup, dict) and selected_remediation in remediation_scores_lookup:
        raw_remediation_score = float(remediation_scores_lookup[selected_remediation])
    elif (
        selected_remediation is not None
        and correct_remediation is not None
        and selected_remediation == correct_remediation
    ):
        raw_remediation_score = 1.0
    else:
        raw_remediation_score = 0.0

    remediation_score = _clamp_score(raw_remediation_score)

    return GradingResult(
        control_mapping_score=control_mapping_score,
        evidence_score=evidence_score,
        escalation_score=escalation_score,
        remediation_score=remediation_score,
    )
