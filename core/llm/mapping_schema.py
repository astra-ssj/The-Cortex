# core/llm/mapping_schema.py — Pydantic schema for document → ontology LLM output.

from __future__ import annotations

from pydantic import BaseModel, Field


class LLMControlRef(BaseModel):
    framework_id: str
    control_id: str


class LLMObligation(BaseModel):
    jurisdiction: str = "EU"
    purpose_tags: list[str] = Field(default_factory=lambda: ["ingestion"])
    id: str
    description: str
    control_refs: list[LLMControlRef] = Field(default_factory=list)


class LLMPerson(BaseModel):
    jurisdiction: str = "internal"
    purpose_tags: list[str] = Field(default_factory=list)
    id: str
    name: str
    role: str = ""


class LLMSystemAsset(BaseModel):
    jurisdiction: str = "internal"
    purpose_tags: list[str] = Field(default_factory=list)
    id: str
    name: str
    system_type: str = "application"


class OntologyMappingLLMOutput(BaseModel):
    controls: list[LLMControlRef] = Field(default_factory=list)
    obligations: list[LLMObligation] = Field(default_factory=list)
    people: list[LLMPerson] = Field(default_factory=list)
    systems: list[LLMSystemAsset] = Field(default_factory=list)
    confidence_score: float = Field(ge=0.0, le=1.0)
