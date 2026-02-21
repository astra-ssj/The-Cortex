# api/schemas.py — Pydantic response models for frameworks API.

from __future__ import annotations

from typing import Any, Optional

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
    # Real posture fields (from PostureCalculator)
    score: Optional[int] = Field(None, serialization_alias="score")
    status: Optional[str] = Field(None, serialization_alias="status")
    risk_level: Optional[str] = Field(None, serialization_alias="riskLevel")
    gap_count: Optional[int] = Field(None, serialization_alias="gapCount")
    trend: Optional[float] = Field(None, serialization_alias="trend")
    jurisdiction: Optional[str] = Field(None, serialization_alias="jurisdiction")
    last_assessed: Optional[str] = Field(None, serialization_alias="lastAssessed")


class CompliancePosture(BaseModel):
    """Organisation compliance posture. Matches TypeScript CompliancePosture."""

    model_config = ConfigDict(serialize_by_alias=True)

    organisation_id: str = Field(..., serialization_alias="organisationId")
    organisation_name: str = Field(..., serialization_alias="organisationName")
    frameworks: list[FrameworkPosture] = Field(default_factory=list, serialization_alias="frameworks")
    updated_at: str = Field(..., serialization_alias="updatedAt")
    # Real posture top-level (from PostureCalculator aggregate)
    overall_score: Optional[int] = Field(None, serialization_alias="overallScore")
    audit_readiness: Optional[int] = Field(None, serialization_alias="auditReadiness")
    risk_level: Optional[str] = Field(None, serialization_alias="riskLevel")
    critical_gaps: Optional[list[dict[str, Any]]] = Field(None, serialization_alias="criticalGaps")
    last_assessed: Optional[str] = Field(None, serialization_alias="lastAssessed")


# ---- Organisation profile (GET /organisations/{id}) ----


class OrgProfile(BaseModel):
    model_config = ConfigDict(serialize_by_alias=True)
    id: str = Field(..., serialization_alias="id")
    name: str = Field(..., serialization_alias="name")
    jurisdiction: str = Field("", serialization_alias="jurisdiction")
    industry: Optional[str] = Field(None, serialization_alias="industry")
    region: Optional[str] = Field(None, serialization_alias="region")


# ---- ZTAIP system status (matches frontend ZTAIPStatus) ----


class AuditFabricStatus(BaseModel):
    model_config = ConfigDict(serialize_by_alias=True)
    total_events: int = Field(..., serialization_alias="totalEvents")
    last_event_at: Optional[str] = Field(None, serialization_alias="lastEventAt")


class ZTAIPStatus(BaseModel):
    model_config = ConfigDict(serialize_by_alias=True)
    audit_fabric: AuditFabricStatus = Field(..., serialization_alias="auditFabric")
    circuit_breakers_count: int = Field(..., serialization_alias="circuitBreakersCount")
    human_review_queue_count: int = Field(..., serialization_alias="humanReviewQueueCount")
    sovereignty_broker: str = Field(..., serialization_alias="sovereigntyBroker")  # active | degraded | unavailable
    agent_certificates_count: int = Field(..., serialization_alias="agentCertificatesCount")


# ---- Human Review Queue (GDPR Art.22 / EU AI Act Art.14) ----


class ReviewQueueItem(BaseModel):
    """Flagged control with confidence < 0.75 for human oversight."""

    model_config = ConfigDict(serialize_by_alias=True)

    id: str
    framework: str
    control_id: str = Field(..., serialization_alias="controlId")
    name: str
    assessment: str  # PARTIAL | NON_COMPLIANT
    confidence: float
    severity: str  # CRITICAL | HIGH | MEDIUM
    reference: str
    date_flagged: str = Field(..., serialization_alias="dateFlagged")


class ReviewedItem(BaseModel):
    """Completed approval or override for audit trail."""

    id: str
    framework: str
    control_id: str = Field(..., serialization_alias="controlId")
    action: str  # approved | overridden
    acted_by: str = Field(..., serialization_alias="actedBy")
    acted_at: str = Field(..., serialization_alias="actedAt")
    original_confidence: float = Field(..., serialization_alias="originalConfidence")
    final_decision: str = Field(..., serialization_alias="finalDecision")
    audit_ref: Optional[str] = Field(None, serialization_alias="auditRef")

    model_config = ConfigDict(serialize_by_alias=True)


class ReviewQueueResponse(BaseModel):
    items: list[ReviewQueueItem]
    reviewed: list[ReviewedItem]


class ApproveRequest(BaseModel):
    notes: str


class OverrideRequest(BaseModel):
    assessment: str  # COMPLIANT | PARTIAL | NON_COMPLIANT
    justification: str
