#!/usr/bin/env python3
"""Validate and deterministically compile untrusted community scenario YAML.

The loader uses PyYAML's SafeLoader and all narrative fields remain inert strings:
this tool does not import, render, evaluate, or execute Markdown or template syntax.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import yaml

MAX_SOURCE_BYTES = 256 * 1024
MAX_NODES = 2_000
MAX_DEPTH = 16
MAX_COMPILED_BYTES = 512 * 1024
LICENSES = {"Apache-2.0", "CC-BY-4.0", "CC0-1.0"}
DIFFICULTIES = {"foundation", "practitioner", "expert"}
DIMENSIONS = {"judgment", "control_mapping", "evidence", "escalation"}
SLUG = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
IDENTIFIER = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
FRAMEWORK = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
CONTROL_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._:/()\-]*$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")

ROOT_FIELDS = {
    "schema_version",
    "id",
    "title",
    "summary",
    "track",
    "difficulty",
    "frameworks",
    "practice_area",
    "estimated_minutes",
    "learning_objectives",
    "provenance",
    "stages",
}
ROOT_REQUIRED = ROOT_FIELDS - {"practice_area"}
PROVENANCE_FIELDS = {"authors", "license", "source_url", "source_version", "content_sha256"}
STAGE_FIELDS = {"id", "sequence", "agent_message", "demands", "choices"}
CHOICE_FIELDS = {
    "id",
    "label",
    "consequence",
    "is_correct",
    "framework_rationale",
    "next_stage",
    "risk_outcome",
    "dimension_weights",
    "control_refs",
}


class ScenarioValidationError(ValueError):
    """Raised when a contributed scenario is unsafe or violates the contract."""


def _fail(path: str, message: str) -> None:
    raise ScenarioValidationError(f"{path}: {message}")


def _mapping(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail(path, "must be a mapping")
    if any(not isinstance(key, str) for key in value):
        _fail(path, "all field names must be strings")
    return value


def _strict_fields(
    value: dict[str, Any],
    *,
    allowed: set[str],
    required: set[str],
    path: str,
) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        _fail(path, f"unknown field(s): {', '.join(unknown)}")
    missing = sorted(required - set(value))
    if missing:
        _fail(path, f"missing field(s): {', '.join(missing)}")


def _string(
    value: Any,
    path: str,
    *,
    minimum: int = 1,
    maximum: int,
    pattern: re.Pattern[str] | None = None,
) -> str:
    if not isinstance(value, str):
        _fail(path, "must be a string")
    if not minimum <= len(value) <= maximum:
        _fail(path, f"length must be between {minimum} and {maximum}")
    if pattern is not None and pattern.fullmatch(value) is None:
        _fail(path, "has an invalid format")
    return value


def _integer(value: Any, path: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail(path, "must be an integer")
    if not minimum <= value <= maximum:
        _fail(path, f"must be between {minimum} and {maximum}")
    return value


def _list(value: Any, path: str, minimum: int, maximum: int) -> list[Any]:
    if not isinstance(value, list):
        _fail(path, "must be a list")
    if not minimum <= len(value) <= maximum:
        _fail(path, f"must contain between {minimum} and {maximum} items")
    return value


def _string_list(
    value: Any,
    path: str,
    *,
    minimum: int,
    maximum: int,
    item_maximum: int,
    pattern: re.Pattern[str] | None = None,
    unique: bool = False,
) -> list[str]:
    items = _list(value, path, minimum, maximum)
    result = [
        _string(item, f"{path}[{index}]", maximum=item_maximum, pattern=pattern)
        for index, item in enumerate(items)
    ]
    if unique and len(result) != len(set(result)):
        _fail(path, "items must be unique")
    return result


def _count_nodes(value: Any, *, depth: int = 0, seen: set[int] | None = None) -> int:
    if depth > MAX_DEPTH:
        _fail("$", f"nesting exceeds {MAX_DEPTH} levels")
    if not isinstance(value, (dict, list)):
        return 1
    seen = seen or set()
    marker = id(value)
    if marker in seen:
        _fail("$", "YAML aliases may not form recursive structures")
    seen.add(marker)
    children = value.values() if isinstance(value, dict) else value
    count = 1 + sum(_count_nodes(item, depth=depth + 1, seen=seen) for item in children)
    seen.remove(marker)
    if count > MAX_NODES:
        _fail("$", f"document exceeds {MAX_NODES} expanded nodes")
    return count


def load_yaml(path: Path) -> dict[str, Any]:
    """Read a bounded UTF-8 YAML document using only safe standard YAML types."""
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ScenarioValidationError(f"{path}: cannot read file: {exc}") from exc
    if len(raw) > MAX_SOURCE_BYTES:
        _fail("$", f"source exceeds {MAX_SOURCE_BYTES} bytes")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ScenarioValidationError(f"{path}: must be UTF-8") from exc
    try:
        value = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ScenarioValidationError(f"{path}: invalid safe YAML: {exc}") from exc
    _count_nodes(value)
    return _mapping(value, "$")


def _validate_provenance(value: Any) -> None:
    provenance = _mapping(value, "$.provenance")
    _strict_fields(
        provenance,
        allowed=PROVENANCE_FIELDS,
        required={"authors", "license"},
        path="$.provenance",
    )
    _string_list(
        provenance["authors"],
        "$.provenance.authors",
        minimum=1,
        maximum=10,
        item_maximum=120,
        unique=True,
    )
    if provenance["license"] not in LICENSES:
        _fail("$.provenance.license", f"must be one of {', '.join(sorted(LICENSES))}")
    if "source_url" in provenance:
        source_url = _string(provenance["source_url"], "$.provenance.source_url", maximum=2048)
        parsed = urlsplit(source_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            _fail("$.provenance.source_url", "must be an HTTPS URL without embedded credentials")
    if "source_version" in provenance:
        _string(provenance["source_version"], "$.provenance.source_version", maximum=80)
    if "content_sha256" in provenance:
        _string(
            provenance["content_sha256"],
            "$.provenance.content_sha256",
            minimum=64,
            maximum=64,
            pattern=SHA256,
        )


def _validate_choice(value: Any, path: str) -> None:
    choice = _mapping(value, path)
    _strict_fields(choice, allowed=CHOICE_FIELDS, required=CHOICE_FIELDS, path=path)
    _string(choice["id"], f"{path}.id", maximum=64, pattern=IDENTIFIER)
    _string(choice["label"], f"{path}.label", maximum=240)
    _string(choice["consequence"], f"{path}.consequence", maximum=2000)
    if not isinstance(choice["is_correct"], bool):
        _fail(f"{path}.is_correct", "must be a boolean")
    _string(choice["framework_rationale"], f"{path}.framework_rationale", maximum=2000)
    if choice["next_stage"] is not None:
        _string(choice["next_stage"], f"{path}.next_stage", maximum=64, pattern=IDENTIFIER)
    _string(choice["risk_outcome"], f"{path}.risk_outcome", maximum=64, pattern=IDENTIFIER)
    weights = _mapping(choice["dimension_weights"], f"{path}.dimension_weights")
    _strict_fields(
        weights,
        allowed=DIMENSIONS,
        required=set(),
        path=f"{path}.dimension_weights",
    )
    if not weights:
        _fail(f"{path}.dimension_weights", "must contain at least one dimension")
    for dimension, weight in weights.items():
        _integer(weight, f"{path}.dimension_weights.{dimension}", -10, 10)
    _string_list(
        choice["control_refs"],
        f"{path}.control_refs",
        minimum=0,
        maximum=24,
        item_maximum=120,
        pattern=CONTROL_REF,
        unique=True,
    )


def validate_scenario(value: Any) -> dict[str, Any]:
    """Validate schema shape plus cross-reference and provenance invariants."""
    scenario = _mapping(value, "$")
    _strict_fields(scenario, allowed=ROOT_FIELDS, required=ROOT_REQUIRED, path="$")
    if scenario["schema_version"] != 1 or isinstance(scenario["schema_version"], bool):
        _fail("$.schema_version", "must equal integer 1")
    _string(scenario["id"], "$.id", maximum=64, pattern=SLUG)
    _string(scenario["title"], "$.title", maximum=120)
    _string(scenario["summary"], "$.summary", maximum=1000)
    _string(scenario["track"], "$.track", maximum=64, pattern=SLUG)
    if scenario["difficulty"] not in DIFFICULTIES:
        _fail("$.difficulty", f"must be one of {', '.join(sorted(DIFFICULTIES))}")
    _string_list(
        scenario["frameworks"],
        "$.frameworks",
        minimum=1,
        maximum=12,
        item_maximum=64,
        pattern=FRAMEWORK,
        unique=True,
    )
    if "practice_area" in scenario:
        _string(scenario["practice_area"], "$.practice_area", maximum=80)
    _integer(scenario["estimated_minutes"], "$.estimated_minutes", 1, 180)
    _string_list(
        scenario["learning_objectives"],
        "$.learning_objectives",
        minimum=1,
        maximum=12,
        item_maximum=240,
        unique=True,
    )
    _validate_provenance(scenario["provenance"])

    stages = _list(scenario["stages"], "$.stages", 1, 24)
    stage_ids: list[str] = []
    sequences: list[int] = []
    all_choice_ids: set[str] = set()
    transitions: list[tuple[str, str]] = []
    for stage_index, raw_stage in enumerate(stages):
        path = f"$.stages[{stage_index}]"
        stage = _mapping(raw_stage, path)
        _strict_fields(stage, allowed=STAGE_FIELDS, required=STAGE_FIELDS, path=path)
        stage_ids.append(_string(stage["id"], f"{path}.id", maximum=64, pattern=IDENTIFIER))
        sequences.append(_integer(stage["sequence"], f"{path}.sequence", 1, 24))
        _string(stage["agent_message"], f"{path}.agent_message", minimum=0, maximum=4000)
        _string_list(
            stage["demands"],
            f"{path}.demands",
            minimum=0,
            maximum=12,
            item_maximum=500,
        )
        choices = _list(stage["choices"], f"{path}.choices", 0, 12)
        for choice_index, raw_choice in enumerate(choices):
            choice_path = f"{path}.choices[{choice_index}]"
            _validate_choice(raw_choice, choice_path)
            choice_id = raw_choice["id"]
            if choice_id in all_choice_ids:
                _fail(f"{choice_path}.id", "choice ids must be unique across the scenario")
            all_choice_ids.add(choice_id)
            if raw_choice["next_stage"] is not None:
                transitions.append((choice_path, raw_choice["next_stage"]))

    if len(stage_ids) != len(set(stage_ids)):
        _fail("$.stages", "stage ids must be unique")
    if sequences != list(range(1, len(stages) + 1)):
        _fail("$.stages", "stage sequence values must be ordered and contiguous from 1")
    known_stages = set(stage_ids)
    for choice_path, target in transitions:
        if target not in known_stages:
            _fail(f"{choice_path}.next_stage", f"references unknown stage {target!r}")
    for index, stage in enumerate(stages):
        if not stage["choices"] and index != len(stages) - 1:
            _fail(f"$.stages[{index}].choices", "only the final stage may be terminal")
    expected_hash = scenario["provenance"].get("content_sha256")
    if expected_hash is not None and expected_hash != canonical_hash(scenario):
        _fail("$.provenance.content_sha256", "does not match canonical scenario content")
    return scenario


def canonical_source(value: dict[str, Any]) -> bytes:
    """Return canonical UTF-8 JSON, excluding the self-referential hash field."""
    payload = copy.deepcopy(value)
    payload.get("provenance", {}).pop("content_sha256", None)
    return json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def canonical_hash(value: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_source(value)).hexdigest()


def compile_scenario(value: dict[str, Any]) -> bytes:
    """Build a deterministic, data-only artifact after strict validation."""
    scenario = validate_scenario(value)
    artifact = {
        "artifact_version": 1,
        "canonical_sha256": canonical_hash(scenario),
        "scenario": scenario,
    }
    compiled = (
        json.dumps(
            artifact,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    ).encode("utf-8")
    if len(compiled) > MAX_COMPILED_BYTES:
        _fail("$", f"compiled artifact exceeds {MAX_COMPILED_BYTES} bytes")
    return compiled


def _default_output(source: Path) -> Path:
    return source.with_suffix(".compiled.json")


def _expand_sources(inputs: list[Path]) -> list[Path]:
    sources: list[Path] = []
    for candidate in inputs:
        if candidate.is_dir():
            sources.extend(candidate.rglob("*.yaml"))
            sources.extend(candidate.rglob("*.yml"))
        else:
            sources.append(candidate)
    return sorted(set(sources))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path, help="scenario YAML files or directories")
    parser.add_argument("--compile", action="store_true", help="write deterministic .compiled.json artifacts")
    parser.add_argument("--output", type=Path, help="output path; valid only with one input and --compile")
    args = parser.parse_args(argv)
    sources = _expand_sources(args.files)
    if not sources:
        parser.error("no .yaml or .yml files found")
    if args.output is not None and (not args.compile or len(sources) != 1):
        parser.error("--output requires --compile and exactly one input file")

    failed = False
    for source in sources:
        try:
            scenario = validate_scenario(load_yaml(source))
            digest = canonical_hash(scenario)
            if args.compile:
                output = args.output or _default_output(source)
                output.write_bytes(compile_scenario(scenario))
                print(f"compiled {source} -> {output} sha256:{digest}")
            else:
                print(f"valid {source} sha256:{digest}")
        except (ScenarioValidationError, OSError) as exc:
            failed = True
            print(f"error: {exc}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
