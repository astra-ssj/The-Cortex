from __future__ import annotations

import pytest

from core.scenario_draft import draft_customer_scenario


@pytest.mark.asyncio
async def test_stub_provider_returns_unpublished_validated_scaffold(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "stub")

    draft = await draft_customer_scenario(
        "A supplier asks to postpone notification until the next board meeting.",
        framework="iso27001",
        author="curriculum@example.com",
    )

    assert draft["published"] is False
    assert draft["provider"] == "stub"
    assert draft["scenario"]["id"]
    assert draft["scenario"]["stages"][0]["choices"][0]["is_correct"] is True
