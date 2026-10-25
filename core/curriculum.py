"""Governed schemas and deterministic validation for versioned curriculum."""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict, deque
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from core.governance import SovereignModel
from core.competency import DIMENSIONS

StableId = str
ContentStatus = Literal["draft", "published", "retired"]
AnswerPolicy = Literal["exactly_one", "one_or_more", "ungraded"]

_STABLE_ID = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_CONTROL_REF = re.compile(
    r"^(?:a\.\d{1,2}\.\d{1,2}|clause\.\d{1,2}(?:\.\d{1,2})?|[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*)$"
)
MAX_DIMENSION_WEIGHT = 100


def canonical_content_hash(value: Any) -> str:
    """Hash canonical JSON so validation runs and stored pins are reproducible."""
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class ContentProvenance(SovereignModel):
    source_id: str = Field(..., min_length=1)
    source_version: str = Field(..., min_length=1)
    source_uri: str | None = None
    source_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    reviewed_by: str = Field(..., min_length=1)

    model_config = {"extra": "forbid", "frozen": True}


class PracticeVersion(SovereignModel):
    practice_id: StableId
    version: str = Field(..., min_length=1)
    status: ContentStatus
    title: str = Field(..., min_length=1, max_length=160)
    summary: str = Field(..., min_length=1, max_length=1000)
    provenance: ContentProvenance
    content_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")

    model_config = {"extra": "forbid", "frozen": True}

    @field_validator("practice_id")
    @classmethod
    def stable_practice_id(cls, value: str) -> str:
        if not _STABLE_ID.fullmatch(value):
            raise ValueError("practice_id must be a stable lowercase identifier")
        return value


class ChoiceVersion(SovereignModel):
    id: StableId
    label: str = Field(..., min_length=1, max_length=300)
    consequence: str = Field(default="", max_length=2000)
    is_correct: bool = False
    framework_rationale: str | None = Field(default=None, max_length=4000)
    next_stage_id: StableId | None = None
    risk_outcome: str | None = Field(default=None, max_length=120)
    dimension_weights: dict[str, int] = Field(default_factory=dict)
    control_refs: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid", "frozen": True}

    @field_validator("id", "next_stage_id")
    @classmethod
    def stable_choice_ids(cls, value: str | None) -> str | None:
        if value is not None and not _STABLE_ID.fullmatch(value):
            raise ValueError("content identifiers must be stable lowercase identifiers")
        return value

    @field_validator("dimension_weights")
    @classmethod
    def bounded_known_dimensions(cls, value: dict[str, int]) -> dict[str, int]:
        unknown = set(value) - set(DIMENSIONS)
        if unknown:
            raise ValueError(f"unknown competency dimensions: {sorted(unknown)}")
        if any(isinstance(weight, bool) or abs(weight) > MAX_DIMENSION_WEIGHT for weight in value.values()):
            raise ValueError(f"dimension weights must be between {-MAX_DIMENSION_WEIGHT} and {MAX_DIMENSION_WEIGHT}")
        return value

    @field_validator("control_refs")
    @classmethod
    def valid_control_refs(cls, value: list[str]) -> list[str]:
        normalized = [item.strip().lower().replace(" ", ".") for item in value]
        if len(normalized) != len(set(normalized)):
            raise ValueError("control_refs must be unique")
        invalid = [item for item in normalized if not _CONTROL_REF.fullmatch(item)]
        if invalid:
            raise ValueError(f"invalid control references: {invalid}")
        return normalized


class StageVersion(SovereignModel):
    id: StableId
    sequence: int = Field(..., ge=1)
    terminal: bool = False
    agent_message: str = Field(default="", max_length=4000)
    choices: list[ChoiceVersion] = Field(default_factory=list)

    model_config = {"extra": "forbid", "frozen": True}

    @field_validator("id")
    @classmethod
    def stable_stage_id(cls, value: str) -> str:
        if not _STABLE_ID.fullmatch(value):
            raise ValueError("stage id must be a stable lowercase identifier")
        return value

    @model_validator(mode="after")
    def terminal_shape(self) -> StageVersion:
        if self.terminal and self.choices:
            raise ValueError("terminal stages cannot have choices")
        if not self.terminal and not self.choices:
            raise ValueError("non-terminal stages require choices")
        return self


