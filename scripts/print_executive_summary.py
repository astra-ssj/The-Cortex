#!/usr/bin/env python3
"""Pretty-print key fields from GET /api/v1/reports/executive-summary JSON (stdin).

  curl -s http://localhost:8000/api/v1/reports/executive-summary \\
    -H "Authorization: Bearer $TOKEN" | python3 scripts/print_executive_summary.py
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    d = json.load(sys.stdin)
    p = d.get("overall_posture", {})
    ex = d.get("regulatory_exposure")
    ex_n = len(ex) if isinstance(ex, list) else len(ex or {})

    print("Score:", p.get("overall_score", p.get("group_compliance_score")))
    print("Findings:", len(d.get("top_critical_findings", [])))
    print("Exposure:", ex_n)
    fws = d.get("frameworks") or d.get("framework_summary", [])
    print("Frameworks:", len(fws))
    for f in fws:
        fid = f.get("framework_id") or (f.get("framework_name") or "")[:20]
        print(" ", fid, f.get("score"), f.get("risk_level"))


if __name__ == "__main__":
    main()
