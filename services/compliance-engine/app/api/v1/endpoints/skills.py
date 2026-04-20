# skills — GRC bundled skills status and debug preview.

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.skills_loader import get_skills_loader

router = APIRouter(tags=["skills"])


@router.get("/status")
def get_skills_status() -> dict[str, Any]:
    """Return status of all loaded GRC skills."""
    loader = get_skills_loader()
    return {"status": "ok", "data": loader.summary()}


@router.get("/{skill_id}/context")
def get_skill_context(skill_id: str, max_chars: int = 3000) -> dict[str, Any]:
    """Return skill metadata and a short preview of SKILL.md (debug / verification)."""
    loader = get_skills_loader()
    skill = loader.get(skill_id)
    if not skill:
        return {"error": f"Skill '{skill_id}' not found"}
    return {
        "skill_id": skill.id,
        "name": skill.name,
        "loaded": skill.loaded,
        "chars": len(skill.content),
        "preview": skill.content[: min(500, max_chars)],
    }