class ScenarioVersion(SovereignModel):
    scenario_id: StableId
    version: int = Field(..., ge=1)
    status: ContentStatus
    entry_stage_id: StableId
    answer_policy: AnswerPolicy = "exactly_one"
    stages: list[StageVersion] = Field(..., min_length=1)
    provenance: ContentProvenance
    content_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")

    model_config = {"extra": "forbid", "frozen": True}

    @model_validator(mode="after")
    def validate_graph_and_answers(self) -> ScenarioVersion:
        stage_ids = [stage.id for stage in self.stages]
        if len(stage_ids) != len(set(stage_ids)):
            raise ValueError("scenario stage ids must be unique")
        if self.entry_stage_id not in set(stage_ids):
            raise ValueError("entry_stage_id must reference a stage")

        choice_ids: set[str] = set()
        stages = {stage.id: stage for stage in self.stages}
        graph: dict[str, set[str]] = defaultdict(set)
        for stage in self.stages:
            local_ids = [choice.id for choice in stage.choices]
            if len(local_ids) != len(set(local_ids)):
                raise ValueError(f"choice ids must be unique within stage {stage.id}")
            overlap = choice_ids.intersection(local_ids)
            if overlap:
                raise ValueError(f"choice ids must be globally unique: {sorted(overlap)}")
            choice_ids.update(local_ids)

            correct = sum(choice.is_correct for choice in stage.choices)
            if not stage.terminal:
                if self.answer_policy == "exactly_one" and correct != 1:
                    raise ValueError(f"stage {stage.id} requires exactly one correct answer")
                if self.answer_policy == "one_or_more" and correct < 1:
                    raise ValueError(f"stage {stage.id} requires a correct answer")
                if self.answer_policy == "ungraded" and correct:
                    raise ValueError(f"ungraded stage {stage.id} cannot mark correct answers")
            for choice in stage.choices:
                if choice.next_stage_id is None:
                    raise ValueError(f"choice {choice.id} requires next_stage_id")
                if choice.next_stage_id not in stages:
                    raise ValueError(f"choice {choice.id} targets an unknown stage")
                graph[stage.id].add(choice.next_stage_id)

        reachable: set[str] = set()
        visiting: set[str] = set()

        def walk(stage_id: str) -> None:
            if stage_id in visiting:
                raise ValueError("scenario stages must form a DAG")
            if stage_id in reachable:
                return
            visiting.add(stage_id)
            for target in graph[stage_id]:
                walk(target)
            visiting.remove(stage_id)
            reachable.add(stage_id)

        walk(self.entry_stage_id)
        if reachable != set(stage_ids):
            raise ValueError(f"unreachable stages: {sorted(set(stage_ids) - reachable)}")

        terminal_ids = {stage.id for stage in self.stages if stage.terminal}
        if not terminal_ids:
            raise ValueError("scenario requires a terminal stage")
        for stage_id in reachable:
            pending = [stage_id]
            seen: set[str] = set()
            reaches_terminal = False
            while pending:
                current = pending.pop()
                if current in terminal_ids:
                    reaches_terminal = True
                    break
                if current not in seen:
                    seen.add(current)
                    pending.extend(graph[current])
            if not reaches_terminal:
                raise ValueError(f"stage {stage_id} has no terminal path")
        return self


class TrackMembership(SovereignModel):
    scenario_version_id: str
    position: int = Field(..., ge=1)
    required: bool = True

    model_config = {"extra": "forbid", "frozen": True}


class TrackVersion(SovereignModel):
    track_id: StableId
    version: int = Field(..., ge=1)
    status: ContentStatus
    memberships: list[TrackMembership] = Field(default_factory=list)
    prerequisite_track_version_ids: list[str] = Field(default_factory=list)
    content_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")

    model_config = {"extra": "forbid", "frozen": True}

    @model_validator(mode="after")
    def unique_memberships(self) -> TrackVersion:
        scenario_ids = [item.scenario_version_id for item in self.memberships]
        positions = [item.position for item in self.memberships]
        if len(scenario_ids) != len(set(scenario_ids)):
            raise ValueError("track scenario memberships must be unique")
        if len(positions) != len(set(positions)):
            raise ValueError("track positions must be unique")
        if len(self.prerequisite_track_version_ids) != len(set(self.prerequisite_track_version_ids)):
            raise ValueError("track prerequisites must be unique")
        return self


def validate_track_prerequisite_dag(tracks: list[TrackVersion], ids: list[str]) -> None:
    """Validate cross-track prerequisites after persistence assigns version UUIDs."""
    if len(tracks) != len(ids):
        raise ValueError("tracks and ids must have equal length")
    known = set(ids)
    edges = {
        track_id: set(track.prerequisite_track_version_ids)
        for track_id, track in zip(ids, tracks, strict=True)
    }
    for track_id, prerequisites in edges.items():
        unknown = prerequisites - known
        if unknown:
            raise ValueError(f"track {track_id} has unknown prerequisites: {sorted(unknown)}")
        if track_id in prerequisites:
            raise ValueError("track cannot require itself")

    indegree = {track_id: 0 for track_id in ids}
    dependents: dict[str, set[str]] = defaultdict(set)
    for track_id, prerequisites in edges.items():
        indegree[track_id] = len(prerequisites)
        for prerequisite in prerequisites:
            dependents[prerequisite].add(track_id)
    queue = deque(track_id for track_id, degree in indegree.items() if degree == 0)
    visited = 0
    while queue:
        current = queue.popleft()
        visited += 1
        for dependent in dependents[current]:
            indegree[dependent] -= 1
            if indegree[dependent] == 0:
                queue.append(dependent)
    if visited != len(ids):
        raise ValueError("track prerequisites must form a DAG")


def verify_content_hash(content: Any, expected_hash: str) -> None:
    if not _SHA256.fullmatch(expected_hash) or canonical_content_hash(content) != expected_hash:
        raise ValueError("content hash does not match canonical content")
