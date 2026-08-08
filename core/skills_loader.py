"""
CORTEX Skills Loader — GRC skill content for the assessment engine.

Skills source:
  https://github.com/Sushegaad/Claude-Skills-Governance-Risk-and-Compliance
License: MIT (see content/skills/index.json).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import structlog

logger = structlog.get_logger()

# Repo-root content/skills (bundled GRC skill packs).
_SKILLS_ROOT = Path(__file__).resolve().parent.parent / "content" / "skills"
SKILLS_ROOT = _SKILLS_ROOT
SKILLS_INDEX = SKILLS_ROOT / "index.json"


class GRCSkill:
    """A bundled GRC skill with full SKILL.md content."""

    def __init__(self, skill_meta: dict[str, Any]) -> None:
        self.id = skill_meta["id"]
        self.framework_id = skill_meta["framework_id"]
        self.name = skill_meta["name"]
        self.jurisdiction = skill_meta["jurisdiction"]
        self.trigger_phrases = skill_meta.get("trigger_phrases", [])
        self.cortex_frameworks = skill_meta.get("cortex_frameworks", [])
        rel = skill_meta.get("file", "")
        skill_file = SKILLS_ROOT / rel if rel else Path()
        if skill_file.exists():
            self.content = skill_file.read_text(encoding="utf-8")
            self.loaded = True
        else:
            self.content = ""
            self.loaded = False
            logger.warning("skill_file_missing", skill_id=self.id, path=str(skill_file))
        self.meta = skill_meta

    def get_context(self, max_chars: int = 8000) -> str:
        if not self.loaded:
            return f"[Skill {self.id} not loaded]"
        return self.content[:max_chars]

    def get_citation_format(self) -> str:
        formats = {
            "gdpr": "Art.{n} GDPR",
            "iso27001": "ISO 27001 {clause}",
            "dora": "DORA Art.{n}",
            "iso42001": "ISO 42001 {control}",
        }
        return formats.get(self.id, "{framework} {ref}")

    def __repr__(self) -> str:
        status = "✓" if self.loaded else "✗"
        return f"GRCSkill({self.id} [{status}] → {self.framework_id})"


class SkillsLoader:
    """Load and query GRC skills for assessments."""

    def __init__(self) -> None:
        self._skills: dict[str, GRCSkill] = {}
        self._loaded = False

    def load(self) -> None:
        if not SKILLS_INDEX.exists():
            logger.warning("skills_index_missing", path=str(SKILLS_INDEX))
            return
        with open(SKILLS_INDEX, encoding="utf-8") as f:
            index = json.load(f)
        for skill_meta in index.get("skills", []):
            skill = GRCSkill(skill_meta)
            self._skills[skill.id] = skill
            logger.info("skill_loaded", repr=str(skill))
        self._loaded = True
        logger.info("skills_loader_ready", count=len(self._skills))

    def get(self, skill_id: str) -> Optional[GRCSkill]:
        return self._skills.get(skill_id)

    def get_for_framework(self, framework_id: str) -> Optional[GRCSkill]:
        for skill in self._skills.values():
            if framework_id in skill.cortex_frameworks:
                return skill
        return None

    def get_all_loaded(self) -> list[GRCSkill]:
        return [s for s in self._skills.values() if s.loaded]

    def build_assessment_context(self, framework_id: str, control_id: str, max_chars: int = 6000) -> str:
        skill = self.get_for_framework(framework_id)
        if not skill:
            return (
                f"No specialist skill loaded for framework: {framework_id}. "
                "Using general compliance knowledge."
            )
        cite = skill.get_citation_format()
        return (
            f"=== {skill.name} SPECIALIST KNOWLEDGE ===\n"
            f"Framework: {framework_id}\n"
            f"Control: {control_id}\n"
            f"Citation format: {cite}\n\n"
            f"{skill.get_context(max_chars)}\n"
            f"=== END SPECIALIST KNOWLEDGE ==="
        )

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def summary(self) -> dict[str, Any]:
        return {
            "total": len(self._skills),
            "loaded": len(self.get_all_loaded()),
            "skills": [
                {
                    "id": s.id,
                    "name": s.name,
                    "framework": s.framework_id,
                    "loaded": s.loaded,
                    "chars": len(s.content),
                }
                for s in self._skills.values()
            ],
        }


_loader: Optional[SkillsLoader] = None


def get_skills_loader() -> SkillsLoader:
    global _loader
    if _loader is None:
        _loader = SkillsLoader()
        _loader.load()
    return _loader


def get_skill_for_framework(framework_id: str) -> Optional[GRCSkill]:
    return get_skills_loader().get_for_framework(framework_id)
