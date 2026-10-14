# core/llm/assessment_schema.py — Structured LLM output for per-control assessment.

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ComplianceStatus = Literal["compliant", "partial", "non_compliant", "not_assessed"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class AssessmentLLMOutput(BaseModel):
    """ZTAIP assessment verdict for a single control with auditor-grade provenance."""

    compliance_status: ComplianceStatus
    finding: str = Field(min_length=1, max_length=4000)
    confidence_score: float = Field(ge=0.0, le=1.0)
    severity: Severity = "MEDIUM"
    reference: str = Field(default="", max_length=500)
    verbatim_quote: str = Field(default="", max_length=2000, description="Exact verbatim quote from evidence")
    page_offset: Optional[int] = Field(default=None, description="Starting page offset in source document")
    section_offset: Optional[str] = Field(default=None, max_length=200, description="Section heading or offset")
    conflicting_evidence: bool = Field(default=False, description="Flagged if contradictory evidence exists")

