# core/gaps.py — Turn weak competency dimensions into Control Gap findings.
#
# This is the join that makes CORTEX one product rather than six screens: a
# dimension below the competency floor becomes a row in `findings`, tagged with
# the ISO controls of the scenario that exposed it and with the session that
# produced it. Remediation can then require a retake of that specific scenario,
# and the retake closes the gap here rather than a human ticking a box.
#
# Reconciliation is idempotent and runs on every scenario completion, so a retake
# both re-scores the dimension and settles the gap it created.

from __future__ import annotations

import json
import uuid
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.agents.scenario import Scenario
from core.competency import (
    DIMENSIONS,
    GAP_FLOOR,
    HUMAN_LABELS,
    dimension_score,
    extract_controls,
    has_signal,
)

logger = structlog.get_logger()

# Stable namespace so the same (org, learner, scenario, dimension) always maps to
# the same finding id across retakes. Without this, every attempt would append a
# new gap and the tracker would grow instead of converge.
_GAP_NAMESPACE = uuid.UUID("6f1b9a2e-6d3c-4f19-9d64-2f7a1c8b5e30")

ISO_FRAMEWORK_ID = "iso27001-2022"
ISO_FRAMEWORK_NAME = "ISO/IEC 27001:2022"
GAP_SOURCE = "competency"

STATUS_OPEN = "OPEN"
STATUS_IN_PROGRESS = "IN_PROGRESS"
STATUS_REMEDIATED = "REMEDIATED"

# What each dimension means as a control gap, in the language a GRC reviewer
# would use in an audit finding rather than the language of a training score.
_GAP_TEMPLATES: dict[str, dict[str, Any]] = {
    "control_mapping": {
        "summary": "cannot reliably map an incident to the governing control",
        "required_state": (
            "The reviewer identifies the governing Annex A control for an incident "
            "without prompting, and can state why adjacent controls do not apply."
        ),
        "actions": [
            "Re-read the Annex A controls this scenario exercises",
            "Retake the scenario and justify the control before choosing",
            "Reach the competency floor on control mapping",
        ],
    },
    "evidence": {
        "summary": "takes actions that weaken the evidence available to an auditor",
        "required_state": (
            "Evidence is preserved before remediation begins, and every decision is "
            "supportable from the record alone."
        ),
        "actions": [
            "Review ISO 27001:2022 A.5.28 on collection of evidence",
            "Identify which decisions in the transcript destroyed or bypassed evidence",
            "Retake the scenario preserving the forensic record",
        ],
    },
    "escalation": {
        "summary": "escalates disproportionately — too far, too early, or not at all",
        "required_state": (
            "The right level of authority is engaged for the severity at hand, "
            "neither delegating the decision away nor notifying beyond need."
        ),
        "actions": [
            "Review the incident escalation criteria for this scenario",
            "Compare the chosen escalation path against the reference answer",
            "Retake the scenario and escalate proportionately",
        ],
    },
    "remediation": {
        "summary": "closes incidents without driving a durable corrective action",
        "required_state": (
            "A nonconformity is raised where a control is absent, and remediation "
            "addresses the cause rather than the symptom."
        ),
        "actions": [
            "Review ISO 27001:2022 A.10.1 on nonconformity and corrective action",
            "Distinguish the one-off deviation from the missing control",
            "Retake the scenario and raise the corrective action",
        ],
    },
}


def _severity(score: int) -> str:
    """Distance below the floor, not the raw score — a 59 is not a crisis."""
    if score < 35:
        return "CRITICAL"
    if score < 50:
        return "HIGH"
    return "MEDIUM"


def _priority(score: int) -> str:
    if score < 35:
        return "P0"
    if score < 50:
        return "P1"
    return "P2"


def gap_id(org_id: str, learner_id: str, scenario_slug: str, dimension: str) -> str:
    key = f"{org_id}|{learner_id}|{scenario_slug}|{dimension}"
    return f"gap-{uuid.uuid5(_GAP_NAMESPACE, key)}"


def scenario_controls(content: Scenario) -> list[str]:
    """
    ISO controls the scenario exercises, taken from its authored rationale text.

    Uses every choice rather than only the correct one: the wrong answers are
    where the authors explain which control was breached, and those are exactly
    the controls a learner who chose them needs to revisit.
    """
    blobs: list[str | None] = []
    for stage in content.stages:
        for choice in stage.choices:
            blobs.append(choice.framework_rationale)
    return extract_controls(*blobs)


