"""Validated, inert curriculum catalog for Astra GRC.

The upstream Agent Skills files are instruction-bearing supply-chain content.
Astra never loads those files into a model prompt. This catalog contains only
reviewed metadata and learning objectives that the curriculum adapter can expose.
"""

from __future__ import annotations

import json
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from core.governance import SovereignModel
from core.practice_quality import audit_catalog

PRACTICE_CATALOG_PATH = (
    Path(__file__).resolve().parent.parent / "content" / "practices" / "index.json"
)
QUALITY_SCENARIOS_PATH = (
    Path(__file__).resolve().parent.parent
    / "content"
    / "practices"
    / "scenarios_v1_1.json"
)
QUALITY_FIXTURES_PATH = (
    Path(__file__).resolve().parent.parent
    / "content"
    / "practices"
    / "evaluation_fixtures_v2.json"
)

PracticeStatus = Literal["available", "planned"]
ReviewState = Literal["candidate", "adapted", "reviewed"]
Difficulty = Literal["foundation", "practitioner", "expert"]


class PracticeCatalogEntry(SovereignModel):
    """One safe curriculum projection of an upstream GRC skill."""

    id: str = Field(..., min_length=1, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    title: str = Field(..., min_length=1, max_length=120)
    summary: str = Field(..., min_length=1, max_length=360)
    category: str = Field(..., min_length=1, max_length=80)
    frameworks: list[str] = Field(default_factory=list, min_length=1)
    tags: list[str] = Field(default_factory=list)
    difficulty: Difficulty
    estimated_minutes: int = Field(..., ge=1, le=180)
    target_dimensions: list[str] = Field(default_factory=list, min_length=1)
    learning_objectives: list[str] = Field(default_factory=list, min_length=1)
    status: PracticeStatus
    scenario_slug: str | None = None
    source_repository: str
    source_release: str
    source_commit: str = Field(..., pattern=r"^[0-9a-f]{40}$")
    source_path: str
    content_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    license: str
    author: str
    review_state: ReviewState
    reviewed_by: str = Field(..., min_length=1)
    reviewed_at: datetime
    quality_standard_version: str
    quality_score: int = Field(..., ge=0, le=100)
    quality_findings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid", "frozen": True}

    @model_validator(mode="after")
    def available_practice_has_scenario(self) -> PracticeCatalogEntry:
        if self.status == "available" and not self.scenario_slug:
            raise ValueError("available practices require a scenario_slug")
        if self.status == "planned" and self.scenario_slug:
            raise ValueError("planned practices cannot advertise a scenario_slug")
        return self


class _CatalogFile(BaseModel):
    catalog_version: str
    source_repository: str
    source_release: str
    source_commit: str
    license: str
    practices: list[dict[str, object]]

    model_config = {"extra": "forbid"}


class PracticeCatalog:
    """Read-only catalog; runtime skill instructions are intentionally absent."""

    def __init__(self, path: Path = PRACTICE_CATALOG_PATH) -> None:
        raw = json.loads(path.read_text(encoding="utf-8"))
        document = _CatalogFile.model_validate(raw)
        scenarios = json.loads(QUALITY_SCENARIOS_PATH.read_text(encoding="utf-8"))
        fixtures = json.loads(QUALITY_FIXTURES_PATH.read_text(encoding="utf-8"))
        quality = {
            report.practice_id: report
            for report in audit_catalog(
                list(document.practices),
                list(scenarios["scenarios"]),
                list(fixtures["paths"]),
            )
        }
        self.version = document.catalog_version
        self._entries = tuple(
            PracticeCatalogEntry.model_validate(
                {
                    **entry,
                    "source_repository": document.source_repository,
                    "source_release": document.source_release,
                    "source_commit": document.source_commit,
                    "license": document.license,
                    "quality_standard_version": quality[
                        str(entry["id"])
                    ].standard_version,
                    "quality_score": quality[str(entry["id"])].score,
                    "quality_findings": [
                        finding.code for finding in quality[str(entry["id"])].findings
                    ],
                }
            )
            for entry in document.practices
        )
        ids = [entry.id for entry in self._entries]
        if len(ids) != len(set(ids)):
            raise ValueError("practice catalog contains duplicate ids")

    def list(self) -> list[PracticeCatalogEntry]:
        return list(self._entries)

    def get(self, practice_id: str) -> PracticeCatalogEntry | None:
        return next((entry for entry in self._entries if entry.id == practice_id), None)


@lru_cache(maxsize=1)
def get_practice_catalog() -> PracticeCatalog:
    return PracticeCatalog()
