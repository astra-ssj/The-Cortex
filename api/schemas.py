# api/schemas.py — Pydantic response models for frameworks API.

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


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

    model_config = ConfigDict(serialize_by_alias=True)

    control_id: str = Field(..., serialization_alias="controlId")
    control_name: str = Field(..., serialization_alias="controlName")
    status: str = Field(..., serialization_alias="status")  # compliant | partial | non_compliant | not_assessed
    last_assessed_at: Optional[str] = Field(None, serialization_alias="lastAssessedAt")
    finding_summary: Optional[str] = Field(None, serialization_alias="findingSummary")


class FrameworkPosture(BaseModel):
    model_config = ConfigDict(serialize_by_alias=True)

    framework_id: str = Field(..., serialization_alias="frameworkId")
    framework_name: str = Field(..., serialization_alias="frameworkName")
    control_count: int = Field(..., serialization_alias="controlCount")
    controls: list[ControlPosture] = Field(default_factory=list, serialization_alias="controls")


class CompliancePosture(BaseModel):
    """Organisation compliance posture. Matches TypeScript CompliancePosture."""

    model_config = ConfigDict(serialize_by_alias=True)

    organisation_id: str = Field(..., serialization_alias="organisationId")
    organisation_name: str = Field(..., serialization_alias="organisationName")
    frameworks: list[FrameworkPosture] = Field(default_factory=list, serialization_alias="frameworks")
    updated_at: str = Field(..., serialization_alias="updatedAt")
