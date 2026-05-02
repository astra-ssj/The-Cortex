import type { ShastaEvidenceMapOut } from "../api/client";

/** Derive table rows from API / mock graph JSON (same shape as GET …/evidence-map). */
export function buildEvidenceMapRows(mapOut: ShastaEvidenceMapOut): Array<{
  fn: {
    id: string;
    kind?: string;
    label?: string;
    severity?: string;
  };
  controls: Array<{
    id: string;
    kind?: string;
    label?: string;
    family?: string;
  }>;
}> {
  const nodes = mapOut.nodes as Array<{
    id: string;
    kind?: string;
    label?: string;
    severity?: string;
    family?: string;
  }>;
  const edges = mapOut.edges as Array<{
    id?: string;
    source?: string;
    target?: string;
    kind?: string;
  }>;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const findings = nodes.filter((n) => n.kind === "finding");
  return findings.map((fn) => {
    const outs = edges.filter((e) => e.kind === "maps_to" && e.source === fn.id);
    const controls = outs
      .map((e) => nodeById.get(String(e.target ?? "")))
      .filter((c): c is NonNullable<typeof c> => Boolean(c && c.kind === "control"));
    return { fn, controls };
  });
}
