from __future__ import annotations

from fastapi import FastAPI

from api.main import app


def _paths(application: FastAPI) -> set[str]:
    return set(application.openapi()["paths"])


def test_astra_api_exposes_learning_product_routes() -> None:
    paths = _paths(app)

    assert "/health" in paths
    assert "/ready" in paths
    assert "/api/v1/auth/token" in paths
    assert "/api/v1/auth/users" in paths
    assert "/api/v1/learning/scenarios" in paths
    assert "/api/v1/learning/competency" in paths
    assert "/api/v1/skills/practices" in paths
    assert "/api/v1/diagnostic/attempts" in paths
    assert "/api/v1/diagnostic/attempts/{attempt_id}/complete" in paths
    assert "/api/v1/curriculum/practices" in paths
    assert "/api/v1/curriculum/tracks" in paths
    assert "/api/v1/curriculum/me/learning-plan" in paths
    assert "/api/v1/organisations/{org_id}" in paths


def test_cortex_operational_routes_are_not_mounted() -> None:
    paths = _paths(app)

    blocked = {
        "/api/v1/assessments/run",
        "/api/v1/assessments/review-queue",
        "/api/v1/audit",
        "/api/audit/decision",
        "/api/v1/compliance/overview",
        "/api/v1/findings",
        "/api/v1/groups",
        "/api/v1/ingest",
        "/api/v1/system/agent-status",
        "/api/v1/system/ztaip-status",
    }

    assert paths.isdisjoint(blocked)
