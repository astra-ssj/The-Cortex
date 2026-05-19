# core/auth_opaque.py — Hashing opaque bearer tokens (refresh, reset, API keys).

from __future__ import annotations

import hashlib


def hash_opaque_token(raw: str) -> str:
    """SHA-256 hex digest for storing refresh/password-reset/API keys."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
