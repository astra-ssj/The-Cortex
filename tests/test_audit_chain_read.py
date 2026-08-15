# tests/test_audit_chain_read.py — the Evidence Vault reads a real hash chain.
#
# The assertion that matters is the one the Evidence Vault UI makes on the user's
# behalf: SHA-256 of the returned preimage equals the stored hash, and every row's
# prev_hash equals the hash before it. Both are recomputed here from scratch with
# hashlib rather than by calling core.audit_fabric, so a change to the hashing
# scheme cannot pass this test by being self-consistent.

from __future__ import annotations

import hashlib
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from api.audit import GENESIS_HASH
from core.security import create_access_token
from core.tenant import set_tenant_context
from db.session import async_session_factory, database_ready, ensure_learning_loop_schema

SCENARIO = "cloud_access_onboarding"


def _headers(org_id: str, sub: str) -> dict[str, str]:
    token = create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@example.com",
            "org_id": org_id,
            "role": "ADMIN",
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
                VALUES (:id, 'Audit Tenant', 'EU', '[]'::jsonb)
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


def _play_a_scenario(client: TestClient, headers: dict[str, str], org_id: str) -> None:
    created = client.post(
        "/api/v1/learning/sessions",
        headers=headers,
        json={"org_id": org_id, "scenario_slug": SCENARIO},
    )
    if created.status_code == 400:
        pytest.skip(f"{SCENARIO} not seeded")
    assert created.status_code == 200, created.text
    session_id = created.json()["id"]

    for _ in range(6):
        state = client.get(f"/api/v1/learning/sessions/{session_id}", headers=headers)
        assert state.status_code == 200, state.text
        body = state.json()
        if body["stage"] == "complete":
            return
        choices = body.get("choices") or []
        if not choices:
            return
        decided = client.post(
            f"/api/v1/learning/sessions/{session_id}/decide",
            headers=headers,
            json={"choice": choices[0]["id"]},
        )
        assert decided.status_code == 200, decided.text


def _entries(client: TestClient, headers: dict[str, str], org_id: str) -> dict[str, Any]:
    listed = client.get(
        f"/api/v1/audit?org_id={org_id}&limit=500",
        headers=headers,
    )
    assert listed.status_code == 200, listed.text
    return listed.json()


@pytest.mark.asyncio
async def test_playing_the_loop_writes_readable_audit_entries(client: TestClient) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-audit-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    headers = _headers(org_id, str(uuid.uuid4()))

    assert _entries(client, headers, org_id)["items"] == []

    _play_a_scenario(client, headers, org_id)

    payload = _entries(client, headers, org_id)
    items = payload["items"]
    assert items, "the learning loop writes audit rows; the read side must surface them"
    assert payload["total"] >= len(items)
    assert any(e["action"].startswith("learning.session") for e in items)
    # Newest first, so the vault's timeline reads top-down.
    assert [e["created_at"] for e in items] == sorted(
        (e["created_at"] for e in items), reverse=True
    )


@pytest.mark.asyncio
async def test_returned_preimage_hashes_to_the_stored_hash(client: TestClient) -> None:
    """
    What the browser does, done here in plain hashlib.

    If this fails, the vault's "INTEGRITY VERIFIED" badge is a lie about untampered
    data — the worse of the two possible bugs, because it trains users to ignore it.
    """
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-audit-hash-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    headers = _headers(org_id, str(uuid.uuid4()))
    _play_a_scenario(client, headers, org_id)

    items = _entries(client, headers, org_id)["items"]
    assert items

    for entry in items:
        digest = hashlib.sha256(entry["hash_material"].encode("utf-8")).hexdigest()
        assert digest == entry["hash"], f"preimage mismatch on {entry['action']}"


@pytest.mark.asyncio
async def test_prev_hash_links_form_an_unbroken_chain(client: TestClient) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-audit-chain-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    headers = _headers(org_id, str(uuid.uuid4()))
    _play_a_scenario(client, headers, org_id)

    payload = _entries(client, headers, org_id)
    items = payload["items"]
    assert len(items) >= 2, "a single row cannot demonstrate a chain"
    assert payload["chain_verified"] is True
    assert payload["genesis_hash"] == GENESIS_HASH

    oldest_first = list(reversed(items))
    for index, entry in enumerate(oldest_first[1:], start=1):
        assert entry["prev_hash"] == oldest_first[index - 1]["hash"]


@pytest.mark.asyncio
async def test_a_tampered_row_breaks_verification(client: TestClient) -> None:
    """
    Tamper-evidence, demonstrated rather than asserted in a docstring.

    audit_log rejects UPDATE by trigger, so the tamper is simulated on the response
    the client verifies — which is exactly the attack the in-browser check defends
    against: a compromised API serving edited history.
    """
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-audit-tamper-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    headers = _headers(org_id, str(uuid.uuid4()))
    _play_a_scenario(client, headers, org_id)

    items = _entries(client, headers, org_id)["items"]
    assert items
    victim = dict(items[-1])
    victim["hash_material"] = victim["hash_material"].replace(
        "learning", "lernaing", 1
    )

    digest = hashlib.sha256(victim["hash_material"].encode("utf-8")).hexdigest()
    assert digest != victim["hash"]


@pytest.mark.asyncio
async def test_audit_entries_are_tenant_isolated(client: TestClient) -> None:
    """audit_log has no RLS policy, so the org predicate is the only guard."""
    if not await database_ready():
        pytest.skip("database not reachable")

    org_a = f"org-audit-a-{uuid.uuid4().hex[:8]}"
    org_b = f"org-audit-b-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_a)
    await _ensure_org(org_b)
    headers_a = _headers(org_a, str(uuid.uuid4()))
    headers_b = _headers(org_b, str(uuid.uuid4()))

    _play_a_scenario(client, headers_a, org_a)
    a_items = _entries(client, headers_a, org_a)["items"]
    assert a_items
    assert _entries(client, headers_b, org_b)["items"] == []

    leaked = client.get(
        f"/api/v1/audit/{a_items[0]['id']}?org_id={org_b}", headers=headers_b
    )
    assert leaked.status_code == 404


@pytest.mark.asyncio
async def test_audit_read_requires_auth(client: TestClient) -> None:
    unauthenticated = client.get("/api/v1/audit")
    assert unauthenticated.status_code in (401, 403)


@pytest.mark.asyncio
async def test_malformed_entry_id_is_a_404_not_a_500(client: TestClient) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-audit-badid-{uuid.uuid4().hex[:8]}"
    await _ensure_org(org_id)
    headers = _headers(org_id, str(uuid.uuid4()))

    r = client.get("/api/v1/audit/not-a-uuid", headers=headers)
    assert r.status_code == 404
