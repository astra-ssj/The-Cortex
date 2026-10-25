from __future__ import annotations

from core.practice_catalog import get_practice_catalog


def test_practice_catalog_is_validated_and_inert() -> None:
    catalog = get_practice_catalog()
    practices = catalog.list()

    assert len(practices) == 15
    assert len({practice.id for practice in practices}) == len(practices)
    assert all(len(practice.content_hash) == 64 for practice in practices)
    assert all(practice.source_release == "v2026.10.19.2" for practice in practices)
    assert all(practice.review_state == "reviewed" for practice in practices)
    assert all(practice.reviewed_by for practice in practices)
    assert all(practice.reviewed_at.tzinfo is not None for practice in practices)

    payload = [practice.model_dump() for practice in practices]
    assert all("content" not in practice for practice in payload)
    assert all("prompt" not in practice for practice in payload)


def test_exactly_fifteen_practices_are_available_with_scenarios() -> None:
    practices = get_practice_catalog().list()

    available = [practice for practice in practices if practice.status == "available"]
    assert len(available) == 15
    assert len({practice.scenario_slug for practice in available}) == 15
    assert all(practice.scenario_slug for practice in available)
    assert not [practice for practice in practices if practice.status == "planned"]