_UPSERT_SQL = text(
    """
    INSERT INTO findings (
        id, org_id, title, framework, framework_id, control_id, control_name,
        reference, severity, status, owner, priority, entity, entity_code,
        current_state, required_state, actions, completed_actions, notes,
        evidence, controls, source, dimension, scenario_slug, session_id,
        learner_id, competency_score, days_open, confidence, closed_at,
        closed_by_session, updated_at
    ) VALUES (
        :id, :org_id, :title, :framework, :framework_id, :control_id, :control_name,
        :reference, :severity, :status, :owner, :priority, :entity, :entity_code,
        :current_state, :required_state, CAST(:actions AS jsonb),
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, CAST(:controls AS jsonb),
        :source, :dimension, :scenario_slug, CAST(:session_id AS uuid),
        :learner_id, :competency_score, 0, 1.0, NULL, NULL, now()
    )
    ON CONFLICT (id) DO UPDATE SET
        title            = EXCLUDED.title,
        severity         = EXCLUDED.severity,
        priority         = EXCLUDED.priority,
        status           = CASE
                             WHEN findings.status = :remediated THEN :reopened
                             ELSE findings.status
                           END,
        current_state    = EXCLUDED.current_state,
        required_state   = EXCLUDED.required_state,
        actions          = EXCLUDED.actions,
        controls         = EXCLUDED.controls,
        competency_score = EXCLUDED.competency_score,
        session_id       = EXCLUDED.session_id,
        closed_at        = NULL,
        closed_by_session = NULL,
        updated_at       = now()
    RETURNING id
    """
)

# Closing is the retake rule: the dimension is at or above the floor now, so the
# session that achieved that is recorded as what closed the gap.
_CLOSE_SQL = text(
    """
    UPDATE findings
    SET status = :remediated,
        competency_score = :score,
        closed_at = now(),
        closed_by_session = CAST(:session_id AS uuid),
        completed_actions = (
            SELECT COALESCE(jsonb_agg(ordinality - 1), '[]'::jsonb)
            FROM jsonb_array_elements(findings.actions) WITH ORDINALITY
        ),
        updated_at = now()
    WHERE org_id = :org_id
      AND learner_id = :learner_id
      AND scenario_slug = :scenario_slug
      AND dimension = :dimension
      AND source = :source
      AND status <> :remediated
    RETURNING id
    """
)


async def reconcile_gaps_for_session(
    db: AsyncSession,
    *,
    org_id: str,
    learner_id: str,
    session_id: str,
    content: Scenario,
    competency: Any,
) -> dict[str, list[str]]:
    """
    Sync this learner's gaps for this scenario against their latest scores.

    Weak dimensions are opened or refreshed; dimensions now at or above the floor
    close the gap they previously produced, crediting the session that did it.
    Returns {"opened": [...], "closed": [...]} of finding ids.

    Callers must already have bound the tenant context — `findings` forces RLS.
    """
    if not has_signal(competency):
        return {"opened": [], "closed": []}

    controls = scenario_controls(content)
    controls_json = json.dumps(controls)
    control_id = controls[0] if controls else None
    reference = ", ".join(controls) if controls else content.title

    opened: list[str] = []
    closed: list[str] = []

    for dimension in DIMENSIONS:
        score = dimension_score(competency, dimension)
        label = HUMAN_LABELS[dimension]
        template = _GAP_TEMPLATES[dimension]
        params_common = {
            "org_id": org_id,
            "learner_id": learner_id,
            "scenario_slug": content.slug,
            "dimension": dimension,
            "source": GAP_SOURCE,
            "remediated": STATUS_REMEDIATED,
        }

        if score >= GAP_FLOOR:
            result = await db.execute(
                _CLOSE_SQL,
                {**params_common, "score": score, "session_id": session_id},
            )
            closed.extend(str(row[0]) for row in result.fetchall())
            continue

        result = await db.execute(
            _UPSERT_SQL,
            {
                **params_common,
                "id": gap_id(org_id, learner_id, content.slug, dimension),
                "title": f"{label}: {template['summary']} ({content.title})",
                "framework": ISO_FRAMEWORK_NAME,
                "framework_id": ISO_FRAMEWORK_ID,
                "control_id": control_id,
                "control_name": label,
                "reference": reference,
                "severity": _severity(score),
                "status": STATUS_OPEN,
                "owner": learner_id,
                "priority": _priority(score),
                "entity": content.title,
                "entity_code": content.difficulty.upper()[:2] or None,
                "current_state": (
                    f"Scored {score} on {label.lower()} in '{content.title}', "
                    f"below the competency floor of {GAP_FLOOR}."
                ),
                "required_state": template["required_state"],
                "actions": json.dumps(template["actions"]),
                "controls": controls_json,
                "session_id": session_id,
                "competency_score": score,
                "reopened": STATUS_IN_PROGRESS,
            },
        )
        opened.extend(str(row[0]) for row in result.fetchall())

    logger.info(
        "competency_gaps_reconciled",
        org_id=org_id,
        scenario=content.slug,
        opened=len(opened),
        closed=len(closed),
    )
    return {"opened": opened, "closed": closed}
