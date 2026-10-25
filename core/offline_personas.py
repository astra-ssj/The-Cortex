"""Versioned deterministic persona fixtures for disconnected deployments.

This module is deliberately isolated from the active learning harness while that
harness has concurrent changes. Integrating it later requires one narrow lookup
at the existing stub-provider boundary; fixture loading itself performs no model
call and has no mutable global state.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

FIXTURE_SCHEMA_VERSION = 1
DEFAULT_FIXTURE_VERSION = "v1"
_CONTENT_ROOT = Path(__file__).resolve().parents[1] / "content" / "offline_personas"


class OfflinePersonaError(ValueError):
    """The requested fixture is absent or fails the offline fixture contract."""


@dataclass(frozen=True)
class OfflinePersonaTurn:
    fixture_version: str
    scenario: str
    speaker: str
    stance: str
    message: str
    demands: tuple[str, ...]

    def as_agent_payload(self) -> dict[str, Any]:
        return {
            "speaker": self.speaker,
            "stance": self.stance,
            "message": self.message,
            "demands": list(self.demands),
        }


@lru_cache(maxsize=8)
def _load_catalog(version: str) -> dict[str, Any]:
    if not version or "/" in version or "\\" in version or version.startswith("."):
        raise OfflinePersonaError("Invalid fixture version")
    path = _CONTENT_ROOT / version / "personas.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise OfflinePersonaError(f"Unable to load offline fixture version {version!r}") from exc
    if raw.get("schema_version") != FIXTURE_SCHEMA_VERSION:
        raise OfflinePersonaError("Unsupported offline fixture schema")
    scenarios = raw.get("scenarios")
    if not isinstance(scenarios, dict) or not scenarios:
        raise OfflinePersonaError("Offline fixture catalog has no scenarios")
    return raw


def offline_persona_turn(
    scenario: str,
    *,
    version: str = DEFAULT_FIXTURE_VERSION,
) -> OfflinePersonaTurn:
    """Return the exact fixture for a scenario; never fall back to another role."""
    catalog = _load_catalog(version)
    raw = catalog["scenarios"].get(scenario)
    if not isinstance(raw, dict):
        raise OfflinePersonaError(f"No offline persona fixture for scenario {scenario!r}")
    required = ("speaker", "stance", "message", "demands")
    if any(key not in raw for key in required) or not isinstance(raw["demands"], list):
        raise OfflinePersonaError(f"Malformed offline persona fixture for {scenario!r}")
    return OfflinePersonaTurn(
        fixture_version=str(catalog["fixture_version"]),
        scenario=scenario,
        speaker=str(raw["speaker"]),
        stance=str(raw["stance"]),
        message=str(raw["message"]),
        demands=tuple(str(item) for item in raw["demands"]),
    )
