#!/usr/bin/env python3
"""Export the latest published scenario versions into canonical review source."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "content" / "practices" / "published_scenarios_source.json"

QUERY = text(
    """
    SELECT p.id AS practice_id, pv.content AS practice_content,
           sv.slug, sv.title, sv.brief, sv.track, sv.frameworks, sv.difficulty,
           sv.entry_stage_id, sv.version, sv.content_hash,
           stv.stable_id AS stage_id, stv.sequence, stv.agent_message,
           stv.demands, stv.terminal,
           scv.stable_id AS choice_id, scv.label, scv.consequence,
           scv.is_correct, scv.framework_rationale, scv.next_stage_id,
           scv.risk_outcome, scv.dimension_weights, scv.control_refs,
           scv.display_order
    FROM scenario_versions sv
    JOIN scenarios s ON s.id = sv.scenario_id
    LEFT JOIN practice_versions pv ON pv.id = sv.practice_version_id
    LEFT JOIN practices p ON p.id = pv.practice_id
    JOIN scenario_stage_versions stv ON stv.scenario_version_id = sv.id
    LEFT JOIN scenario_choice_versions scv ON scv.stage_version_id = stv.id
    WHERE sv.status = 'published'
      AND sv.version = (
        SELECT MAX(newest.version) FROM scenario_versions newest
        WHERE newest.scenario_id = sv.scenario_id AND newest.status = 'published'
      )
    ORDER BY sv.slug, stv.sequence, scv.display_order, scv.stable_id
    """
)


async def export(database_url: str, output: Path) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            rows = (await connection.execute(QUERY)).mappings().all()
    finally:
        await engine.dispose()

    scenarios: dict[str, dict[str, Any]] = {}
    stage_indexes: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        slug = str(row["slug"])
        scenario = scenarios.setdefault(
            slug,
            {
                "practice_id": str(row["practice_id"] or slug.replace("_", "-")),
                "slug": slug,
                "title": str(row["title"]),
                "brief": str(row["brief"]),
                "track": str(row["track"]),
                "frameworks": list(row["frameworks"] or []),
                "difficulty": str(row["difficulty"]),
                "entry_stage_id": str(row["entry_stage_id"]),
                "source_version": int(row["version"]),
                "source_content_hash": str(row["content_hash"]),
                "stages": [],
            },
        )
        stage_key = (slug, str(row["stage_id"]))
        stage = stage_indexes.get(stage_key)
        if stage is None:
            stage = {
                "id": str(row["stage_id"]),
                "sequence": int(row["sequence"]),
                "agent_message": str(row["agent_message"] or ""),
                "demands": list(row["demands"] or []),
                "terminal": bool(row["terminal"]),
                "choices": [],
            }
            stage_indexes[stage_key] = stage
            scenario["stages"].append(stage)
        if row["choice_id"] is not None:
            stage["choices"].append(
                {
                    "id": str(row["choice_id"]),
                    "label": str(row["label"]),
                    "consequence": str(row["consequence"] or ""),
                    "is_correct": bool(row["is_correct"]),
                    "rationale": str(row["framework_rationale"] or ""),
                    "next_stage": str(row["next_stage_id"]),
                    "risk_outcome": str(row["risk_outcome"] or ""),
                    "dimension_weights": dict(row["dimension_weights"] or {}),
                    "control_refs": list(row["control_refs"] or []),
                    "display_order": int(row["display_order"]),
                }
            )

    output.write_text(
        json.dumps(
            {"schema_version": 1, "scenarios": list(scenarios.values())},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        parser.error("DATABASE_URL is required")
    asyncio.run(export(database_url, args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
