# tests/test_assessment_engine.py — run_assessment_stream events and audit.

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

pytest.importorskip("sqlalchemy")

from compliance import FrameworkId
from services.assessment_engine import run_assessment_stream


def test_run_assessment_stream_yields_run_start_and_run_done() -> None:
    """Stream yields run_start and run_done with runId."""
    session = AsyncMock()

    with patch("services.assessment_engine.get_context_for_control", new_callable=AsyncMock) as m_ctx:
        m_ctx.return_value = {"org": "demo", "control": "test"}
        events: list[dict] = []

        async def collect() -> None:
            async for evt in run_assessment_stream(
                session,
                "org-001",
                [FrameworkId.GDPR],
            ):
                events.append(evt)

        asyncio.run(collect())

    run_start = next((e for e in events if e.get("kind") == "run_start"), None)
    run_done = next((e for e in events if e.get("kind") == "run_done"), None)
    assert run_start is not None
    assert run_done is not None
    assert run_start["runId"] == run_done["runId"]
    assert run_start["organizationId"] == "org-001"
    assert "gdpr" in run_start["frameworkIds"]


def test_run_assessment_stream_yields_framework_start_and_done() -> None:
    """Stream yields framework_start and framework_done per framework."""
    session = AsyncMock()

    with patch("services.assessment_engine.get_context_for_control", new_callable=AsyncMock) as m_ctx:
        m_ctx.return_value = {"context": "test"}
        events: list[dict] = []

        async def collect() -> None:
            async for evt in run_assessment_stream(
                session,
                "org-001",
                [FrameworkId.NIST_CSF],
            ):
                events.append(evt)

        asyncio.run(collect())

    fw_starts = [e for e in events if e.get("kind") == "framework_start"]
    fw_dones = [e for e in events if e.get("kind") == "framework_done"]
    assert len(fw_starts) >= 1
    assert len(fw_dones) >= 1
    assert fw_starts[0]["frameworkId"] == "nist_csf"


def test_run_assessment_stream_unknown_framework_skipped() -> None:
    """Unknown framework id in list is skipped (get returns None)."""
    session = AsyncMock()

    with patch("services.assessment_engine.get") as m_get:
        m_get.return_value = None
        events: list[dict] = []

        async def collect() -> None:
            async for evt in run_assessment_stream(
                session,
                "org-001",
                [FrameworkId.GDPR],
            ):
                events.append(evt)

        asyncio.run(collect())

    run_done = next((e for e in events if e.get("kind") == "run_done"), None)
    assert run_done is not None


def test_run_assessment_stream_emits_control_result() -> None:
    """Stream emits control_context and control_result when context is returned."""
    session = AsyncMock()

    with patch("services.assessment_engine.get_context_for_control", new_callable=AsyncMock) as m_ctx:
        m_ctx.return_value = {"prompt": "demo context"}
        events: list[dict] = []

        async def collect() -> None:
            async for evt in run_assessment_stream(
                session,
                "org-001",
                [FrameworkId.GDPR],
            ):
                events.append(evt)

        asyncio.run(collect())

    control_results = [e for e in events if e.get("kind") == "control_result"]
    control_contexts = [e for e in events if e.get("kind") == "control_context"]
    assert len(control_results) >= 1
    assert len(control_contexts) >= 1
    assert control_results[0]["status"] == "assessed"
