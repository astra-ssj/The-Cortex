from __future__ import annotations

import pytest

from db.session import _validate_application_role_row


def test_non_bypass_application_role_is_accepted() -> None:
    _validate_application_role_row(
        {"role_name": "cortex_app", "rolsuper": False, "rolbypassrls": False}
    )


@pytest.mark.parametrize(
    ("rolsuper", "rolbypassrls"),
    [(True, False), (False, True), (True, True)],
)
def test_privileged_application_role_is_rejected(
    rolsuper: bool,
    rolbypassrls: bool,
) -> None:
    with pytest.raises(RuntimeError, match="Unsafe DATABASE_URL"):
        _validate_application_role_row(
            {
                "role_name": "unsafe_role",
                "rolsuper": rolsuper,
                "rolbypassrls": rolbypassrls,
            }
        )


def test_missing_role_metadata_fails_closed() -> None:
    with pytest.raises(RuntimeError, match="Unable to verify"):
        _validate_application_role_row(None)
