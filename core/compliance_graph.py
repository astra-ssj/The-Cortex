# core/compliance_graph.py — Pure compliance graph builder (Postgres rows + in-memory findings).

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# Demo framework control totals for coverage stats (authoritative counts from GRC registry).
_FRAMEWORK_CONTROL_TOTALS: dict[str, int] = {
    "iso27001-2022": 93,
    "gdpr-2016-679": 25,
    "nis2-2022-2555": 18,
    "nist-csf-2.0": 108,
    "csa-ccm-v4": 197,
    "eu-ai-act-2024": 42,
    "cyber-essentials-v3.1": 8,
}


class GraphStats(BaseModel):
    total_nodes: int = 0
    total_edges: int = 0
    shared_evidence: int = 0
    work_reduction_pct: int = 0
    naive_assessments: int = 0
    effective_assessments: int = 0
    framework_coverage: dict[str, dict[str, int]] = Field(default_factory=dict)
    # Accountability + exposure metrics (relationship graph).
    node_type_counts: dict[str, int] = Field(default_factory=dict)
    ownership_coverage_pct: int = 0
    owned_controls: int = 0
    unowned_controls: int = 0
    total_controls: int = 0
    total_risk_exposure_eur: int = 0


class ComplianceGraphOut(BaseModel):
    org_id: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    stats: GraphStats


def _control_node_id(control_id: str) -> str:
    return f"control:{control_id}"


def _evidence_node_id(evidence_id: str) -> str:
    return f"evidence:{evidence_id}"


def _framework_node_id(framework_id: str) -> str:
    return f"framework:{framework_id}"


def _entity_node_id(entity_id: str) -> str:
    return f"entity:{entity_id}"


def _typed_node_id(node_type: str, raw_id: str) -> str:
    """Prefix a bare id with its node type (matches relationship_edges convention)."""
    return f"{node_type}:{raw_id}"


# Relationship types that form an accountability / exposure chain for trace traversal.
_TRACE_RELATIONSHIPS: set[str] = {
    "violates",
    "owns",
    "member_of",
    "operates",
    "processes_data_on",
    "exposes_to",
    "reports_to",
    "subject_to",
}


def _compute_stats(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    evidence_rows: list[dict[str, Any]],
    ec_rows: list[dict[str, Any]],
) -> GraphStats:
    proves_by_evidence: dict[str, int] = {}
    for row in ec_rows:
        eid = str(row["evidence_id"])
        proves_by_evidence[eid] = proves_by_evidence.get(eid, 0) + 1

    shared_evidence = sum(1 for c in proves_by_evidence.values() if c >= 2)
    naive = len(ec_rows)
    effective = len(evidence_rows) if evidence_rows else 0
    work_reduction_pct = 0
    if naive > 0 and effective > 0 and naive > effective:
        work_reduction_pct = min(99, round(100 * (naive - effective) / naive))

    proven_by_fw: dict[str, set[str]] = {}
    for row in ec_rows:
        fw = str(row["framework_id"])
        cid = str(row["control_id"])
        proven_by_fw.setdefault(fw, set()).add(cid)

    framework_coverage: dict[str, dict[str, int]] = {}
    for fw, controls in proven_by_fw.items():
        total = _FRAMEWORK_CONTROL_TOTALS.get(fw, max(len(controls), 1))
        framework_coverage[fw] = {"proven": len(controls), "total": total}

    node_type_counts: dict[str, int] = {}
    for n in nodes:
        t = str(n.get("type") or "unknown")
        node_type_counts[t] = node_type_counts.get(t, 0) + 1

    # Ownership coverage: a control is "owned" when a person -> control `owns` edge exists.
    control_ids = {str(n["id"]) for n in nodes if n.get("type") == "control"}
    owned_control_ids = {
        str(e["to"])
        for e in edges
        if e.get("type") == "owns" and str(e["to"]) in control_ids
    }
    total_controls = len(control_ids)
    owned_controls = len(owned_control_ids)
    unowned_controls = total_controls - owned_controls
    ownership_coverage_pct = (
        round(100 * owned_controls / total_controls) if total_controls else 0
    )

    total_risk_exposure_eur = sum(
        int(n.get("metadata", {}).get("impact_eur") or 0)
        for n in nodes
        if n.get("type") == "risk"
    )

    return GraphStats(
        total_nodes=len(nodes),
        total_edges=len(edges),
        shared_evidence=shared_evidence,
        work_reduction_pct=work_reduction_pct,
        naive_assessments=naive,
        effective_assessments=effective,
        framework_coverage=framework_coverage,
        node_type_counts=node_type_counts,
        ownership_coverage_pct=ownership_coverage_pct,
        owned_controls=owned_controls,
        unowned_controls=unowned_controls,
        total_controls=total_controls,
        total_risk_exposure_eur=total_risk_exposure_eur,
    )


