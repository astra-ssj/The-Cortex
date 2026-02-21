# compliance/models.py — ZTAIP domain models for compliance frameworks.
# Every domain model inherits from SovereignModel (jurisdiction + purpose tags).

from __future__ import annotations


from pydantic import BaseModel, Field


class SovereignModel(BaseModel):
    """Base for all CORTEX domain models. Enforces jurisdiction and purpose tagging for governance."""

    jurisdiction: str = Field(..., description="Legal or organisational jurisdiction (e.g. EU, US, internal)")
    purpose_tags: list[str] = Field(default_factory=list, description="Tags for access and retention policy")


class EvidenceType(BaseModel):
    """Type of evidence that can satisfy a requirement."""

    id: str
    name: str
    description: str = ""


class Requirement(BaseModel):
    """Single requirement within a control, with optional Article reference."""

    id: str
    article_ref: str = ""  # e.g. "Art.6", "Art.32(1)"
    description: str
    evidence_types: list[EvidenceType] = Field(default_factory=list)


class Control(BaseModel):
    """Control within a framework (e.g. one GDPR domain or NIST function)."""

    id: str
    name: str
    domain: str = ""  # e.g. "Lawful Basis & Consent"
    requirements: list[Requirement] = Field(default_factory=list)


class Framework(SovereignModel):
    """A compliance framework (e.g. GDPR, NIST CSF). Registered in registry and loaded by FrameworkId."""

    id: str = ""  # Set from FrameworkId when registering
    name: str = ""
    version: str = "1.0"
    controls: list[Control] = Field(default_factory=list)

    model_config = {"extra": "forbid"}

    def get_control(self, control_id: str) -> Control | None:
        for c in self.controls:
            if c.id == control_id:
                return c
        return None

    def all_requirements_have_evidence_type(self) -> bool:
        """Every requirement must have at least one evidence_type (governance rule)."""
        for control in self.controls:
            for req in control.requirements:
                if not req.evidence_types:
                    return False
        return True

    def all_controls_have_requirement(self) -> bool:
        """Every control must have at least one requirement."""
        for control in self.controls:
            if not control.requirements:
                return False
        return True
