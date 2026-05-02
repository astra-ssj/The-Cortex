# shasta_evidence_map.py — Pure graph builder for Shasta finding ↔ framework_controls (no FastAPI/SQLAlchemy).

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

# Stable graph ids for evidence-map API (SPA / future React Flow).
_CONTROL_SEP = "::"


class EvidenceMapSummary(BaseModel):
    """Counts for the evidence-map graph."""

    findings: int = Field(ge=0, description="Finding nodes")
    control_nodes: int = Field(ge=0, description="Deduped framework control nodes")
    edges: int = Field(ge=0, description="finding → control links")


class EvidenceMapOut(BaseModel):
    """Finding ↔ framework-control graph for one Shasta scan run (Postgres SoT)."""

    source: Literal["shasta"] = "shasta"
    scan_run_id: str
    org_id: str
    scan_status: str
    cloud: str | None = None
    summary: EvidenceMapSummary
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


def build_evidence_map_from_findings(
    *,
    scan_run_id: str,
    org_id: str,
    scan_status: str,
    cloud: str | None,
    finding_rows: list[dict[str, Any]],
) -> EvidenceMapOut:
    """Pure builder: rows must include ``id``, ``finding_key``, ``title``, ``framework_controls`` etc."""
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    seen_control: set[str] = set()
    edge_i = 0

    for row in finding_rows:
        fid = f"finding:{row['id']}"
        title = (row.get("title") or row.get("finding_key") or "Finding")[:500]
        nodes.append(
            {
                "id": fid,
                "kind": "finding",
                "label": title,
                "finding_key": row.get("finding_key"),
                "severity": row.get("severity_normalized"),
                "check_id": row.get("check_id"),
                "resource_id": row.get("resource_id"),
            }
        )
        fw = row.get("framework_controls") or {}
        if hasattr(fw, "keys"):
            fw = dict(fw)
        if not isinstance(fw, dict):
            continue
        for family, refs in fw.items():
            fam = str(family)
            if not isinstance(refs, list):
                continue
            for ref in refs:
                rid = str(ref).strip()
                if not rid:
                    continue
                cid = f"control{_CONTROL_SEP}{fam}{_CONTROL_SEP}{rid}"
                if cid not in seen_control:
                    seen_control.add(cid)
                    nodes.append(
                        {
                            "id": cid,
                            "kind": "control",
                            "label": f"{fam.upper()} · {rid}",
                            "family": fam,
                            "control_ref": rid,
                        }
                    )
                edge_i += 1
                edges.append(
                    {
                        "id": f"maps_to-{edge_i}",
                        "kind": "maps_to",
                        "source": fid,
                        "target": cid,
                    }
                )

    fn = sum(1 for n in nodes if n.get("kind") == "finding")
    cn = sum(1 for n in nodes if n.get("kind") == "control")
    summary = EvidenceMapSummary(findings=fn, control_nodes=cn, edges=len(edges))
    return EvidenceMapOut(
        source="shasta",
        scan_run_id=scan_run_id,
        org_id=org_id,
        scan_status=scan_status,
        cloud=cloud,
        summary=summary,
        nodes=nodes,
        edges=edges,
    )
