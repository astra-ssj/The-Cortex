import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useNavigate } from "react-router-dom";
import {
  useComplianceGraph,
  type ComplianceGraphEdge,
  type ComplianceGraphNode,
} from "../api/client";
import { useOrgContext } from "../hooks/useOrgContext";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/Skeleton";

type NodeFilter = "all" | "framework" | "evidence" | "finding" | "entity" | "control";

const NODE_COLORS: Record<string, string> = {
  framework: "#8b5cf6",
  control: "#3b82f6",
  evidence: "#22c55e",
  finding: "#f97316",
  entity: "#94a3b8",
};

const FILTER_OPTIONS: { id: NodeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "framework", label: "Frameworks" },
  { id: "evidence", label: "Evidence" },
  { id: "finding", label: "Findings" },
  { id: "entity", label: "Entities" },
  { id: "control", label: "Controls" },
];

function edgeStroke(edge: ComplianceGraphEdge): string {
  switch (edge.type) {
    case "maps_to":
      return "#3b82f6";
    case "proves":
      return "#22c55e";
    case "violates":
    case "affects":
      return "#f97316";
    case "applies_to":
      return "#94a3b8";
    default:
      return "#64748b";
  }
}

function edgeDash(edge: ComplianceGraphEdge): string | undefined {
  if (edge.type === "maps_to") return "6 4";
  if (edge.type === "applies_to") return "2 4";
  return undefined;
}

