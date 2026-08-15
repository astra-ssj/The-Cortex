# tests/test_gaps_from_competency.py — Control Gaps are derived from learning outcomes.
#
# The behaviour under test is the join that makes the product coherent: finishing a
# scenario badly raises gaps tagged with that scenario's ISO controls, and retaking
# it well closes them. Before this, Control Gaps served twelve hardcoded GDPR/NIS2
# rows that no learner action could ever change.

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from core.competency import GAP_FLOOR
from core.security import create_access_token
from core.tenant import set_tenant_context
from db.session import async_session_factory, database_ready, ensure_learning_loop_schema

# Two wrong answers: every dimension ends below the floor.
FAILING_PATH = ["notify_authority_immediately", "defer_pending_forensics"]
# Both reference answers: every dimension ends at or above it.
PASSING_PATH = ["invoke_supplier_contract", "notify_authority_assess_subjects"]
SCENARIO = "supplier_incident_response"


def _headers(org_id: str, sub: str, *, role: str = "ADMIN") -> dict[str, str]:
    token = create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@example.com",
            "org_id": org_id,
            "role": role,
            "onboarding_complete": True,
            "onboarding_step": 5,
        }
    )
    return {"Authorization": f"Bearer {token}"}


async def _ensure_org(org_id: str) -> None:
    async with async_session_factory() as session:
        await set_tenant_context(session, org_id)
        await session.execute(
            text(
                """
                INSERT INTO organizations (id, name, jurisdiction, purpose_tags)
                VALUES (:id, 'Gap Tenant', 'EU', '[]'::jsonb)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": org_id},
        )
        await session.commit()


@pytest.fixture(autouse=True)
async def _schema() -> None:
    if await database_ready():
        await ensure_learning_loop_schema()


def _run_scenario(
    client: TestClient,
    headers: dict[str, str],
    org_id: str,
    path: list[str],
) -> dict[str, Any]:
    created = client.post(
        "/api/v1/learning/sessions",
        headers=headers,
        json={"org_id": org_id, "scenario_slug": SCENARIO},
    )
    if created.status_code == 400:
        pytest.skip(f"{SCENARIO} not seeded")
    assert created.status_code == 200, created.text
    session_id = created.json()["id"]

    body: dict[str, Any] = {}
    for choice in path:
        decided = client.post(
            f"/api/v1/learning/sessions/{session_id}/decide",
            headers=headers,
            json={"choice": choice},
        )
        assert decided.status_code == 200, decided.text
        body = decided.json()
    assert body["stage"] == "complete"
    return body


def _gaps(client: TestClient, headers: dict[str, str], org_id: str) -> list[dict[str, Any]]:
    listed = client.get(
        f"/api/v1/findings?org_id={org_id}&source=competency&limit=200",
        headers=headers,
    )
    assert listed.status_code == 200, listed.text
    return listed.json()["items"]


@pytest.mark.asyncio
async def test_failing_a_scenario_raises_gaps_tagged_with_its_iso_controls(
    client: TestClient,
) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-gap-raise-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    sub = str(uuid.uuid4())
    headers = _headers(org_id, sub)

    # A fresh org starts with no gaps: the screen fills up from learner action.
    assert _gaps(client, headers, org_id) == []

    result = _run_scenario(client, headers, org_id, FAILING_PATH)
    weak = [
        dim
        for dim, payload in result["competency"].items()
        if int(payload["score"]) < GAP_FLOOR
    ]
    assert weak, "failing path should leave dimensions below the floor"

    gaps = _gaps(client, headers, org_id)
    assert {g["dimension"] for g in gaps} == set(weak)

    for gap in gaps:
        assert gap["source"] == "competency"
        assert gap["scenario_slug"] == SCENARIO
        assert gap["learner_id"] == sub
        assert gap["session_id"]
        assert gap["framework_id"] == "iso27001-2022"
        assert gap["status"] == "OPEN"
        assert int(gap["competency_score"]) < GAP_FLOOR
        # The controls must come from the scenario the learner actually ran, not
        # from an unrelated framework fixture.
        assert gap["controls"], "gap carries no ISO control mapping"
        assert all(c.startswith(("A.", "Clause ")) for c in gap["controls"])
        assert gap["actions"], "a gap with no actions cannot be worked off"


@pytest.mark.asyncio
async def test_competency_gap_cannot_be_closed_by_hand(client: TestClient) -> None:
    """Self-certification would void the whole competency claim."""
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-gap-manual-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    headers = _headers(org_id, str(uuid.uuid4()))

    _run_scenario(client, headers, org_id, FAILING_PATH)
    gaps = _gaps(client, headers, org_id)
    assert gaps
    target = gaps[0]["id"]

    refused = client.patch(
        f"/api/v1/findings/{target}?org_id={org_id}",
        headers=headers,
        json={"status": "REMEDIATED"},
    )
    assert refused.status_code == 409
    # The refusal has to say what to do instead, or it is just a locked door.
    message = refused.json()["error"]["message"]
    assert SCENARIO in message
    assert "Retake" in message

    # Progress notes and ownership are still editable — only closure is gated.
    allowed = client.patch(
        f"/api/v1/findings/{target}?org_id={org_id}",
        headers=headers,
        json={"status": "IN_PROGRESS", "note_append": "Re-reading A.5.20."},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["status"] == "IN_PROGRESS"
    assert allowed.json()["notes"][0]["text"] == "Re-reading A.5.20."


@pytest.mark.asyncio
async def test_retaking_the_scenario_closes_the_gap_it_produced(
    client: TestClient,
) -> None:
    """This is the loop: Remediation hands back to Train, and Train settles it."""
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-gap-retake-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    sub = str(uuid.uuid4())
    headers = _headers(org_id, sub)

    _run_scenario(client, headers, org_id, FAILING_PATH)
    opened = _gaps(client, headers, org_id)
    assert opened
    opened_ids = {g["id"] for g in opened}

    _run_scenario(client, headers, org_id, PASSING_PATH)
    after = _gaps(client, headers, org_id)

    # Retaking updates the same rows rather than appending a second set.
    assert {g["id"] for g in after} == opened_ids
    assert all(g["status"] == "REMEDIATED" for g in after), [
        (g["dimension"], g["status"], g["competency_score"]) for g in after
    ]
    for gap in after:
        assert gap["closed_at"]
        assert gap["closed_by_session"]
        assert int(gap["competency_score"]) >= GAP_FLOOR
        # Closing credits every action, so the tracker shows the work as done.
        assert len(gap["completed_actions"]) == len(gap["actions"])


@pytest.mark.asyncio
async def test_only_the_scenario_that_raised_the_gap_closes_it(
    client: TestClient,
) -> None:
    """
    Passing a different scenario must not settle this scenario's gap.

    Without this, "close a gap by retaking" degrades into "close a gap by playing
    anything easy", which is the same self-certification the manual close blocks.
    """
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-gap-other-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    headers = _headers(org_id, str(uuid.uuid4()))

    _run_scenario(client, headers, org_id, FAILING_PATH)
    raised = _gaps(client, headers, org_id)
    assert raised
    open_ids = {g["id"] for g in raised}

    # Play a different scenario well. Its own dimensions may pass, but the gaps
    # attributed to SCENARIO must stay open.
    other = client.post(
        "/api/v1/learning/sessions",
        headers=headers,
        json={"org_id": org_id, "scenario_slug": "cloud_access_onboarding"},
    )
    if other.status_code == 400:
        pytest.skip("cloud_access_onboarding not seeded")
    other_id = other.json()["id"]
    for _ in range(6):
        state = client.get(f"/api/v1/learning/sessions/{other_id}", headers=headers).json()
        if state["stage"] == "complete":
            break
        choices = state.get("choices") or []
        if not choices:
            break
        client.post(
            f"/api/v1/learning/sessions/{other_id}/decide",
            headers=headers,
            json={"choice": choices[0]["id"]},
        )

    still_open = {
        g["id"] for g in _gaps(client, headers, org_id) if g["scenario_slug"] == SCENARIO
    }
    assert open_ids <= still_open
    for gap in _gaps(client, headers, org_id):
        if gap["id"] in open_ids:
            assert gap["status"] != "REMEDIATED"


@pytest.mark.asyncio
async def test_another_learner_retaking_does_not_close_your_gap(
    client: TestClient,
) -> None:
    """Competency is per person; gaps are keyed on (org, learner, scenario, dimension)."""
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-gap-peer-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    mine = str(uuid.uuid4())
    theirs = str(uuid.uuid4())

    _run_scenario(client, _headers(org_id, mine), org_id, FAILING_PATH)
    my_gaps = _gaps(client, _headers(org_id, mine), org_id)
    assert my_gaps
    my_ids = {g["id"] for g in my_gaps}

    _run_scenario(client, _headers(org_id, theirs), org_id, PASSING_PATH)

    after = {g["id"]: g for g in _gaps(client, _headers(org_id, mine), org_id)}
    for gap_id in my_ids:
        assert after[gap_id]["status"] != "REMEDIATED"
        assert after[gap_id]["learner_id"] == mine


@pytest.mark.asyncio
async def test_a_failed_retake_reopens_a_previously_closed_gap(
    client: TestClient,
) -> None:
    """Competency is not a ratchet — losing it has to be visible."""
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-gap-reopen-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    headers = _headers(org_id, str(uuid.uuid4()))

    _run_scenario(client, headers, org_id, FAILING_PATH)
    _run_scenario(client, headers, org_id, PASSING_PATH)
    closed = _gaps(client, headers, org_id)
    assert closed and all(g["status"] == "REMEDIATED" for g in closed)

    _run_scenario(client, headers, org_id, FAILING_PATH)
    reopened = {g["id"]: g for g in _gaps(client, headers, org_id)}
    for gap in closed:
        again = reopened[gap["id"]]
        assert again["status"] == "IN_PROGRESS", "a reopened gap should not read as new"
        assert again["closed_at"] is None
        assert again["closed_by_session"] is None


@pytest.mark.asyncio
async def test_gaps_are_tenant_isolated(client: TestClient) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    org_a = f"org-gap-a-{uuid.uuid4().hex[:8]}"
    org_b = f"org-gap-b-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_a)
    await _ensure_org(org_b)
    headers_a = _headers(org_a, str(uuid.uuid4()))
    headers_b = _headers(org_b, str(uuid.uuid4()))

    _run_scenario(client, headers_a, org_a, FAILING_PATH)
    assert _gaps(client, headers_a, org_a)
    assert _gaps(client, headers_b, org_b) == []
