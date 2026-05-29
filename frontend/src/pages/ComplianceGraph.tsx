import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchFindingTrace,
  useComplianceGraph,
  type ComplianceGraphEdge,
  type ComplianceGraphNode,
  type ComplianceGraphNodeType,
} from "../api/client";
import { useOrgContext } from "../hooks/useOrgContext";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/Skeleton";

type LayoutMode = "force" | "layered" | "radial";

type SimNode = ComplianceGraphNode &
  d3.SimulationNodeDatum & { fx?: number | null; fy?: number | null };

type SimLink = ComplianceGraphEdge & {
  source: string | SimNode;
  target: string | SimNode;
};

type TraceState = {
  hopById: Record<string, number>;
  edgeKeys: Set<string>;
  maxHop: number;
};

const NODE_COLORS: Record<ComplianceGraphNodeType, string> = {
  framework: "#8b5cf6",
  control: "#3b82f6",
  evidence: "#22c55e",
  finding: "#f97316",
  entity: "#94a3b8",
  person: "#7F77DD",
  team: "#D4537E",
  system: "#BA7517",
  risk: "#E24B4A",
};

const NODE_TYPE_ORDER: ComplianceGraphNodeType[] = [
  "framework",
  "control",
  "evidence",
  "finding",
  "entity",
  "person",
  "team",
  "system",
  "risk",
];

const NODE_TYPE_LABELS: Record<ComplianceGraphNodeType, string> = {
  framework: "Framework",
  control: "Control",
  evidence: "Evidence",
  finding: "Finding",
  entity: "Entity",
  person: "Person",
  team: "Team",
  system: "System",
  risk: "Risk",
};

// Horizontal tiers for the layered layout (top → bottom): risk flows down to entities.
const TIER_BY_TYPE: Record<ComplianceGraphNodeType, number> = {
  risk: 0,
  framework: 1,
  control: 2,
  evidence: 3,
  finding: 3,
  system: 4,
  person: 5,
  team: 5,
  entity: 6,
};
const TIER_COUNT = 7;

const EDGE_COLORS: Record<string, string> = {
  maps_to: "#3b82f6",
  proves: "#22c55e",
  violates: "#f97316",
  affects: "#f97316",
  applies_to: "#94a3b8",
  contains: "#64748b",
  owns: "#7F77DD",
  member_of: "#D4537E",
  responsible_for: "#D4537E",
  reports_to: "#a78bfa",
  operates: "#BA7517",
  subject_to: "#BA7517",
  processes_data_on: "#94a3b8",
  exposes_to: "#E24B4A",
  mitigates: "#22c55e",
};

const LAYOUTS: { id: LayoutMode; label: string }[] = [
  { id: "force", label: "Force" },
  { id: "layered", label: "Layered" },
  { id: "radial", label: "Radial" },
];

const HUB_DEGREE = 5;
const MAX_LABEL = 18;

function edgeColor(edge: ComplianceGraphEdge): string {
  return EDGE_COLORS[edge.type] ?? "#64748b";
}

function edgeDash(edge: ComplianceGraphEdge): string | undefined {
  if (edge.type === "maps_to") return "6 4";
  if (edge.type === "applies_to") return "2 4";
  if (edge.type === "reports_to") return "1 4";
  return undefined;
}

function baseRadius(type: ComplianceGraphNodeType): number {
  if (type === "framework") return 14;
  if (type === "risk") return 13;
  if (type === "evidence" || type === "system") return 12;
  if (type === "person" || type === "team") return 11;
  return 10;
}

