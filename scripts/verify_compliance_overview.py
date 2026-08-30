#!/usr/bin/env python
"""
Walk a throwaway org from no training to demonstrated posture.

Proves the three claims the Compliance Overview makes: a fresh org shows nothing
rather than a zero score, completing a scenario moves only the controls that
scenario exercises, and retaking it with better decisions lifts the control out
of gap. Also re-checks tenant isolation against the demo org.

Run against a database with migrations through 035 applied:
    PYTHONPATH=. JWT_SECRET=... DATABASE_URL=... python scripts/verify_compliance_overview.py
"""

from __future__ import annotations

import os
import sys
import uuid

import psycopg2
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.main import app  # noqa: E402
from core.security import create_access_token  # noqa: E402

OVERVIEW = "/api/v1/compliance/overview"
SCENARIO = "cloud_access_onboarding"

ORG = f"verify-org-{uuid.uuid4().hex[:8]}"
GOOD = "least_privilege"
BAD = "approve_all"


def headers(email: str, org_id: str) -> dict[str, str]:
    token = create_access_token(
        {
            "sub": email,
            "email": email,
            "org_id": org_id,
            "role": "admin",
            "onboarding_complete": True,
            "onboarding_step": 5,
        }
    )
    return {"Authorization": f"Bearer {token}"}


def pg():
    return psycopg2.connect(
        host=os.environ.get("PGHOST", "127.0.0.1"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "cortex"),
        password=os.environ.get("PGPASSWORD", "cortex_ci_test"),
        dbname=os.environ.get("PGDATABASE", "cortex"),
    )


def play(client: TestClient, hdrs: dict[str, str], choice: str) -> None:
    """Create a session and drive it to the terminal stage with one repeated choice."""
    r = client.post(
        "/api/v1/learning/sessions",
        json={"scenario_slug": SCENARIO, "org_id": ORG, "framework": "iso27001-2022", "audit_type": "new_audit"},
        headers=hdrs,
    )
    r.raise_for_status()
    session_id = r.json()["id"]

    for _ in range(12):
        r = client.post(
            f"/api/v1/learning/sessions/{session_id}/decide",
            json={"choice": choice},
            params={"org_id": ORG},
            headers=hdrs,
        )
        if r.status_code != 200:
            break
        if r.json()["stage"] == "complete":
            return
    raise SystemExit(f"session {session_id} did not reach the terminal stage")


def overview(client: TestClient, hdrs: dict[str, str], org_id: str) -> dict:
    r = client.get(OVERVIEW, params={"org_id": org_id}, headers=hdrs)
    r.raise_for_status()
    return r.json()


def show(label: str, body: dict) -> None:
    s = body["summary"]
    print(f"\n{label}")
    print(
        f"  assessed {s['controls_assessed']}/{s['controls_available']} · "
        f"avg {s['average_competency']} · gaps {s['open_gaps']} · "
        f"not assessed {len(body['not_assessed'])}"
    )
    for row in body["controls"]:
        print(f"    {row['ref']:<12} {row['competency']:>3}  {row['status']:<11} {row['scenario_slug']}")


def main() -> int:
    client = TestClient(app)
    hdrs = headers("verify@cortex.local", ORG)

    conn = pg()
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO organizations (id, name, jurisdiction) VALUES (%s, %s, 'EU') "
            "ON CONFLICT (id) DO NOTHING",
            (ORG, "Verify Test Group"),
        )

    failures: list[str] = []
    try:
        # ── 1. Empty ──────────────────────────────────────────────
        empty = overview(client, hdrs, ORG)
        show("1. Fresh org, no training", empty)
        if empty["summary"]["controls_assessed"] != 0:
            failures.append("fresh org reported assessed controls")
        if empty["summary"]["average_competency"] != 0:
            failures.append("fresh org reported a non-zero average")
        if len(empty["not_assessed"]) != empty["summary"]["controls_available"]:
            failures.append("fresh org did not list every coverable control as unassessed")
        if empty["org_label"] != "Verify Test Group":
            failures.append(f"org_label was {empty['org_label']!r}, not the organizations.name")

        # ── 2. Partial, played badly ──────────────────────────────
        play(client, hdrs, BAD)
        partial = overview(client, hdrs, ORG)
        show("2. After one run of poor decisions", partial)
        if partial["summary"]["controls_assessed"] == 0:
            failures.append("completing a scenario assessed nothing")
        if partial["summary"]["controls_assessed"] >= partial["summary"]["controls_available"]:
            failures.append("one scenario assessed every coverable control")
        gaps = {r["ref"] for r in partial["controls"] if r["status"] == "gap"}
        if not gaps:
            failures.append("poor decisions produced no gap")
        before = {r["ref"]: r["competency"] for r in partial["controls"]}

        # Only controls this scenario touches may move.
        touched = {r["ref"] for r in partial["controls"]}
        if "a.5.26" in touched:
            failures.append("a control from another scenario was attributed")

        # ── 3. Retake, played well ────────────────────────────────
        play(client, hdrs, GOOD)
        populated = overview(client, hdrs, ORG)
        show("3. After retaking with sound decisions", populated)
        after = {r["ref"]: r["competency"] for r in populated["controls"]}

        improved = [ref for ref in before if after.get(ref, 0) > before[ref]]
        if not improved:
            failures.append("retaking the scenario moved no control")
        else:
            print(f"\n  improved: {', '.join(f'{r} {before[r]}→{after[r]}' for r in sorted(improved))}")

        closed = [r for r in gaps if after.get(r, 0) >= 60]
        print(f"  gaps closed by the retake: {sorted(closed) or 'none'}")
        if not closed:
            failures.append("no gap control left the gap band after a clean retake")

        # ── 4. Isolation ──────────────────────────────────────────
        demo = overview(client, headers("ciso@astralabs.com", "demo-org-001"), "demo-org-001")
        print(f"\n4. Isolation: demo assessed {demo['summary']['controls_assessed']}, "
              f"verify org assessed {populated['summary']['controls_assessed']}")
        if demo["org_id"] == populated["org_id"]:
            failures.append("both reads resolved to the same org")
        if demo["summary"]["controls_assessed"] == populated["summary"]["controls_assessed"] and \
                demo["summary"]["average_competency"] == populated["summary"]["average_competency"]:
            failures.append("demo and verify org returned identical posture — possible leak")
        if demo["summary"]["controls_available"] != populated["summary"]["controls_available"]:
            failures.append("the shared scenario denominator differed between orgs")

    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM scenario_sessions WHERE org_id = %s", (ORG,))
            cur.execute("DELETE FROM findings WHERE org_id = %s", (ORG,))
            # audit_log is append-only and enforced by a trigger; the run's entries
            # stay, which is the intended behaviour rather than something to work
            # around. The org row goes, so nothing dangles in the UI.
            cur.execute("DELETE FROM organizations WHERE id = %s", (ORG,))
        conn.close()

    print()
    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        return 1
    print("PASS: empty → partial → populated, gap closure, and tenant isolation all hold.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
