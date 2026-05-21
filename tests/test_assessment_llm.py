# tests/test_assessment_llm.py — Assessment LLM path (stub provider, human review enqueue).

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

pytest.importorskip("sqlalchemy")

from compliance import FrameworkId, get
from core.llm.assessment_schema import AssessmentLLMOutput
from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult
from services.assessment_llm import assess_control_with_llm


@pytest.mark.asyncio
async def test_assess_control_uses_llm_stub_output(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORTEX_LLM_PROVIDERS", "stub")
    monkeypatch.setenv("CORTEX_ASSESSMENT_LLM_ENABLED", "1")

    fw = get(FrameworkId.CYBER_ESSENTIALS_V3_1)
    assert fw is not None
    control = fw.controls[0]
    session = AsyncMock()

    stub_out = AssessmentLLMOutput(
        compliance_status="partial",
        finding="Evidence incomplete for this control.",
        confidence_score=0.62,
        severity="HIGH",
        reference="CE-1",
    )

    async def _fake_complete(req: StructuredCompletionRequest, model: type) -> StructuredCompletionResult:
        return StructuredCompletionResult(
            provider_id="stub",
            model="stub-v1",
            raw_text=stub_out.model_dump_json(),
            usage={},
        )

    with patch("services.assessment_llm.complete_structured", side_effect=_fake_complete):
        result = await assess_control_with_llm(
            session,
            org_id="demo-org-001",
            run_id="run-test-001",
            framework_id=fw.id,
            framework_name=fw.name,
            control=control,
            context={"prompt_context": "Org has partial policies."},
        )

    assert result["status"] == "assessed"
    assert result["llm_provider"] == "stub"
    assert result["confidence"] == 0.62
    session.execute.assert_awaited()


@pytest.mark.asyncio
async def test_assess_control_disabled_returns_demo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORTEX_ASSESSMENT_LLM_ENABLED", "0")
    fw = get(FrameworkId.CYBER_ESSENTIALS_V3_1)
    assert fw is not None
    session = AsyncMock()

    result = await assess_control_with_llm(
        session,
        org_id="demo-org-001",
        run_id="run-test-002",
        framework_id=fw.id,
        framework_name=fw.name,
        control=fw.controls[0],
        context={"prompt_context": "x"},
    )

    assert result["llm_provider"] == "demo"
    session.execute.assert_not_awaited()