def build_compliance_graph(
    *,
    org_id: str,
    mappings: list[dict[str, Any]],
    evidence_rows: list[dict[str, Any]],
    ec_rows: list[dict[str, Any]],
    framework_entities: list[dict[str, Any]],
    frameworks: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    people: list[dict[str, Any]] | None = None,
    teams: list[dict[str, Any]] | None = None,
    systems: list[dict[str, Any]] | None = None,
    risks: list[dict[str, Any]] | None = None,
    relationship_edges: list[dict[str, Any]] | None = None,
) -> ComplianceGraphOut:
    """Assemble nodes and edges for org-scoped compliance graph."""
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    node_ids: set[str] = set()
    edge_keys: set[tuple[str, str, str]] = set()

    def add_node(node: dict[str, Any]) -> None:
        nid = str(node["id"])
        if nid in node_ids:
            return
        node_ids.add(nid)
        nodes.append(node)

    def add_edge(edge: dict[str, Any]) -> None:
        key = (str(edge["from"]), str(edge["to"]), str(edge["type"]))
        if key in edge_keys:
            return
        edge_keys.add(key)
        edges.append(edge)

    fw_names = {str(r["id"]): str(r.get("name") or r["id"]) for r in frameworks}
    for fw in frameworks:
        fid = str(fw["id"])
        add_node(
            {
                "id": _framework_node_id(fid),
                "type": "framework",
                "label": fw_names.get(fid, fid),
                "framework_id": fid,
                "metadata": {},
            }
        )

    control_meta: dict[str, dict[str, Any]] = {}
    for row in ec_rows:
        cid = str(row["control_id"])
        fw = str(row["framework_id"])
        control_meta.setdefault(cid, {"framework_id": fw, "label": cid})

    for row in mappings:
        for col, fw_col in (
            ("source_control_id", "source_framework_id"),
            ("target_control_id", "target_framework_id"),
        ):
            cid = str(row[col])
            fw = str(row[fw_col])
            control_meta.setdefault(cid, {"framework_id": fw, "label": cid})

    for finding in findings:
        cid = str(finding.get("control_id") or "")
        if cid:
            control_meta.setdefault(
                cid,
                {
                    "framework_id": str(finding.get("framework_id") or ""),
                    "label": str(finding.get("control_name") or cid),
                },
            )

    for cid, meta in control_meta.items():
        add_node(
            {
                "id": _control_node_id(cid),
                "type": "control",
                "label": str(meta.get("label") or cid),
                "framework_id": meta.get("framework_id"),
                "metadata": {},
            }
        )
        fw = meta.get("framework_id")
        if fw:
            add_edge(
                {
                    "from": _framework_node_id(str(fw)),
                    "to": _control_node_id(cid),
                    "type": "contains",
                }
            )

    for row in mappings:
        add_edge(
            {
                "from": _control_node_id(str(row["source_control_id"])),
                "to": _control_node_id(str(row["target_control_id"])),
                "type": "maps_to",
                "relationship": row.get("relationship"),
                "confidence": float(row.get("confidence") or 1.0),
                "basis": row.get("basis") or "",
            }
        )

    for ev in evidence_rows:
        eid = str(ev["id"])
        proves_count = sum(1 for r in ec_rows if str(r["evidence_id"]) == eid)
        add_node(
            {
                "id": _evidence_node_id(eid),
                "type": "evidence",
                "label": str(ev.get("title") or eid),
                "status": ev.get("status"),
                "metadata": {
                    "proves_count": proves_count,
                    "evidence_type": ev.get("evidence_type"),
                    "source": ev.get("source"),
                    "description": ev.get("description"),
                    "collected_at": ev.get("collected_at"),
                    "expires_at": ev.get("expires_at"),
                },
            }
        )

    for row in ec_rows:
        eid = str(row["evidence_id"])
        cid = str(row["control_id"])
        add_edge(
            {
                "from": _evidence_node_id(eid),
                "to": _control_node_id(cid),
                "type": "proves",
                "strength": row.get("strength") or "FULL",
                "framework_id": row.get("framework_id"),
            }
        )

    for fe in framework_entities:
        eid = str(fe["entity_id"])
        add_node(
            {
                "id": _entity_node_id(eid),
                "type": "entity",
                "label": eid.replace("astralabs-", "AstraLabs ").upper(),
                "metadata": {"nca": fe.get("nca"), "scope": fe.get("scope")},
            }
        )
        add_edge(
            {
                "from": _framework_node_id(str(fe["framework_id"])),
                "to": _entity_node_id(eid),
                "type": "applies_to",
                "scope": fe.get("scope"),
            }
        )

    for finding in findings:
        fid = str(finding.get("id") or "")
        if not fid:
            continue
        node_id = f"finding:{fid}"
        add_node(
            {
                "id": node_id,
                "type": "finding",
                "label": str(finding.get("title") or fid),
                "severity": finding.get("severity"),
                "metadata": {
                    "status": finding.get("status"),
                    "owner": finding.get("owner"),
                    "due_date": finding.get("due_date"),
                    "entity_code": finding.get("entity_code"),
                },
            }
        )
        cid = str(finding.get("control_id") or "")
        if cid:
            add_edge({"from": node_id, "to": _control_node_id(cid), "type": "violates"})

    # ── Relationship graph: people / teams / systems / risks + generic edges ──
    for person in people or []:
        pid = str(person["id"])
        add_node(
            {
                "id": _typed_node_id("person", pid),
                "type": "person",
                "label": str(person.get("name") or pid),
                "metadata": {
                    "role": person.get("role"),
                    "email": person.get("email"),
                    "team_id": str(person["team_id"]) if person.get("team_id") else None,
                    "reports_to": str(person["reports_to"]) if person.get("reports_to") else None,
                },
            }
        )

    for team in teams or []:
        tid = str(team["id"])
        add_node(
            {
                "id": _typed_node_id("team", tid),
                "type": "team",
                "label": str(team.get("name") or tid),
                "metadata": {
                    "function": team.get("function"),
                    "lead_id": str(team["lead_id"]) if team.get("lead_id") else None,
                },
            }
        )

    for system in systems or []:
        sid = str(system["id"])
        add_node(
            {
                "id": _typed_node_id("system", sid),
                "type": "system",
                "label": str(system.get("name") or sid),
                "metadata": {
                    "system_type": system.get("system_type"),
                    "criticality": system.get("criticality"),
                    "processes_pii": bool(system.get("processes_pii")),
                    "owner_id": str(system["owner_id"]) if system.get("owner_id") else None,
                    "ai_risk_class": system.get("ai_risk_class"),
                },
            }
        )

    for risk in risks or []:
        rid = str(risk["id"])
        add_node(
            {
                "id": _typed_node_id("risk", rid),
                "type": "risk",
                "label": str(risk.get("title") or rid),
                "framework_id": risk.get("framework_id"),
                "metadata": {
                    "category": risk.get("category"),
                    "likelihood": risk.get("likelihood"),
                    "impact_eur": int(risk.get("impact_eur") or 0),
                    "framework_id": risk.get("framework_id"),
                },
            }
        )

    for rel in relationship_edges or []:
        from_id = _typed_node_id(str(rel["source_type"]), str(rel["source_id"]))
        to_id = _typed_node_id(str(rel["target_type"]), str(rel["target_id"]))
        # Skip dangling edges — only wire endpoints that resolved to real nodes.
        if from_id not in node_ids or to_id not in node_ids:
            continue
        add_edge(
            {
                "from": from_id,
                "to": to_id,
                "type": str(rel["relationship"]),
                "weight": float(rel.get("weight") or 1.0),
            }
        )

    stats = _compute_stats(nodes, edges, evidence_rows, ec_rows)
    return ComplianceGraphOut(org_id=org_id, nodes=nodes, edges=edges, stats=stats)


