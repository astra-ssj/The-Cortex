# ontology/models.py — Ontology entities for ingestion. All domain models inherit SovereignModel.

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from compliance.models import SovereignModel


class ControlRef(BaseModel):
    """Reference to a framework control (from compliance registry)."""

    framework_id: str = ""
    control_id: str = ""


class Obligation(SovereignModel):
    """Obligation entity extracted from document."""

    id: str = ""
    description: str = ""
    control_refs: list[ControlRef] = Field(default_factory=list)


class Person(SovereignModel):
    """Person/role mentioned in document."""

    id: str = ""
    name: str = ""
    role: str = ""


class SystemAsset(SovereignModel):
    """System mentioned in document."""

    id: str = ""
    name: str = ""
    system_type: str = ""


class Evidence(SovereignModel):
    """Evidence entity — links document to controls/obligations. evidence_type = POLICY_DOCUMENT etc."""

    id: str = ""
    evidence_type: str = "POLICY_DOCUMENT"
    content_hash: str = ""
    obligations_satisfied: list[str] = Field(default_factory=list)  # obligation ids, cross-framework
    control_refs: list[ControlRef] = Field(default_factory=list)
    confidence_score: float = 0.0
    requires_human_review: bool = False
    collector: str = ""  # e.g. AI_AGENT for automated scans


class Finding(BaseModel):
    """Single finding from a connector (e.g. Defender for Cloud recommendation)."""

    id: str = ""
    title: str = ""
    severity: str = ""  # High, Medium, Low, Informational
    obligation_id: str = ""  # CORTEX obligation_id when mapped
    source: str = ""  # e.g. defender_for_cloud
    resource_id: str = ""
    recommendation_id: str = ""


class NormalizedFinding(BaseModel):
    """Cross-engine finding shape for ingestion (e.g. Shasta → Postgres evidence pipeline).

    Holds vendor-neutral fields plus optional framework mappings and a verbatim raw payload
    for audit trails. Not stored as ontology SovereignModel — map to Evidence/Finding at persistence.
    """

    finding_key: str = ""
    source_engine: str = ""  # e.g. shasta
    external_id: str = ""
    scan_run_id: Optional[str] = None
    cloud_provider: str = ""  # aws | azure
    account_scope: str = ""  # AWS account id or Azure subscription id
    region: str = ""
    check_id: str = ""
    title: str = ""
    description: str = ""
    severity_normalized: str = ""  # CRITICAL, High, Medium, Low, Informational — aligns with Finding.severity
    compliance_status: str = ""  # pass | fail | partial | not_assessed | ...
    resource_type: str = ""
    resource_id: str = ""
    framework_controls: dict[str, list[str]] = Field(default_factory=dict)
    remediation: str = ""
    collected_at: Optional[str] = None  # ISO-8601 from upstream when present
    raw_finding: dict = Field(default_factory=dict)


class ControlFinding(BaseModel):
    """Control assessment result from a connector (e.g. Azure Policy, Defender)."""

    control_ref: ControlRef = Field(default_factory=ControlRef)
    status: str = ""  # compliant, non_compliant
    recommendation_id: str = ""
    raw_data: dict = Field(default_factory=dict)


class OntologyMappingResult(BaseModel):
    """Result of LLM ontology mapping from document chunks."""

    controls: list[ControlRef] = Field(default_factory=list)
    obligations: list[Obligation] = Field(default_factory=list)
    people: list[Person] = Field(default_factory=list)
    systems: list[SystemAsset] = Field(default_factory=list)
    confidence_score: float = 0.0
    requires_human_review: bool = False
