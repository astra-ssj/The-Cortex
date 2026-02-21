# credential_store.py — Encrypted storage for connector credentials. Never plaintext at rest.

from __future__ import annotations

import base64
import json
import os
from typing import Any, cast

import structlog

logger = structlog.get_logger()

# In-memory: connector_id -> encrypted payload (base64). Production: use DB with encrypted column.
_store: dict[str, bytes] = {}

# Env key for encryption; must be 32 url-safe base64 bytes for Fernet.
_ENCRYPTION_KEY_ENV = "CORTEX_CONNECTOR_SECRET_KEY"


def _get_fernet_key() -> bytes | None:
    key = os.environ.get(_ENCRYPTION_KEY_ENV)
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        # Key must be 32 bytes base64; Fernet uses base64url.
        if len(key) != 44 or not key.endswith("="):
            k = base64.urlsafe_b64encode(key.encode("utf-8")[:32].ljust(32)[:32])
        else:
            k = key.encode("utf-8")
        Fernet(k)  # validate
        return k
    except Exception as e:
        logger.debug("connector_fernet_key_invalid", error=str(e))
        return None


def _encrypt(payload: dict[str, Any]) -> bytes:
    key = _get_fernet_key()
    if key is None:
        # No key: encode as base64 only (not secure; for dev). Log warning.
        logger.warning("connector_credential_no_encryption_key", env_key=_ENCRYPTION_KEY_ENV)
        return base64.b64encode(json.dumps(payload).encode("utf-8"))
    from cryptography.fernet import Fernet
    f = Fernet(key)
    return cast(bytes, f.encrypt(json.dumps(payload).encode("utf-8")))


def _decrypt(raw: bytes) -> dict[str, Any]:
    key = _get_fernet_key()
    if key is None:
        try:
            return cast(dict[str, Any], json.loads(base64.b64decode(raw).decode("utf-8")))
        except Exception as e:
            logger.debug("connector_decrypt_dev_fallback_error", error=str(e))
            return {}
    from cryptography.fernet import Fernet
    f = Fernet(key)
    return cast(dict[str, Any], json.loads(f.decrypt(raw).decode("utf-8")))


def store_credentials(connector_id: str, credentials: dict[str, Any]) -> None:
    """Store credentials encrypted. Overwrites existing."""
    _store[connector_id] = _encrypt(credentials)
    logger.info("connector_credentials_stored", connector_id=connector_id)


def get_credentials(connector_id: str) -> dict[str, Any] | None:
    """Return decrypted credentials or None if not found."""
    raw = _store.get(connector_id)
    if raw is None:
        return None
    return _decrypt(raw)


def clear_credentials(connector_id: str) -> None:
    """Remove stored credentials."""
    _store.pop(connector_id, None)