function truncate(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

function formatEur(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${Math.round(value / 1_000)}k`;
  return `€${value}`;
}

function edgeNodeId(end: string | SimNode): string {
  return typeof end === "string" ? end : end.id;
}

export default function ComplianceGraph() {
  const { orgId } = useOrgContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightRaw = searchParams.get("highlight");
  const focusRaw = searchParams.get("focus");
  const { data, isLoading, error } = useComplianceGraph(orgId);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeSelRef = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null>(null);
  const linkSelRef = useRef<d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null>(null);

  const [layout, setLayout] = useState<LayoutMode>("force");
  const [visibleTypes, setVisibleTypes] = useState<Set<ComplianceGraphNodeType>>(
    () => new Set(NODE_TYPE_ORDER)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceState | null>(null);
  // Multi-node focus driven by an insight's "Trace in graph →" deep-link (?focus=a,b,c).
  const [focusSet, setFocusSet] = useState<Set<string>>(() => new Set());
  const [revealedHop, setRevealedHop] = useState(0);
  const [tracing, setTracing] = useState(false);
  const [dims, setDims] = useState({ w: 800, h: 560 });

  useEffect(() => {
    if (!highlightRaw || !data?.nodes.length) return;
    const target = highlightRaw.startsWith("evidence:")
      ? highlightRaw
      : `evidence:${highlightRaw}`;
    if (data.nodes.some((n) => n.id === target)) {
      setSelectedId(target);
    }
  }, [highlightRaw, data?.nodes]);

  // Insight deep-link: light up the related nodes and centre the chain in focus mode.
  useEffect(() => {
    if (!focusRaw || !data?.nodes.length) {
      setFocusSet(new Set());
      return;
    }
    const present = new Set(data.nodes.map((n) => n.id));
    const ids = focusRaw
      .split(",")
      .map((s) => s.trim())
      .filter((id) => present.has(id));
    if (ids.length === 0) {
      setFocusSet(new Set());
      return;
    }
    setVisibleTypes(new Set(NODE_TYPE_ORDER));
    setTrace(null);
    setFocusSet(new Set(ids));
    setSelectedId(ids[0] ?? null);
  }, [focusRaw, data?.nodes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setDims({ w: Math.max(400, cr.width), h: Math.max(420, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Legend toggles a node type on/off (acts as a filter).
  const toggleType = useCallback((type: ComplianceGraphNodeType) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!data) return { nodes: [] as ComplianceGraphNode[], edges: [] as ComplianceGraphEdge[] };
    const nodes = data.nodes.filter((n) => visibleTypes.has(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes, edges };
  }, [data, visibleTypes]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of filtered.edges) {
      if (!map.has(e.from)) map.set(e.from, new Set());
      if (!map.has(e.to)) map.set(e.to, new Set());
      map.get(e.from)!.add(e.to);
      map.get(e.to)!.add(e.from);
    }
    return map;
  }, [filtered.edges]);

  const degreeOf = useCallback((id: string) => adjacency.get(id)?.size ?? 0, [adjacency]);

  const neighbourIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    return adjacency.get(selectedId) ?? new Set<string>();
  }, [adjacency, selectedId]);

  // Radial mode centres on the selection (or the busiest node when nothing is picked).
  const radialCenterId = useMemo(() => {
    const first = filtered.nodes[0];
    if (layout !== "radial" || !first) return null;
    if (selectedId && filtered.nodes.some((n) => n.id === selectedId)) return selectedId;
    return filtered.nodes.reduce(
      (best, n) => (degreeOf(n.id) > degreeOf(best) ? n.id : best),
      first.id
    );
  }, [layout, filtered.nodes, selectedId, degreeOf]);

  // Distance from the radial centre (0 = centre, 1 = inner ring, 2 = outer ring).
  const radialDist = useMemo(() => {
    if (!radialCenterId) return null;
    const dist = new Map<string, number>([[radialCenterId, 0]]);
    let frontier = [radialCenterId];
    for (let hop = 1; hop <= 2; hop += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nb of adjacency.get(id) ?? []) {
          if (!dist.has(nb)) {
            dist.set(nb, hop);
            next.push(nb);
          }
        }
      }
      frontier = next;
    }
    return dist;
  }, [radialCenterId, adjacency]);

  const selectedNode = useMemo(
    () => data?.nodes.find((n) => n.id === selectedId) ?? null,
    [data, selectedId]
  );

  const connectedEdges = useMemo(() => {
    if (!data || !selectedId) return [];
    return data.edges.filter((e) => e.from === selectedId || e.to === selectedId);
  }, [data, selectedId]);

  const clearFocus = useCallback(() => {
    setSelectedId(null);
    setTrace(null);
    setFocusSet(new Set());
  }, []);

  const handleTrace = useCallback(
    async (findingNodeId: string) => {
      setTracing(true);
      try {
        const res = await fetchFindingTrace(orgId, findingNodeId);
        const hopById: Record<string, number> = {};
        let maxHop = 0;
        for (const n of res.nodes) {
          const hop = Number((n.metadata as Record<string, unknown> | undefined)?.trace_hop ?? 0);
          hopById[n.id] = hop;
          if (hop > maxHop) maxHop = hop;
        }
        const edgeKeys = new Set(res.edges.map((e) => `${e.from}|${e.to}|${e.type}`));
        // Make sure every traced type is visible so the chain renders fully.
        setVisibleTypes(new Set(NODE_TYPE_ORDER));
        setSelectedId(findingNodeId);
        setTrace({ hopById, edgeKeys, maxHop });
      } finally {
        setTracing(false);
      }
    },
    [orgId]
  );

  // Stagger the trace reveal — one hop every 200ms (the demo moment).
  useEffect(() => {
    if (!trace) {
      setRevealedHop(0);
      return;
    }
    setRevealedHop(0);
    let hop = 0;
    const iv = setInterval(() => {
      hop += 1;
      setRevealedHop(hop);
      if (hop >= trace.maxHop) clearInterval(iv);
    }, 200);
    return () => clearInterval(iv);
  }, [trace]);

  // ── Build the simulation + selections (only rebuilds on structural changes) ──
  const renderGraph = useCallback(() => {
    const svgEl = svgRef.current;
    if (!svgEl || filtered.nodes.length === 0) {
      nodeSelRef.current = null;
      linkSelRef.current = null;
      return;
    }

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${dims.w} ${dims.h}`);

    const g = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (ev) => g.attr("transform", ev.transform.toString()));
    svg.call(zoom as never);

    const cx = dims.w / 2;
    const cy = dims.h / 2;

    const inRadial = layout === "radial" && radialCenterId && radialDist;
    const sourceNodes = inRadial
      ? filtered.nodes.filter((n) => radialDist!.has(n.id))
      : filtered.nodes;
    const nodeIdSet = new Set(sourceNodes.map((n) => n.id));

    const simNodes: SimNode[] = sourceNodes.map((n) => ({ ...n }));
    const simLinks: SimLink[] = filtered.edges
      .filter((e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to))
      .map((e) => ({ ...e, source: e.from, target: e.to }));

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(layout === "layered" ? 60 : 90)
          .strength(layout === "layered" ? 0.2 : 0.6)
      );

    if (layout === "force") {
      simulation
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(cx, cy))
        // Label-aware collision: hubs reserve extra room so labels stop overlapping.
        .force(
          "collision",
          d3.forceCollide<SimNode>().radius((d) => baseRadius(d.type) + (degreeOf(d.id) > HUB_DEGREE ? 34 : 16))
        );
    } else if (layout === "layered") {
      const top = 56;
      const bottom = dims.h - 40;
      const tierY = (tier: number) => top + (tier * (bottom - top)) / (TIER_COUNT - 1);
      simulation
        .force("charge", d3.forceManyBody().strength(-110))
        .force("x", d3.forceX<SimNode>(cx).strength(0.05))
        .force("y", d3.forceY<SimNode>((d) => tierY(TIER_BY_TYPE[d.type])).strength(1))
        .force("collision", d3.forceCollide<SimNode>().radius((d) => baseRadius(d.type) + 14));
    } else {
      const ringStep = Math.min(dims.w, dims.h) / 2 / 3;
      for (const n of simNodes) {
        if (radialDist!.get(n.id) === 0) {
          n.fx = cx;
          n.fy = cy;
        }
      }
      simulation
        .force("charge", d3.forceManyBody().strength(-220))
        .force(
          "r",
          d3
            .forceRadial<SimNode>((d) => (radialDist!.get(d.id) ?? 2) * ringStep, cx, cy)
            .strength(0.9)
        )
        .force("collision", d3.forceCollide<SimNode>().radius((d) => baseRadius(d.type) + 18));
    }

    const link = g
      .append("g")
      .selectAll<SVGLineElement, SimLink>("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d) => edgeColor(d))
      .attr("stroke-width", (d) => (d.type === "proves" || d.type === "exposes_to" ? 2 : 1.5))
      .attr("stroke-dasharray", (d) => edgeDash(d) ?? null);

    const node = g
      .append("g")
      .selectAll<SVGGElement, SimNode>("g")
      .data(simNodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (_ev, d) => {
        setTrace(null);
        setSelectedId(d.id);
      })
      .on("mouseenter", (_ev, d) => setHoverId(d.id))
      .on("mouseleave", () => setHoverId(null))
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", (ev, d) => {
            if (!ev.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (ev, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on("end", (ev, d) => {
            if (!ev.active) simulation.alphaTarget(0);
            // Keep radial centre pinned; release everything else.
            if (!(inRadial && radialDist!.get(d.id) === 0)) {
              d.fx = null;
              d.fy = null;
            }
          }) as never
      );

    node
      .append("circle")
      .attr("class", "node-circle")
      .attr("r", (d) => baseRadius(d.type))
      .attr("fill", (d) => NODE_COLORS[d.type] ?? "#64748b")
      .attr("stroke-width", 2)
      .append("title")
      .text((d) => `${NODE_TYPE_LABELS[d.type]}: ${d.label}`);

    const labelGroup = node.append("g").attr("class", "node-label");
    labelGroup
      .append("rect")
      .attr("class", "label-bg")
      .attr("x", 12)
      .attr("y", -9)
      .attr("height", 16)
      .attr("width", (d) => truncate(d.label).length * 6.2 + 8)
      .attr("rx", 3)
      .attr("fill", "rgba(15, 23, 42, 0.85)");
    labelGroup
      .append("text")
      .attr("class", "label-text")
      .text((d) => truncate(d.label))
      .attr("x", 16)
      .attr("y", 3)
      .attr("font-size", 10)
      .attr("fill", "#e2e8f0");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);
      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    nodeSelRef.current = node;
    linkSelRef.current = link;

    return () => {
      simulation.stop();
    };
  }, [filtered, dims, layout, radialCenterId, radialDist, degreeOf]);

  useEffect(() => {
    const cleanup = renderGraph();
    return cleanup;
  }, [renderGraph]);

  // ── Apply focus / trace / hover styling without rebuilding the simulation ──
  useEffect(() => {
    const node = nodeSelRef.current;
    const link = linkSelRef.current;
    if (!node || !link) return;

    const traceActive = trace != null;
    const focusActive = !traceActive && focusSet.size > 0;
    const isRevealed = (id: string) =>
      traceActive && trace!.hopById[id] != null && trace!.hopById[id] <= revealedHop;

    node
      .select<SVGCircleElement>("circle.node-circle")
      .attr("r", (d) => {
        const base = baseRadius(d.type);
        if (traceActive) return isRevealed(d.id) ? base * (trace!.hopById[d.id] === 0 ? 1.4 : 1.15) : base;
        if (focusActive) return focusSet.has(d.id) ? base * 1.3 : base;
        return d.id === selectedId ? base * 1.4 : base;
      })
      .attr("opacity", (d) => {
        if (traceActive) return isRevealed(d.id) ? 1 : 0.08;
        if (focusActive) return focusSet.has(d.id) ? 1 : 0.12;
        if (selectedId) return d.id === selectedId || neighbourIds.has(d.id) ? 1 : 0.1;
        return 1;
      })
      .attr("stroke", (d) =>
        d.id === selectedId || (focusActive && focusSet.has(d.id)) ? "#fff" : "transparent"
      );

    link.attr("opacity", (d) => {
      const from = edgeNodeId(d.source);
      const to = edgeNodeId(d.target);
      if (traceActive) {
        const key = `${from}|${to}|${d.type}`;
        return trace!.edgeKeys.has(key) && isRevealed(from) && isRevealed(to) ? 0.95 : 0.04;
      }
      if (focusActive) return focusSet.has(from) && focusSet.has(to) ? 0.95 : 0.06;
      if (selectedId) return from === selectedId || to === selectedId ? 0.7 : 0.05;
      return 0.6;
    });

    node.select<SVGGElement>("g.node-label").attr("display", (d) => {
      let show: boolean;
      if (traceActive) show = isRevealed(d.id);
      else if (focusActive) show = focusSet.has(d.id);
      else
        show =
          d.id === selectedId ||
          neighbourIds.has(d.id) ||
          degreeOf(d.id) > HUB_DEGREE ||
          d.id === hoverId;
      return show ? null : "none";
    });
  }, [selectedId, hoverId, neighbourIds, trace, revealedHop, focusSet, degreeOf, renderGraph]);

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
        Failed to load relationship graph: {error.message}
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
        title="Build your relationship graph"
        description="Connect your first integration to start mapping people, teams, systems, and risk across frameworks — test once, comply many."
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
          <h1 style={{ margin: 0, fontSize: "var(--text-h2)", fontWeight: 700 }}>Relationship graph</h1>
          <p style={{ margin: "4px 0 0", color: "var(--dim)", fontSize: "var(--text-caption)" }}>
            People, teams, systems &amp; risk across frameworks — org {orgId}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 0, border: "1px solid var(--border-l)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
            {LAYOUTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLayout(opt.id)}
                aria-pressed={layout === opt.id}
                style={{
                  padding: "6px 14px",
                  fontSize: "var(--text-caption)",
                  fontWeight: 600,
                  border: "none",
                  background: layout === opt.id ? "var(--panel-elevated)" : "transparent",
                  color: layout === opt.id ? "var(--text)" : "var(--dim)",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {(selectedId || trace) && (
            <button
              type="button"
              onClick={clearFocus}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                fontWeight: 600,
                border: "1px solid var(--border-l)",
                background: "transparent",
                color: "var(--dim)",
                cursor: "pointer",
              }}
            >
              Clear focus
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr minmax(280px, 34%)",
          gap: 16,
          minHeight: 560,
        }}
      >
        <div
          ref={containerRef}
          style={{
            position: "relative",
            background: "var(--panel)",
            border: "1px solid var(--border-l)",
            borderRadius: "var(--radius-md)",
            minHeight: 560,
            overflow: "hidden",
          }}
        >
          <svg ref={svgRef} width="100%" height={dims.h} role="img" aria-label="Relationship graph" />
          <Legend visibleTypes={visibleTypes} onToggle={toggleType} counts={stats.node_type_counts} />
        </div>

        <aside
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border-l)",
            borderRadius: "var(--radius-md)",
            padding: 16,
            overflow: "auto",
            maxHeight: 600,
          }}
        >
          {selectedNode ? (
            <GraphDetailPanel
              node={selectedNode}
              edges={connectedEdges}
              allNodes={data.nodes}
              allEdges={data.edges}
              tracing={tracing}
              onTrace={handleTrace}
              onSelect={setSelectedId}
            />
          ) : (
            <p style={{ color: "var(--dim)", fontSize: 13, margin: 0 }}>
              Click a node to inspect accountability, evidence coverage, systems, or risk exposure.
              Select a finding and hit <strong>Trace</strong> to light up the full chain.
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
        <Stat value={String(stats.total_nodes)} label="nodes" />
        <Stat value={String(stats.total_edges)} label="edges" />
        <Stat value={String(stats.shared_evidence)} label="shared evidence" />
        <Stat value={`${stats.work_reduction_pct}%`} label="work reduction" />
        <Stat value={`${stats.ownership_coverage_pct ?? 0}%`} label="ownership coverage" />
        <Stat
          value={formatEur(stats.total_risk_exposure_eur ?? 0)}
          label="total risk exposure"
          color="var(--red, #E24B4A)"
        />
        <Stat
          value={String(stats.unowned_controls ?? 0)}
          label="unowned controls"
          color={(stats.unowned_controls ?? 0) > 0 ? "var(--amber, #BA7517)" : undefined}
        />
      </footer>
    </div>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <span>
      <strong style={{ color: color ?? "var(--text)" }}>{value}</strong> {label}
    </span>
  );
}

