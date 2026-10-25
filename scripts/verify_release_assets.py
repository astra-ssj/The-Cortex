#!/usr/bin/env python3
"""Dependency-free release consistency gate for local builds and CI."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


def fail(message: str) -> None:
    raise SystemExit(f"release verification failed: {message}")


version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
if not SEMVER.fullmatch(version):
    fail(f"VERSION is not stable semver: {version!r}")

pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
frontend = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
lock = json.loads((ROOT / "frontend/package-lock.json").read_text(encoding="utf-8"))
project_block = pyproject.split("[project]", 1)[-1].split("\n[", 1)[0]
if 'name = "astra-grc-ce"' not in project_block or f'version = "{version}"' not in project_block:
    fail("Python package name/version does not match Astra CE VERSION")
if frontend.get("name") != "astra-grc-ce-frontend" or frontend.get("version") != version:
    fail("frontend package name/version does not match Astra CE VERSION")
if lock.get("name") != frontend["name"] or lock.get("version") != version:
    fail("frontend lock metadata does not match package.json")

api_main = (ROOT / "api/main.py").read_text(encoding="utf-8")
if 'title="Astra GRC Community Edition API"' not in api_main:
    fail("API title is not Astra GRC Community Edition")
if f'version="{version}"' not in api_main:
    fail("API version does not match VERSION")

manifest = [
    line.strip()
    for line in (ROOT / "migrations/manifest.txt").read_text(encoding="utf-8").splitlines()
    if line.strip() and not line.lstrip().startswith("#")
]
if not manifest or manifest[-1] != "migrations/044_practice_quality_v11.sql":
    fail("migration manifest must end at migration 044")
for relative in manifest:
    if not (ROOT / relative).is_file():
        fail(f"manifest entry is missing: {relative}")

release_files = (
    ROOT / "docker-compose.yml",
    ROOT / "release/compose.yml",
    ROOT / "compose.dev.yml",
    ROOT / ".github/workflows/release.yml",
    ROOT / "scripts/install.sh",
    ROOT / "scripts/build-release.sh",
)
release_text = "\n".join(path.read_text(encoding="utf-8") for path in release_files)
root_compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
if "include:" not in root_compose or "compose.dev.yml" not in root_compose:
    fail("root docker-compose.yml must be the Astra CE development shim")
if "pip install" in root_compose or "\nservices:" in root_compose:
    fail("root Compose shim must not define inherited services or runtime package installs")
for legacy in (
    "CORTEX_PORT",
    "CORTEX_API_IMAGE",
    "CORTEX_FRONTEND_IMAGE",
    "CORTEX_DATA_VOLUME",
    "CORTEX_COMPOSE_FILE",
    "CORTEX_ENV_FILE",
    "CORTEX_VERSION",
    "cortex-api",
    "cortex-frontend",
    "cortex-images",
):
    if legacy in release_text:
        fail(f"product-facing legacy release name remains: {legacy}")
for required in (
    "ASTRA_VERSION",
    "ASTRA_PORT",
    "ASTRA_API_IMAGE",
    "ASTRA_FRONTEND_IMAGE",
    "ASTRA_DATA_VOLUME",
    "astra-grc-ce-api",
    "astra-grc-ce-frontend",
):
    if required not in release_text:
        fail(f"required Astra CE release name is absent: {required}")

print(f"Astra GRC CE release assets verified at version {version} through migration 044.")
