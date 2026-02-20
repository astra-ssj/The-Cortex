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


# ---- Compliance posture (matches frontend src/types/compliance.ts) ----


class ControlPosture(BaseModel):
    """Per-control posture. JSON keys camelCase to match TypeScript CompliancePosture."""

    controlId: str = Field(..., serialization_alias="controlId")
    controlName: str = Field(..., serialization_alias="controlName")
    status: str = Field(..., serialization_alias="status")  # compliant | partial | non_compliant | not_assessed
    lastAssessedAt: str | None = Field(None, serialization_alias="lastAssessedAt")
    findingSummary: str | None = Field(None, serialization_alias="findingSummary")

    model_config = {"populate_by_name": True}


class FrameworkPosture(BaseModel):
    frameworkId: str = Field(..., serialization_alias="frameworkId")
    frameworkName: str = Field(..., serialization_alias="frameworkName")
    controlCount: int = Field(..., serialization_alias="controlCount")
    controls: list[ControlPosture] = Field(default_factory=list, serialization_alias="controls")

    model_config = {"populate_by_name": True}


class CompliancePosture(BaseModel):
    """Organisation compliance posture. Matches TypeScript CompliancePosture."""

    organisationId: str = Field(..., serialization_alias="organisationId")
    organisationName: str = Field(..., serialization_alias="organisationName")
    frameworks: list[FrameworkPosture] = Field(default_factory=list, serialization_alias="frameworks")
    updatedAt: str = Field(..., serialization_alias="updatedAt")

    model_config = {"populate_by_name": True}