def subgraph_around_node(graph: ComplianceGraphOut, node_id: str) -> ComplianceGraphOut:
    """Return nodes/edges reachable within one hop of node_id (plus the center node)."""
    connected: set[str] = {node_id}
    for edge in graph.edges:
        f, t = str(edge["from"]), str(edge["to"])
        if f == node_id or t == node_id:
            connected.add(f)
            connected.add(t)

    nodes = [n for n in graph.nodes if str(n["id"]) in connected]
    node_set = {str(n["id"]) for n in nodes}
    edges = [
        e
        for e in graph.edges
        if str(e["from"]) in node_set and str(e["to"]) in node_set
    ]
    evidence_rows = [
        n
        for n in nodes
        if n.get("type") == "evidence"
    ]
    ec_rows = [
        {
            "evidence_id": e["from"].removeprefix("evidence:"),
            "control_id": e["to"].removeprefix("control:"),
            "framework_id": e.get("framework_id"),
            "strength": e.get("strength"),
        }
        for e in edges
        if e.get("type") == "proves"
    ]
    stats = _compute_stats(nodes, edges, evidence_rows, ec_rows)
    return ComplianceGraphOut(org_id=graph.org_id, nodes=nodes, edges=edges, stats=stats)


def trace_accountability_chain(
    graph: ComplianceGraphOut, finding_node_id: str
) -> ComplianceGraphOut:
    """Walk the accountability + exposure chain rooted at a finding.

    Follows only the relationship types that form the chain
    finding → control → owner → team → system → entity → risk, recording the hop
    distance per node (metadata.trace_hop) so the UI can stagger the reveal.
    Direction-agnostic BFS keeps the traversal robust to edge orientation.
    """
    adjacency: dict[str, list[dict[str, Any]]] = {}
    for edge in graph.edges:
        if str(edge.get("type")) not in _TRACE_RELATIONSHIPS:
            continue
        f, t = str(edge["from"]), str(edge["to"])
        adjacency.setdefault(f, []).append(edge)
        adjacency.setdefault(t, []).append(edge)

    hop_by_node: dict[str, int] = {finding_node_id: 0}
    chain_edge_keys: set[tuple[str, str, str]] = set()
    frontier = [finding_node_id]
    max_hops = 6
    while frontier:
        next_frontier: list[str] = []
        for current in frontier:
            depth = hop_by_node[current]
            if depth >= max_hops:
                continue
            for edge in adjacency.get(current, []):
                f, t = str(edge["from"]), str(edge["to"])
                other = t if f == current else f
                chain_edge_keys.add((f, t, str(edge["type"])))
                if other not in hop_by_node:
                    hop_by_node[other] = depth + 1
                    next_frontier.append(other)
        frontier = next_frontier

    nodes: list[dict[str, Any]] = []
    for n in graph.nodes:
        nid = str(n["id"])
        if nid in hop_by_node:
            node = dict(n)
            meta = dict(node.get("metadata") or {})
            meta["trace_hop"] = hop_by_node[nid]
            node["metadata"] = meta
            nodes.append(node)

    edges = [
        e
        for e in graph.edges
        if (str(e["from"]), str(e["to"]), str(e["type"])) in chain_edge_keys
    ]
    evidence_rows = [n for n in nodes if n.get("type") == "evidence"]
    stats = _compute_stats(nodes, edges, evidence_rows, [])
    return ComplianceGraphOut(org_id=graph.org_id, nodes=nodes, edges=edges, stats=stats)