function Legend({
  visibleTypes,
  onToggle,
  counts,
}: {
  visibleTypes: Set<ComplianceGraphNodeType>;
  onToggle: (type: ComplianceGraphNodeType) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        display: "grid",
        gridTemplateColumns: "repeat(3, auto)",
        gap: "4px 10px",
        padding: "10px 12px",
        background: "rgba(15, 23, 42, 0.78)",
        border: "1px solid var(--border-l)",
        borderRadius: "var(--radius-sm)",
        backdropFilter: "blur(4px)",
      }}
    >
      {NODE_TYPE_ORDER.map((type) => {
        const active = visibleTypes.has(type);
        const count = counts?.[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => onToggle(type)}
            aria-pressed={active}
            title={`Toggle ${NODE_TYPE_LABELS[type]}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 11,
              opacity: active ? 1 : 0.4,
              color: "#e2e8f0",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: NODE_COLORS[type],
                flexShrink: 0,
              }}
            />
            {NODE_TYPE_LABELS[type]}
            {count != null ? ` (${count})` : ""}
          </button>
        );
      })}
    </div>
  );
}

function asMeta(node: ComplianceGraphNode): Record<string, unknown> {
  return (node.metadata as Record<string, unknown> | undefined) ?? {};
}

function GraphDetailPanel({
  node,
  edges,
  allNodes,
  allEdges,
  tracing,
  onTrace,
  onSelect,
}: {
  node: ComplianceGraphNode;
  edges: ComplianceGraphEdge[];
  allNodes: ComplianceGraphNode[];
  allEdges: ComplianceGraphEdge[];
  tracing: boolean;
  onTrace: (findingNodeId: string) => void;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);
  const meta = asMeta(node);

  const labelFor = useCallback((id: string) => byId.get(id)?.label ?? id, [byId]);

  // Edges grouped by relationship type for the typed views below.
  const out = useMemo(
    () => edges.filter((e) => e.from === node.id),
    [edges, node.id]
  );
  const inc = useMemo(
    () => edges.filter((e) => e.to === node.id),
    [edges, node.id]
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p
          style={{
            margin: "0 0 6px",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: NODE_COLORS[node.type] ?? "var(--dim)",
            fontWeight: 700,
          }}
        >
          {NODE_TYPE_LABELS[node.type] ?? node.type}
        </p>
      </div>
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
        {node.label}
      </h2>

      {node.type === "person" && (
        <PersonDetail node={node} meta={meta} out={out} inc={inc} byId={byId} onSelect={onSelect} />
      )}
      {node.type === "team" && (
        <TeamDetail meta={meta} out={out} allEdges={allEdges} byId={byId} onSelect={onSelect} />
      )}
      {node.type === "system" && (
        <SystemDetail meta={meta} out={out} inc={inc} labelFor={labelFor} onSelect={onSelect} />
      )}
      {node.type === "risk" && (
        <RiskDetail node={node} meta={meta} inc={inc} labelFor={labelFor} />
      )}

      {node.framework_id && node.type !== "risk" && (
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
      {node.type === "evidence" && meta.proves_count != null && (
        <p style={{ fontSize: 12, color: "var(--cyan)", margin: "0 0 12px" }}>
          Test once, comply many — proves {String(meta.proves_count)} controls
        </p>
      )}

      {node.type === "finding" && (
        <button
          type="button"
          disabled={tracing}
          onClick={() => onTrace(node.id)}
          style={{
            margin: "4px 0 14px",
            padding: "8px 14px",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            fontWeight: 700,
            border: "1px solid var(--red, #E24B4A)",
            background: "rgba(226, 75, 74, 0.12)",
            color: "var(--red, #E24B4A)",
            cursor: tracing ? "wait" : "pointer",
          }}
        >
          {tracing ? "Tracing…" : "⚡ Trace accountability chain"}
        </button>
      )}

      <p
        style={{
          margin: "8px 0 6px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--dim)",
        }}
      >
        Connections ({edges.length})
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)" }}>
        {edges.map((e, i) => {
          const otherId = e.from === node.id ? e.to : e.from;
          const other = byId.get(otherId);
          return (
            <li key={`${e.type}-${i}`} style={{ marginBottom: 6 }}>
              <span style={{ color: EDGE_COLORS[e.type] ?? "var(--dim)" }}>{e.type}</span>
              {e.strength ? ` · ${e.strength}` : ""}
              {" → "}
              <button
                type="button"
                onClick={() => onSelect(otherId)}
                style={{ background: "none", border: "none", padding: 0, color: "var(--text-secondary)", cursor: "pointer", textDecoration: "underline" }}
              >
                {other?.label ?? otherId}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <p style={{ fontSize: 12, margin: "0 0 6px", color: "var(--text-secondary)" }}>
      {label}: <strong style={{ color: "var(--text)" }}>{value}</strong>
    </p>
  );
}

function PersonDetail({
  node,
  meta,
  out,
  inc,
  byId,
  onSelect,
}: {
  node: ComplianceGraphNode;
  meta: Record<string, unknown>;
  out: ComplianceGraphEdge[];
  inc: ComplianceGraphEdge[];
  byId: Map<string, ComplianceGraphNode>;
  onSelect: (id: string) => void;
}) {
  const controls = out.filter((e) => e.type === "owns");
  const systems = out.filter((e) => e.type === "operates");
  const team = out.find((e) => e.type === "member_of");
  const reportsTo = out.find((e) => e.type === "reports_to");
  const directReports = inc.filter((e) => e.type === "reports_to");
  const load = controls.length + systems.length;

  return (
    <div style={{ marginBottom: 10 }}>
      <DetailRow label="Role" value={meta.role as string} />
      {team && (
        <DetailRow
          label="Team"
          value={
            <button type="button" onClick={() => onSelect(team.to)} style={linkBtn}>
              {byId.get(team.to)?.label ?? team.to}
            </button>
          }
        />
      )}
      {reportsTo && (
        <DetailRow
          label="Reports to"
          value={
            <button type="button" onClick={() => onSelect(reportsTo.to)} style={linkBtn}>
              {byId.get(reportsTo.to)?.label ?? reportsTo.to}
            </button>
          }
        />
      )}
      {directReports.length > 0 && (
        <DetailRow label="Direct reports" value={directReports.map((e) => byId.get(e.from)?.label ?? e.from).join(", ")} />
      )}
      <DetailRow label="Controls owned" value={controls.length > 0 ? controls.map((e) => byId.get(e.to)?.label ?? e.to).join(", ") : "none"} />
      <DetailRow label="Systems operated" value={systems.length > 0 ? systems.map((e) => byId.get(e.to)?.label ?? e.to).join(", ") : "none"} />
      <p style={{ fontSize: 12, margin: "8px 0 12px", color: load > 0 ? "var(--amber, #BA7517)" : "var(--dim)" }}>
        Accountability load: <strong>{load}</strong> ({controls.length} controls + {systems.length} systems)
      </p>
      {!meta.role && <span style={{ display: "none" }}>{node.id}</span>}
    </div>
  );
}

function TeamDetail({
  meta,
  out,
  allEdges,
  byId,
  onSelect,
}: {
  meta: Record<string, unknown>;
  out: ComplianceGraphEdge[];
  allEdges: ComplianceGraphEdge[];
  byId: Map<string, ComplianceGraphNode>;
  onSelect: (id: string) => void;
}) {
  const frameworks = out.filter((e) => e.type === "responsible_for");
  // Members come from incoming member_of edges (need the full edge set).
  const teamId = useMemo(() => frameworks[0]?.from, [frameworks]);
  const memberEdges = useMemo(
    () => allEdges.filter((e) => e.type === "member_of" && (teamId ? e.to === teamId : false)),
    [allEdges, teamId]
  );
  const memberIds = useMemo(() => new Set(memberEdges.map((e) => e.from)), [memberEdges]);
  const controlsUnderTeam = useMemo(
    () => allEdges.filter((e) => e.type === "owns" && memberIds.has(e.from)).length,
    [allEdges, memberIds]
  );
  const lead = meta.lead_id ? byId.get(`person:${String(meta.lead_id)}`) : undefined;

  return (
    <div style={{ marginBottom: 10 }}>
      <DetailRow label="Function" value={meta.function as string} />
      {lead && (
        <DetailRow
          label="Lead"
          value={
            <button type="button" onClick={() => onSelect(lead.id)} style={linkBtn}>
              {lead.label}
            </button>
          }
        />
      )}
      <DetailRow
        label="Frameworks owned"
        value={frameworks.length > 0 ? frameworks.map((e) => byId.get(e.to)?.label ?? e.to).join(", ") : "none"}
      />
      <DetailRow
        label="Members"
        value={memberEdges.length > 0 ? memberEdges.map((e) => byId.get(e.from)?.label ?? e.from).join(", ") : "none"}
      />
      <DetailRow label="Controls under team ownership" value={controlsUnderTeam} />
    </div>
  );
}

function SystemDetail({
  meta,
  out,
  inc,
  labelFor,
  onSelect,
}: {
  meta: Record<string, unknown>;
  out: ComplianceGraphEdge[];
  inc: ComplianceGraphEdge[];
  labelFor: (id: string) => string;
  onSelect: (id: string) => void;
}) {
  const entities = out.filter((e) => e.type === "processes_data_on");
  const controls = out.filter((e) => e.type === "subject_to");
  const operator = inc.find((e) => e.type === "operates");
  const aiClass = meta.ai_risk_class as string | undefined;

  return (
    <div style={{ marginBottom: 10 }}>
      <DetailRow label="Type" value={meta.system_type as string} />
      <DetailRow label="Criticality" value={meta.criticality as string} />
      <DetailRow label="Processes PII" value={meta.processes_pii ? "Yes" : "No"} />
      {aiClass && <DetailRow label="AI risk class" value={aiClass} />}
      {operator && (
        <DetailRow
          label="Operated by"
          value={
            <button type="button" onClick={() => onSelect(operator.from)} style={linkBtn}>
              {labelFor(operator.from)}
            </button>
          }
        />
      )}
      <DetailRow
        label="Processes data on"
        value={entities.length > 0 ? entities.map((e) => labelFor(e.to)).join(", ") : "none"}
      />
      <DetailRow
        label="Subject to controls"
        value={controls.length > 0 ? controls.map((e) => labelFor(e.to)).join(", ") : "none"}
      />
    </div>
  );
}

function RiskDetail({
  node,
  meta,
  inc,
  labelFor,
}: {
  node: ComplianceGraphNode;
  meta: Record<string, unknown>;
  inc: ComplianceGraphEdge[];
  labelFor: (id: string) => string;
}) {
  const findings = inc.filter((e) => e.type === "exposes_to");
  const impact = Number(meta.impact_eur ?? 0);

  return (
    <div style={{ marginBottom: 10 }}>
      <DetailRow label="Category" value={meta.category as string} />
      <DetailRow label="Likelihood" value={meta.likelihood as string} />
      <DetailRow label="Financial impact" value={formatEur(impact)} />
      <DetailRow label="Driven by" value={(meta.framework_id as string) ?? node.framework_id} />
      <DetailRow
        label="Exposed by findings"
        value={findings.length > 0 ? findings.map((e) => labelFor(e.from)).join(", ") : "none"}
      />
      <p style={{ fontSize: 12, margin: "8px 0 12px", color: "var(--red, #E24B4A)" }}>
        If realised: up to <strong>{formatEur(impact)}</strong> in {(meta.category as string)?.toLowerCase() ?? "regulatory"} exposure.
      </p>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "inherit",
  cursor: "pointer",
  textDecoration: "underline",
  font: "inherit",
};
