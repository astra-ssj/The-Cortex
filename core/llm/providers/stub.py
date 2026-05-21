# core/llm/providers/stub.py — Deterministic provider for CI and offline dev.

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel

from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult


class StubLLMProvider:
    provider_id = "stub"

    def is_configured(self) -> bool:
        return True

    async def complete_structured(
        self,
        request: StructuredCompletionRequest,
        response_model: type[BaseModel],
    ) -> StructuredCompletionResult:
        # Honour injectable fixture payload via metadata (tests).
        fixture = request.metadata.get("stub_json")
        if fixture is not None:
            if isinstance(fixture, str):
                payload = json.loads(fixture)
            elif isinstance(fixture, dict):
                payload = fixture
            else:
                payload = json.loads(json.dumps(fixture, default=str))
        elif request.response_schema_name == "control_assessment":
            payload = {
                "compliance_status": "partial",
                "finding": "Stub assessment: control context reviewed; implement formal evidence collection.",
                "confidence_score": 0.82,
                "severity": "MEDIUM",
                "reference": "",
            }
        else:
            payload = {
                "controls": [{"framework_id": "gdpr-2016-679", "control_id": "lawful-basis-consent"}],
                "obligations": [
                    {
                        "jurisdiction": "EU",
                        "purpose_tags": ["ingestion"],
                        "id": "obl-1",
                        "description": "Processing must have a lawful basis",
                        "control_refs": [{"framework_id": "gdpr-2016-679", "control_id": "lawful-basis-consent"}],
                    }
                ],
                "people": [
                    {
                        "jurisdiction": "internal",
                        "purpose_tags": [],
                        "id": "p1",
                        "name": "Document Author",
                        "role": "author",
                    }
                ],
                "systems": [
                    {
                        "jurisdiction": "internal",
                        "purpose_tags": [],
                        "id": "sys1",
                        "name": "Document System",
                        "system_type": "application",
                    }
                ],
                "confidence_score": 0.82,
            }
        validated = response_model.model_validate(payload)
        return StructuredCompletionResult(
            provider_id=self.provider_id,
            model="stub-v1",
            raw_text=validated.model_dump_json(),
            usage={"input_tokens": 0, "output_tokens": 0},
        )

    def status(self) -> dict[str, Any]:
        return {"provider": self.provider_id, "configured": True, "model": "stub-v1"}
