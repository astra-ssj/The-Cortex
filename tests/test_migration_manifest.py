from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "migrations" / "manifest.txt"


def _entries() -> list[str]:
    return [
        line.strip()
        for line in MANIFEST.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_manifest_registers_every_schema_file_once() -> None:
    entries = _entries()
    expected = {"init.sql"} | {
        str(path.relative_to(ROOT))
        for path in (ROOT / "migrations").glob("*.sql")
    }

    assert len(entries) == len(set(entries)), "migration manifest contains duplicates"
    assert set(entries) == expected
    assert entries[-1] == "migrations/045_practice_quality_semantics.sql"


def test_manifest_entries_exist_and_are_ordered() -> None:
    entries = _entries()
    assert entries[0] == "init.sql"
    assert all((ROOT / entry).is_file() for entry in entries)

    numbered = [Path(entry).name for entry in entries[1:]]
    assert numbered.index("019_scenario_content.sql") < numbered.index(
        "019_scenario_content_seed.sql"
    )
    assert numbered.index("037_multi_tenant_rls_audit_system.sql") < numbered.index(
        "038_skill_practice_catalog.sql"
    )
    assert numbered.index("038_skill_practice_catalog.sql") < numbered.index(
        "039_fail_closed_audit_rls.sql"
    )
    assert numbered.index("041_learner_journey.sql") < numbered.index(
        "042_reviewed_launch_curriculum.sql"
    )
    assert numbered.index("042_reviewed_launch_curriculum.sql") < numbered.index(
        "043_instructor_cohorts.sql"
    )
    assert numbered.index("043_instructor_cohorts.sql") < numbered.index(
        "044_practice_quality_v11.sql"
    )
    assert numbered.index("044_practice_quality_v11.sql") < numbered.index(
        "045_practice_quality_semantics.sql"
    )


def test_checksum_mismatch_is_a_real_psql_error() -> None:
    script = (ROOT / "scripts/apply_cortex_schema.sh").read_text(encoding="utf-8")

    assert "RAISE EXCEPTION 'migration checksum verification failed'" in script
    assert "\\quit 3" not in script