export default function ComplianceGraph() {
  const { orgId } = useOrgContext();
  const navigate = useNavigate();
  const { data, isLoading, error } = useComplianceGraph(orgId);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<NodeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 520 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setDims({ w: Math.max(400, cr.width), h: Math.max(360, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    if (filter === "all") return { nodes: data.nodes, edges: data.edges };
    const nodes = data.nodes.filter((n) => n.type === filter);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter((e) => ids.has(e.from) || ids.has(e.to));
    const connected = new Set<string>();
    for (const e of edges) {
      connected.add(e.from);
      connected.add(e.to);
    }
    return {
      nodes: nodes.filter((n) => connected.has(n.id) || filter === "control"),
      edges,
    };
  }, [data, filter]);

  const selectedNode = useMemo(
    () => data?.nodes.find((n) => n.id === selectedId) ?? null,
    [data, selectedId]
  );

  const connectedEdges = useMemo(() => {
    if (!data || !selectedId) return [];
    return data.edges.filter((e) => e.from === selectedId || e.to === selectedId);
  }, [data, selectedId]);

  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || filtered.nodes.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${dims.w} ${dims.h}`);

    const g = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (ev) => {
        g.attr("transform", ev.transform.toString());
      });
    svg.call(zoom as never);

    const simNodes = filtered.nodes.map((n) => ({ ...n }));
    const simLinks = filtered.edges.map((e) => ({
      ...e,
      source: e.from,
      target: e.to,
    }));

    const simulation = d3
      .forceSimulation(simNodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(simLinks)
          .id((d) => (d as ComplianceGraphNode).id)
          .distance(90)
      )
      .force("charge", d3.forceManyBody().strength(-280))
      .force("center", d3.forceCenter(dims.w / 2, dims.h / 2))
      .force("collision", d3.forceCollide(28));

    const link = g
      .append("g")
      .attr("stroke-opacity", 0.65)
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d) => edgeStroke(d as ComplianceGraphEdge))
      .attr("stroke-width", (d) => ((d as ComplianceGraphEdge).type === "proves" ? 2 : 1.5))
      .attr("stroke-dasharray", (d) => edgeDash(d as ComplianceGraphEdge) ?? null);

    const node = g
      .append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .attr("cursor", "grab")
      .call(
        d3
          .drag<SVGGElement, ComplianceGraphNode>()
          .on("start", (ev, d) => {
            if (!ev.active) simulation.alphaTarget(0.3).restart();
            (d as d3.SimulationNodeDatum & { fx?: number }).fx = (
              d as d3.SimulationNodeDatum
            ).x;
            (d as d3.SimulationNodeDatum & { fy?: number }).fy = (
              d as d3.SimulationNodeDatum
            ).y;
          })
          .on("drag", (ev, d) => {
            const nd = d as d3.SimulationNodeDatum & { fx?: number; fy?: number };
            nd.fx = ev.x;
            nd.fy = ev.y;
          })
          .on("end", (ev, d) => {
            if (!ev.active) simulation.alphaTarget(0);
            const nd = d as d3.SimulationNodeDatum & { fx?: number | null; fy?: number | null };
            nd.fx = undefined;
            nd.fy = undefined;
          }) as never
      );

    node
      .append("circle")
      .attr("r", (d) => (d.type === "framework" ? 14 : d.type === "evidence" ? 12 : 10))
      .attr("fill", (d) => NODE_COLORS[d.type] ?? "#64748b")
      .attr("stroke", (d) => (d.id === selectedId ? "#fff" : "transparent"))
      .attr("stroke-width", 2)
      .attr("opacity", (d) =>
        selectedId && d.id !== selectedId && !connectedTo(selectedId, d.id, filtered.edges)
          ? 0.35
          : 1
      )
      .on("click", (_ev, d) => setSelectedId(d.id))
      .append("title")
      .text((d) => d.label);

    node
      .append("text")
      .text((d) => (d.label.length > 22 ? `${d.label.slice(0, 20)}…` : d.label))
      .attr("x", 14)
      .attr("y", 4)
      .attr("font-size", 10)
      .attr("fill", "var(--text-secondary, #94a3b8)");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as d3.SimulationNodeDatum).x ?? 0)
        .attr("y1", (d) => (d.source as d3.SimulationNodeDatum).y ?? 0)
        .attr("x2", (d) => (d.target as d3.SimulationNodeDatum).x ?? 0)
        .attr("y2", (d) => (d.target as d3.SimulationNodeDatum).y ?? 0);
      node.attr(
        "transform",
        (d) => `translate(${(d as d3.SimulationNodeDatum).x ?? 0},${(d as d3.SimulationNodeDatum).y ?? 0})`
      );
    });

    return () => {
      simulation.stop();
    };
  }, [filtered, dims, selectedId]);

  useEffect(() => {
    const cleanup = renderGraph();
    return cleanup;
  }, [renderGraph]);

  if (isLoading) {
    return (
      <div style={{ paddingTop: 24 }}>
        <Skeleton height={32} width={280} />
        <Skeleton height={480} style={{ marginTop: 16 }} />
      </div>
    );
  }

  if (error) {
    return (
      <p style={{ color: "var(--red)", marginTop: 24 }}>
        Failed to load compliance graph: {error.message}
      </p>
    );
  }

  const empty =
    !data ||
    (data.nodes.length === 0 &&
      data.edges.length === 0 &&
      (!data.stats.total_nodes || data.stats.total_nodes === 0));

  if (empty) {
    return (
      <EmptyState
        icon="◎"
        title="Build your compliance graph"
        description="Connect your first integration to start mapping evidence across frameworks — test once, comply many."
        cta="Open integrations"
        onCta={() => navigate("/integrations")}
      />
    );
  }

  const stats = data.stats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--text-h2)", fontWeight: 700 }}>Compliance graph</h1>
          <p style={{ margin: "4px 0 0", color: "var(--dim)", fontSize: "var(--text-caption)" }}>
            Cross-framework control mappings and shared evidence — org {orgId}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              aria-pressed={filter === opt.id}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                fontWeight: 600,
                border: "1px solid var(--border-l)",
                background: filter === opt.id ? "var(--panel-elevated)" : "transparent",
                color: filter === opt.id ? "var(--text)" : "var(--dim)",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr minmax(280px, 35%)",
          gap: 16,
          minHeight: 520,
        }}
      >
        <div
          ref={containerRef}
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border-l)",
            borderRadius: "var(--radius-md)",
            minHeight: 520,
            overflow: "hidden",
          }}
        >
          <svg ref={svgRef} width="100%" height={dims.h} role="img" aria-label="Compliance graph" />
        </div>

        <aside
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border-l)",
            borderRadius: "var(--radius-md)",
            padding: 16,
            overflow: "auto",
            maxHeight: 560,
          }}
        >
          {selectedNode ? (
            <GraphDetailPanel node={selectedNode} edges={connectedEdges} allNodes={data.nodes} />
          ) : (
            <p style={{ color: "var(--dim)", fontSize: 13, margin: 0 }}>
              Click a node to inspect cross-framework links, evidence coverage, or finding impact.
            </p>
          )}
        </aside>
      </div>

      <footer
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          padding: "12px 16px",
          background: "var(--panel)",
          border: "1px solid var(--border-l)",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--text-caption)",
          color: "var(--dim)",
        }}
      >
        <span>
          <strong style={{ color: "var(--text)" }}>{stats.total_nodes}</strong> nodes
        </span>
        <span>
          <strong style={{ color: "var(--text)" }}>{stats.total_edges}</strong> edges
        </span>
        <span>
          <strong style={{ color: "var(--text)" }}>{stats.shared_evidence}</strong> shared evidence
        </span>
        <span>
          <strong style={{ color: "var(--text)" }}>{stats.work_reduction_pct}%</strong> work reduction
        </span>
        {stats.naive_assessments != null && stats.effective_assessments != null && (
          <span>
            {stats.effective_assessments} evidence collections instead of {stats.naive_assessments}{" "}
            separate control assessments
          </span>
        )}
      </footer>
    </div>
  );
}

function connectedTo(
  centerId: string,
  nodeId: string,
  edges: ComplianceGraphEdge[]
): boolean {
  if (centerId === nodeId) return true;
  return edges.some(
    (e) =>
      (e.from === centerId && e.to === nodeId) || (e.to === centerId && e.from === nodeId)
  );
}

function GraphDetailPanel({
  node,
  edges,
  allNodes,
}: {
  node: ComplianceGraphNode;
  edges: ComplianceGraphEdge[];
  allNodes: ComplianceGraphNode[];
}) {
  const byId = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  return (
    <div>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--dim)",
        }}
      >
        {node.type}
      </p>
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
        {node.label}
      </h2>
      {node.framework_id && (
        <p style={{ fontSize: 12, color: "var(--dim)", margin: "0 0 8px" }}>
          Framework: {node.framework_id}
        </p>
      )}
      {node.status && (
        <p style={{ fontSize: 12, margin: "0 0 8px" }}>
          Status: <strong>{node.status}</strong>
        </p>
      )}
      {node.severity && (
        <p style={{ fontSize: 12, margin: "0 0 8px" }}>
          Severity: <strong>{node.severity}</strong>
        </p>
      )}
      {node.type === "evidence" && node.metadata?.proves_count != null && (
        <p style={{ fontSize: 12, color: "var(--cyan)", margin: "0 0 12px" }}>
          Test once, comply many — proves {String(node.metadata.proves_count)} controls
        </p>
      )}
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" }}>
        {edges.map((e, i) => {
          const otherId = e.from === node.id ? e.to : e.from;
          const other = byId.get(otherId);
          return (
            <li key={`${e.type}-${i}`} style={{ marginBottom: 6 }}>
              {e.type}
              {e.relationship ? ` (${e.relationship})` : ""}
              {e.strength ? ` · ${e.strength}` : ""}
              {" → "}
              {other?.label ?? otherId}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
