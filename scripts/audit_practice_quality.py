#!/usr/bin/env python3
"""Emit the reviewable quality baseline for every Astra launch practice."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from core.practice_quality import audit_catalog

ROOT = Path(__file__).resolve().parents[1]


def _load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Return non-zero when any practice misses the quality gate.",
    )
    args = parser.parse_args()
    catalog = _load(ROOT / "content" / "practices" / "index.json")
    scenarios = _load(ROOT / "content" / "practices" / "scenarios_v1_1.json")
    fixtures = _load(ROOT / "content" / "practices" / "evaluation_fixtures_v2.json")
    reports = audit_catalog(
        list(catalog["practices"]),  # type: ignore[arg-type]
        list(scenarios["scenarios"]),  # type: ignore[arg-type]
        list(fixtures["paths"]),  # type: ignore[arg-type]
    )
    output = {
        "standard_version": reports[0].standard_version if reports else "practice-quality-v1",
        "practice_count": len(reports),
        "passing_count": sum(report.passes for report in reports),
        "reports": [report.model_dump(mode="json") for report in reports],
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 1 if args.strict and output["passing_count"] != output["practice_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
