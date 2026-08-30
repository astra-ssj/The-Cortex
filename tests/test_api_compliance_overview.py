# tests/test_api_compliance_overview.py — GET /api/v1/compliance/overview.
#
# The isolation test is the important one: posture is the org's compliance claim,
# so a leak across tenants is a disclosure of another organisation's audit standing.

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import make_auth_headers

ENDPOINT = "/api/v1/compliance/overview"


def test_overview_requires_auth(client: TestClient) -> None:
    assert client.get(ENDPOINT).status_code in (401, 403)


def test_unknown_framework_is_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get(ENDPOINT, params={"framework": "not-a-framework"}, headers=auth_headers)
    assert r.status_code == 404


def test_overview_shape(
    client: TestClient, auth_headers: dict[str, str], postgres_reachable: bool
) -> None:
    if not postgres_reachable:
        pytest.skip("database not reachable")

    r = client.get(ENDPOINT, headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["framework"] == "iso27001-2022"
    assert body["org_id"] == "demo-org-001"
    assert body["org_label"]
    # SovereignModel contract.
    assert body["jurisdiction"] and isinstance(body["purpose_tags"], list)

    summary = body["summary"]
    assert set(summary) == {
        "controls_assessed",
        "controls_available",
        "average_competency",
        "open_gaps",
    }
    assert summary["controls_assessed"] == len(body["controls"])
    assert summary["controls_available"] >= summary["controls_assessed"]
    assert summary["open_gaps"] == sum(1 for c in body["controls"] if c["status"] == "gap")

    known_refs = {c["ref"] for c in body["controls"]}
    for row in body["not_assessed"]:
        assert row["ref"] not in known_refs, "a control cannot be both assessed and not assessed"


def test_every_control_row_is_named_and_banded(
    client: TestClient, auth_headers: dict[str, str], postgres_reachable: bool
) -> None:
    """A ref with no registry name would render a bare id next to a real score."""
    if not postgres_reachable:
        pytest.skip("database not reachable")

    body = client.get(ENDPOINT, headers=auth_headers).json()
    for row in body["controls"] + body["not_assessed"]:
        assert row["name"] and row["name"] != row["ref"]
    for row in body["controls"]:
        assert row["status"] in {"strong", "developing", "gap"}
        assert 0 <= row["competency"] <= 100


def test_posture_is_scoped_to_the_callers_org(
    client: TestClient, postgres_reachable: bool
) -> None:
    """
    A tenant with no training of its own must see an empty posture, never the
    demo org's. Demo reads are allowed by policy; demo data leaking out is not.
    """
    if not postgres_reachable:
        pytest.skip("database not reachable")

    demo = client.get(ENDPOINT, headers=make_auth_headers("ciso")).json()

    other = client.get(
        ENDPOINT,
        headers=make_auth_headers("admin", org_id="isolation-probe-org", email="probe@cortex.local"),
    )
    assert other.status_code == 200, other.text
    body = other.json()

    assert body["org_id"] == "isolation-probe-org"
    assert body["controls"] == []
    assert body["summary"]["controls_assessed"] == 0
    assert body["summary"]["average_competency"] == 0
    assert body["summary"]["open_gaps"] == 0
    # The scenario catalogue is shared content, so the denominator is the same.
    assert body["summary"]["controls_available"] == demo["summary"]["controls_available"]


def test_fresh_org_reports_the_empty_state_honestly(
    client: TestClient, postgres_reachable: bool
) -> None:
    """Every unexercised control is listed, so the page can show what remains."""
    if not postgres_reachable:
        pytest.skip("database not reachable")

    body = client.get(
        ENDPOINT,
        headers=make_auth_headers("admin", org_id="fresh-org-probe", email="fresh@cortex.local"),
    ).json()

    assert body["summary"]["controls_assessed"] == 0
    assert len(body["not_assessed"]) == body["summary"]["controls_available"]
    assert body["summary"]["controls_available"] > 0
