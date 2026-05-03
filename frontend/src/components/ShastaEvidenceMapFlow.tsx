import { useMemo, type CSSProperties } from "react";
import {
  Background,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ShastaEvidenceMapOut } from "../api/client";

const findingStyle: CSSProperties = {
  fontSize: 11,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  maxWidth: 280,
};

const controlStyle: CSSProperties = {
  ...findingStyle,
  borderColor: "color-mix(in srgb, var(--cyan) 35%, transparent)",
  color: "var(--cyan)",
};

function FlowCanvas({ data }: { data: ShastaEvidenceMapOut }) {
  const { nodes, edges } = useMemo(() => {
    const raw = data.nodes as Array<Record<string, unknown>>;
    const rawEdges = data.edges as Array<Record<string, unknown>>;
    const findings = raw.filter((n) => n.kind === "finding");
    const controls = raw.filter((n) => n.kind === "control");
    const ns: Node[] = [
      ...findings.map((n, i) => ({
        id: String(n.id),
        position: { x: 0, y: i * 92 },
        data: { label: String(n.label ?? n.id) },
        style: findingStyle,
      })),
      ...controls.map((n, i) => ({
        id: String(n.id),
        position: { x: 400, y: i * 56 },
        data: { label: String(n.label ?? n.id) },
        style: controlStyle,
      })),
    ];
    const es: Edge[] = rawEdges
      .filter((e) => e.kind === "maps_to")
      .map((e, i) => ({
        id: String(e.id ?? `edge-${i}`),
        source: String(e.source),
        target: String(e.target),
        style: { stroke: "var(--text-tertiary)", strokeWidth: 1.5 },
      }));
    return { nodes: ns, edges: es };
  }, [data]);

  return (
    <div
      style={{
        height: 440,
        width: "100%",
        borderRadius: 8,
        border: "1px solid var(--border)",
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="var(--border-subtle)" gap={16} />
        <Controls />
        <MiniMap
          style={{ background: "var(--surface)" }}
          maskColor="color-mix(in srgb, var(--elevated) 85%, transparent)"
        />
      </ReactFlow>
    </div>
  );
}

/** Read-only graph from the same JSON as GET …/evidence-map (findings left, controls right). */
export function ShastaEvidenceMapFlow({ data }: { data: ShastaEvidenceMapOut }) {
  return (
    <ReactFlowProvider>
      <FlowCanvas data={data} />
    </ReactFlowProvider>
  );
}
