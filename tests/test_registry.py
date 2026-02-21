# tests/test_registry.py — Compliance framework registry: get, register.

from __future__ import annotations

import pytest

from compliance import FrameworkId, get, register_all
from compliance.models import Framework
from compliance.registry import REGISTRY, get as registry_get, register


def test_register_all_populates_registry() -> None:
    """register_all() registers all built-in frameworks."""
    register_all()
    assert len(REGISTRY) >= 8
    assert FrameworkId.NIST_CSF in REGISTRY
    assert FrameworkId.GDPR in REGISTRY
    assert FrameworkId.NIS2 in REGISTRY


def test_get_returns_framework() -> None:
    """get(FrameworkId) returns Framework or None."""
    register_all()
    fw = registry_get(FrameworkId.GDPR)
    assert fw is not None
    assert fw.id == "gdpr"
    assert len(fw.controls) >= 1


def test_register_idempotent() -> None:
    """Registering same framework id again overwrites (idempotent for same id)."""
    register_all()
    fw = registry_get(FrameworkId.NIST_CSF)
    assert fw is not None
    register(fw, FrameworkId.NIST_CSF)
    assert registry_get(FrameworkId.NIST_CSF) is fw
