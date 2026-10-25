from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path

import pytest

SCENARIO_DIR = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "validate_scenario",
    SCENARIO_DIR / "validate_scenario.py",
)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def example() -> dict:
    return validator.load_yaml(SCENARIO_DIR / "examples" / "privileged-access-review.yaml")


def test_example_validates_and_schema_forbids_unknown_fields() -> None:
    validated = validator.validate_scenario(example())
    schema = json.loads((SCENARIO_DIR / "scenario.schema.json").read_text(encoding="utf-8"))

    assert validated["id"] == "privileged-access-review"
    assert schema["additionalProperties"] is False
    assert schema["$defs"]["choice"]["additionalProperties"] is False


def test_compilation_is_deterministic_and_records_hash() -> None:
    scenario = example()

    first = validator.compile_scenario(scenario)
    second = validator.compile_scenario(copy.deepcopy(scenario))
    artifact = json.loads(first)

    assert first == second
    assert artifact["canonical_sha256"] == validator.canonical_hash(scenario)
    assert first.endswith(b"\n")


def test_unknown_field_is_rejected() -> None:
    scenario = example()
    scenario["surprise"] = "not allowed"

    with pytest.raises(validator.ScenarioValidationError, match="unknown field"):
        validator.validate_scenario(scenario)


def test_unknown_transition_is_rejected() -> None:
    scenario = example()
    scenario["stages"][0]["choices"][0]["next_stage"] = "missing_stage"

    with pytest.raises(validator.ScenarioValidationError, match="references unknown stage"):
        validator.validate_scenario(scenario)


def test_provenance_hash_detects_tampering() -> None:
    scenario = example()
    scenario["provenance"]["content_sha256"] = validator.canonical_hash(scenario)
    validator.validate_scenario(scenario)
    scenario["title"] = "Tampered title"

    with pytest.raises(validator.ScenarioValidationError, match="does not match"):
        validator.validate_scenario(scenario)


def test_custom_yaml_tag_is_never_constructed(tmp_path: Path) -> None:
    unsafe = tmp_path / "unsafe.yaml"
    unsafe.write_text("value: !execute 'never'\n", encoding="utf-8")

    with pytest.raises(validator.ScenarioValidationError, match="invalid safe YAML"):
        validator.load_yaml(unsafe)


def test_source_size_limit_is_enforced_before_parsing(tmp_path: Path) -> None:
    oversized = tmp_path / "oversized.yaml"
    oversized.write_bytes(b"x" * (validator.MAX_SOURCE_BYTES + 1))

    with pytest.raises(validator.ScenarioValidationError, match="source exceeds"):
        validator.load_yaml(oversized)


def test_duplicate_choice_ids_are_rejected() -> None:
    scenario = example()
    scenario["stages"][0]["choices"][1]["id"] = scenario["stages"][0]["choices"][0]["id"]

    with pytest.raises(validator.ScenarioValidationError, match="choice ids must be unique"):
        validator.validate_scenario(scenario)
