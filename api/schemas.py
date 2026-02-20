# api/schemas.py — Pydantic response models for frameworks API.

from __future__ import annotations

from pydantic import BaseModel, Field


class FrameworkSummary(BaseModel):
    """Summary of a framework for list view."""

    id: str
    name: str
    version: str
    jurisdiction: str
    purpose_tags: list[str] = Field(default_factory=list)
    control_count: int


class EvidenceTypeOut(BaseModel):
    id: str
    name: str
    description: str = ""


class RequirementOut(BaseModel):
    id: str
    article_ref: str = ""
    description: str
    evidence_types: list[EvidenceTypeOut] = Field(default_factory=list)


class ControlOut(BaseModel):
    id: str
    name: str
    domain: str = ""
    requirements: list[RequirementOut] = Field(default_factory=list)


class FrameworkDetail(BaseModel):
    """Full framework with all controls for detail view."""

    id: str
    name: str
    version: str
    jurisdiction: str
    purpose_tags: list[str] = Field(default_factory=list)
    controls: list[ControlOut] = Field(default_factory=list)


class PaginatedControls(BaseModel):
    """Paginated list of controls with total count."""

    items: list[ControlOut]
    total: int
    page: int
    page_size: int
