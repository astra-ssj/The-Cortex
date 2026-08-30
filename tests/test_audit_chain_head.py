from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from core.audit_fabric import _org_tail_hash


@pytest.mark.asyncio
async def test_unique_audit_chain_head_is_selected() -> None:
    result = MagicMock()
    result.first.return_value = ("tail-hash", 1)
    session = MagicMock()
    session.execute = AsyncMock(return_value=result)

    assert await _org_tail_hash(session, "org-a") == "tail-hash"


@pytest.mark.asyncio
async def test_forked_audit_chain_continues_deterministic_branch() -> None:
    result = MagicMock()
    result.first.return_value = ("one-of-two-heads", 2)
    session = MagicMock()
    session.execute = AsyncMock(return_value=result)

    assert await _org_tail_hash(session, "org-a") == "one-of-two-heads"
