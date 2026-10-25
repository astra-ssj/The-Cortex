"""Draft a customer scenario without publishing it into the curriculum.

Live providers, including a local Gemma model through Ollama, may supply the
narrative. The deterministic scaffold remains the result when no model is
configured or the model output cannot pass the community scenario validator.
"""

from __future__ import annotations

import json
import re
from typing import Any

from contrib.scenarios.validate_scenario import validate_scenario
from core.agents.model import agent_model_provenance, call_model, resolve_agent_provider

_SLUG = re.compile(r"[^a-z0-9]+")


def _slug(value: str) -> str:
    cleaned = _SLUG.sub("-", value.lower()).strip("-")
    return cleaned[:64] or "customer-scenario"


def _scaffold(brief: str, *, framework: str, author: str) -> dict[str, Any]:
    slug = _slug(brief.split(".")[0])
    return {
        "schema_version": 1,
        "id": slug,
        "title": brief.strip()[:120],
        "summary": (
            "A customer-authored training situation. Decisions stay inside the "
            "practice and do not change organisational systems."
        ),
        "track": "customer-scenarios",
        "difficulty": "practitioner",
        "frameworks": [framework],
        "practice_area": "customer",
        "estimated_minutes": 15,
        "learning_objectives": [
            "Identify the evidence required before accepting the requested action",
            "Escalate the decision to an accountable owner when authority is missing",
        ],
        "provenance": {
            "authors": [author],
            "license": "CC-BY-4.0",
            "source_version": "customer-draft-v1",
        },
        "stages": [
            {
                "id": "decision",
                "sequence": 1,
                "agent_message": brief.strip(),
                "demands": ["State the decision and the evidence it depends on"],
                "choices": [
                    {
                        "id": "evidence_first",
                        "label": "Require attributable evidence before acting",
                        "consequence": "The action waits until the source, owner, and period are recorded.",
                        "is_correct": True,
                        "framework_rationale": "A control decision needs evidence that can be traced to its source.",
                        "risk_outcome": "controlled",
                        "next_stage": None,
                        "dimension_weights": {"judgment": 8, "control_mapping": 8, "evidence": 10, "escalation": 4},
                        "control_refs": [],
                    },
                    {
                        "id": "accept_request",
                        "label": "Accept the request without an evidence check",
                        "consequence": "The requested action proceeds without a retained basis for the decision.",
                        "is_correct": False,
                        "framework_rationale": "Convenience does not establish that the control objective was met.",
                        "risk_outcome": "control_failure",
                        "next_stage": None,
                        "dimension_weights": {"judgment": -8, "control_mapping": -6, "evidence": -10, "escalation": -4},
                        "control_refs": [],
                    },
                ],
            }
        ],
    }


async def draft_customer_scenario(
    brief: str,
    *,
    framework: str,
    author: str,
) -> dict[str, Any]:
    scenario = _scaffold(brief, framework=framework, author=author)
    provenance = agent_model_provenance()
    provider = resolve_agent_provider()
    if provider.provider_id != "stub":
        raw = await call_model(
            "Draft one GRC training situation. Do not claim certification or control effectiveness.",
            {
                "brief": brief,
                "framework": framework,
                "response_contract": (
                    "Respond ONLY as JSON with keys title, summary, agent_message, demand. "
                    "Each value is one plain sentence. No markdown."
                ),
            },
        )
        try:
            generated = json.loads(raw)
        except json.JSONDecodeError:
            generated = {}
        if isinstance(generated, dict):
            title = str(generated.get("title") or "").strip()
            summary = str(generated.get("summary") or "").strip()
            message = str(generated.get("agent_message") or "").strip()
            demand = str(generated.get("demand") or "").strip()
            if title:
                scenario["title"] = title[:120]
                scenario["id"] = _slug(title)
            if summary:
                scenario["summary"] = summary[:1000]
            if message:
                scenario["stages"][0]["agent_message"] = message
            if demand:
                scenario["stages"][0]["demands"] = [demand[:240]]
    validated = validate_scenario(scenario)
    return {
        "scenario": validated,
        "published": False,
        "provider": provenance["provider"],
        "model": provenance["model"],
        "mode": "local_model" if provenance["provider"] == "ollama" else provenance["type"],
    }
