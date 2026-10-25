#!/usr/bin/env python3
"""Verify the signed-offline Gemma 4 archive checksum.

The weights are a separate artifact. This script refuses a missing or
mismatched digest and does nothing when no archive path is configured.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path


def digest_file(archive: Path) -> Path:
    return Path(str(archive) + ".sha256")


def verify_archive(archive: Path) -> str:
    if not archive.is_file():
        raise SystemExit(f"Gemma bundle not found: {archive}")
    sidecar = digest_file(archive)
    if not sidecar.is_file():
        raise SystemExit(f"Gemma bundle checksum not found: {sidecar}")
    expected = sidecar.read_text(encoding="utf-8").strip().split()[0].lower()
    if len(expected) != 64 or any(char not in "0123456789abcdef" for char in expected):
        raise SystemExit(f"Gemma bundle checksum is not a sha256 hex digest: {sidecar}")
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit("Gemma bundle checksum does not match the sidecar digest")
    return actual


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        raise SystemExit("usage: verify_gemma_bundle.py ARCHIVE")
    print(verify_archive(Path(argv[1])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
