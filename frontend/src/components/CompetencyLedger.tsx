/**
 * Shared Competency Ledger primitives.
 *
 * The individual ledger (/progress) and the org ledger (rows are people) render
 * the same four dimensions with the same thresholds. They share these components
 * so a score can never mean one thing on one screen and something else on another.
 *
 * Thresholds mirror core/competency.py: GAP_FLOOR 60, PROVEN_THRESHOLD 70 across
 * at least MIN_SCENARIOS_FOR_PROVEN scenarios.
 */

import { type CSSProperties } from "react";
import type { LearnerCompetency, LearnerDimension } from "../api/learning";

export const ledgerPanel: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-5)",
};

export const ledgerEyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

export function dimensionColor(dim: LearnerDimension): string {
  if (dim.is_gap) return "var(--red)";
  if (dim.proven) return "var(--green)";
  return "var(--amber)";
}

function statusLabel(dim: LearnerDimension): string {
  if (dim.is_gap) return "Gap";
  if (dim.proven) return "Proven";
  // Above the floor but not yet demonstrated in enough scenarios to be a claim.
  if (dim.scenarios_with_signal < 2) return "Unproven";
  return "Developing";
}

export function DimensionScoreCard({ dim }: { dim: LearnerDimension }) {
  const score = Math.max(0, Math.min(100, Number(dim.score) || 0));
  const color = dimensionColor(dim);
  return (
    <div
      style={{
        ...ledgerPanel,
        borderColor: dim.is_gap
          ? "color-mix(in srgb, var(--red) 40%, transparent)"
          : "var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ ...ledgerEyebrow, letterSpacing: "0.06em" }}>{dim.label}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color,
          }}
        >
          {statusLabel(dim)}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, color: "var(--text)" }}>
        {score}
      </div>
      <div
        style={{
          marginTop: 10,
          height: 4,
          borderRadius: 2,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${score}%`, height: "100%", background: color }} />
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--text-secondary)" }}>
        Best {dim.best} · {dim.scenarios_with_signal}{" "}
        {dim.scenarios_with_signal === 1 ? "scenario" : "scenarios"}
      </p>
    </div>
  );
}

export function DimensionGrid({ dimensions }: { dimensions: LearnerDimension[] }) {
  return (
    <div
      aria-label="Competency dimensions"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      {dimensions.map((dim) => (
        <DimensionScoreCard key={dim.dimension} dim={dim} />
      ))}
    </div>
  );
}

/** Track status: breadth (scenarios finished) next to depth (dimensions proven). */
export function TrackProgress({ rollup }: { rollup: LearnerCompetency }) {
  const { scenarios_completed: done, scenarios_available: total } = rollup;
  const proven = rollup.proven_dimensions.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={ledgerPanel}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={ledgerEyebrow}>ISO 27001:2022 track</div>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text)" }}>
            <strong>
              {done} of {total || "—"}
            </strong>{" "}
            scenarios complete · <strong>{proven} of 4</strong> dimensions proven
          </p>
        </div>
        <span
          style={{
            alignSelf: "center",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: rollup.track_complete ? "var(--green)" : "var(--text-secondary)",
            border: `1px solid color-mix(in srgb, ${
              rollup.track_complete ? "var(--green)" : "var(--text-secondary)"
            } 40%, transparent)`,
            borderRadius: 999,
            padding: "4px 10px",
          }}
        >
          {rollup.track_complete ? "Track complete" : "In progress"}
        </span>
      </div>
      <div
        style={{
          marginTop: 14,
          height: 6,
          borderRadius: 3,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--cyan)" }} />
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 11, lineHeight: 1.55, color: "var(--text-secondary)" }}>
        A dimension counts as proven at 70 or above in at least two different
        scenarios. One strong run is not mastery.
      </p>
    </div>
  );
}
