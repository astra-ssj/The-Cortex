"""Astra governance primitives shared by all domain models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SovereignModel(BaseModel):
    """Domain base carrying jurisdiction and declared processing purposes."""

    jurisdiction: str = Field(
        ...,
        description="Legal or organisational jurisdiction",
    )
    purpose_tags: list[str] = Field(
        default_factory=list,
        description="Purposes that authorize processing and retention",
    )
