# core/llm/assessment_schema.py — Structured LLM output for per-control assessment.

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ComplianceStatus = Literal["compliant", "partial", "non_compliant", "not_assessed"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class AssessmentLLMOutput(BaseModel):
    """ZTAIP assessment verdict for a single control."""

    compliance_status: ComplianceStatus
    finding: str = Field(min_length=1, max_length=4000)
    confidence_score: float = Field(ge=0.0, le=1.0)
    severity: Severity = "MEDIUM"
    reference: str = Field(default="", max_length=500)
