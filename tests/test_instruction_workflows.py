from __future__ import annotations

import inspect
from pathlib import Path

from api import instruction
from core.canonical_roles import CanonicalRole
from core.governance import SovereignModel
from core.instruction import Assignment, CoachingNote, Cohort, LearnerProgress
from core.rbac import Permission, ROLE_PERMISSIONS, user_has_permission

ROOT = Path(__file__).resolve().parents[1]


def test_instruction_domain_models_are_sovereign() -> None:
    for model in (Cohort, Assignment, LearnerProgress, CoachingNote):
        assert issubclass(model, SovereignModel)


def test_instruction_permission_role_parity() -> None:
    assert Permission.coach_learners in ROLE_PERMISSIONS[CanonicalRole.admin]
    assert Permission.manage_curriculum in ROLE_PERMISSIONS[CanonicalRole.admin]
    assert Permission.coach_learners in ROLE_PERMISSIONS[CanonicalRole.analyst]
    assert Permission.manage_curriculum not in ROLE_PERMISSIONS[CanonicalRole.analyst]
    assert not user_has_permission({"role": "viewer"}, Permission.coach_learners)
    frontend = (ROOT / "frontend" / "src" / "lib" / "roles.ts").read_text()
    assert "canCoachLearners: true" in frontend
    assert "canManageCurriculum: true" in frontend


def test_migration_forces_rls_on_every_instruction_table() -> None:
    sql = (ROOT / "migrations" / "043_instructor_cohorts.sql").read_text()
    for table in (
        "cohorts",
        "cohort_memberships",
        "assignments",
        "assignment_practices",
        "assignment_learners",
        "coaching_notes",
    ):
        assert f"'{table}'" in sql
    assert "FORCE ROW LEVEL SECURITY" in sql
    assert "org_id = cortex_current_org()" in sql


def test_coaching_note_has_before_and_after_audit_events() -> None:
    source = inspect.getsource(instruction.create_note)
    assert "instruction.coaching_note.create.start" in source
    assert "instruction.coaching_note.create.complete" in source
    assert "prev_hash_override=start" in source


def test_learner_note_history_enforces_ownership_and_visibility() -> None:
    source = inspect.getsource(instruction.get_notes)
    assert "learner_id != actor" in source
    assert "visibility = 'learner_visible'" in source


def test_no_manager_decision_endpoint_is_exposed() -> None:
    paths = {route.path for route in instruction.router.routes}
    assert all("decide" not in path for path in paths)
