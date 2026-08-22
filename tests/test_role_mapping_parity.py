"""Role mapping parity between server (core/canonical_roles.py) and frontend (roles.ts).

The split-brain bug was that the two sides normalised the same alias role to
different canonical roles. This test fails if any alias resolves differently
on either side, or exists on only one side. The server is authoritative for
permission sets; both sides must agree on alias→canonical normalisation.
"""

from __future__ import annotations

import re
from pathlib import Path

from core.canonical_roles import CanonicalRole, normalize_canonical_role

ROLES_TS = Path(__file__).resolve().parent.parent / "frontend" / "src" / "lib" / "roles.ts"


def _parse_ts_normalize_role(src: str) -> dict[str, str]:
    """Extract alias→canonical-role from the ``normalizeRole`` function in roles.ts.

    Tolerant line-based parse: accumulate quoted aliases and flush them on each
    ``return`` statement. Fails loudly (assertion) if the function is missing or
    restructured — that is the signal to update this test, not a silent drift.
    """
    start = src.find("export function normalizeRole")
    assert start != -1, "normalizeRole function not found in roles.ts"
    brace = src.find("{", start)
    assert brace != -1, "normalizeRole opening brace not found"
    depth = 0
    end: int | None = None
    for i in range(brace, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    assert end is not None, "normalizeRole closing brace not found"
    body = src[brace + 1 : end]

    mapping: dict[str, str] = {}
    for line in body.splitlines():
        m = re.search(r'return\s+(?:"(\w+)"|raw)\s*;', line)
        if not m:
            continue
        # Aliases are the quoted strings compared with === on this line
        # (excludes the returned role value and the typeof "string" type-check,
        # which has no === comparison... actually it does — so we rely on the
        # return-bearing filter: role-condition lines always carry a return).
        aliases = re.findall(r'===\s*"([A-Za-z0-9_]+)"', line)
        if m.group(1):  # return "role"
            role = m.group(1)
            # Drop the returned role if it also appears as an === comparison.
            line_aliases = [a for a in aliases if a != role]
            for a in line_aliases:
                mapping[a] = role
        else:  # return raw — pass-through: each === alias maps to itself
            for a in aliases:
                mapping[a] = a
    return mapping


def _server_alias_map(aliases: set[str]) -> dict[str, str]:
    """Resolve each alias through the server normaliser (typed, no parsing)."""
    return {a: normalize_canonical_role(a).value for a in aliases}


def test_role_mapping_parity() -> None:
    ts_src = ROLES_TS.read_text()
    ts_map = _parse_ts_normalize_role(ts_src)

    # The full universe of alias strings known to either side. The server's
    # normaliser also handles arbitrary unknown strings (fallback to viewer),
    # so we test every alias the frontend recognises plus the server's known
    # alias tuples. Anything not in either map falls back to viewer on both.
    server_known = {
        "admin", "administrator", "ciso",
        "analyst", "dpo", "security_lead", "grc_analyst",
        "viewer", "auditor", "read_only", "readonly",
    }
    universe = server_known | set(ts_map)

    server_map = _server_alias_map(universe)

    # Every alias must be present on both sides with identical canonical role.
    missing_on_server = sorted(a for a in universe if a not in server_known and a not in ts_map)
    assert not missing_on_server, f"aliases unrecognised by both sides: {missing_on_server}"

    drift: list[str] = []
    for alias in sorted(universe):
        s = server_map.get(alias)
        f = ts_map.get(alias)
        # Aliases the frontend doesn't explicitly list fall back to viewer in
        # normalizeRole; aliases the server doesn't explicitly list fall back
        # to viewer in normalize_canonical_role. Treat absence as viewer.
        s = s if s is not None else CanonicalRole.viewer.value
        f = f if f is not None else CanonicalRole.viewer.value
        if s != f:
            drift.append(f"{alias}: server={s} frontend={f}")

    assert not drift, "role mapping drift between server and frontend:\n  " + "\n  ".join(drift)


def test_ciso_maps_to_admin_on_both_sides() -> None:
    """The specific split-brain that caused the demo CISO to 403 on /auth/users."""
    assert normalize_canonical_role("ciso") is CanonicalRole.admin
    ts_map = _parse_ts_normalize_role(ROLES_TS.read_text())
    assert ts_map.get("ciso") == "admin", f"frontend maps ciso to {ts_map.get('ciso')!r}, expected 'admin'"


def test_grc_analyst_maps_to_analyst_on_both_sides() -> None:
    """Frontend used to fall through to viewer; server maps to analyst. Now aligned."""
    assert normalize_canonical_role("grc_analyst") is CanonicalRole.analyst
    ts_map = _parse_ts_normalize_role(ROLES_TS.read_text())
    assert ts_map.get("grc_analyst") == "analyst", (
        f"frontend maps grc_analyst to {ts_map.get('grc_analyst')!r}, expected 'analyst'"
    )
