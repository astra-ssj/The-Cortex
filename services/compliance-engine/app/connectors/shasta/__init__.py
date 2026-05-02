# Shasta (Transilience) cloud scan adapter — optional dependency; see shasta_adapter.SUBPROCESS_CONTRACT.

from app.connectors.shasta.shasta_adapter import (
    SUBPROCESS_CONTRACT,
    is_shasta_installed,
    normalized_to_finding,
    run_shasta_scan_for_stored_credentials,
    shasta_contract_payload,
)

__all__ = [
    "SUBPROCESS_CONTRACT",
    "is_shasta_installed",
    "normalized_to_finding",
    "run_shasta_scan_for_stored_credentials",
    "shasta_contract_payload",
]
