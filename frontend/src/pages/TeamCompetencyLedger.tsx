/**
 * Org Competency Ledger — one row per person, same layout as the individual ledger.
 *
 * A manager opens this to see who needs attention. Weakest learners sort first
 * on the server. Gated on view_team_competency.
 */

import { type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTeamCompetency, type LearnerCompetency } from "../api/learning";
import { DimensionGrid, TrackProgress, ledgerPanel } from "../components/CompetencyLedger";
import { Skeleton } from "../components/Skeleton";
import { useOrgContext } from "../hooks/useOrgContext";
import { useRole } from "../hooks/useRole";

export default function TeamCompetencyLedger() {
  const { orgId } = useOrgContext();
  const { can } = useRole();
  const allowed = can("canViewTeamCompetency");
  const query = useQuery({
    queryKey: ["learning-competency-team", orgId],
    queryFn: () => getTeamCompetency(orgId),
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <div style={{ ...panel, textAlign: "center", padding: "48px 24px" }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Team ledger is restricted</p>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          Competency is personal performance data. Only admins can read the org view.
        </p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
          Team Competency Ledger
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          One row per person. The four dimensions and the ISO 27001:2022 track
          mean the same thing here as they do on My Progress.
        </p>
      </div>

      {query.isPending ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton height="160px" />
          <Skeleton height="160px" />
        </div>
      ) : query.isError ? (
        <div style={panel}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>
            Could not load the team ledger.
          </p>
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <div style={{ ...panel, textAlign: "center", padding: "48px 24px" }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>No learners yet</p>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Invite a teammate from Settings, then have them run a scenario.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {(query.data ?? []).map((row) => (
            <LearnerRow key={row.learner_id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function LearnerRow({ row }: { row: LearnerCompetency }) {
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{row.display_name || row.learner_id}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            {row.gap_dimensions.length}{" "}
            {row.gap_dimensions.length === 1 ? "gap" : "gaps"} · last active{" "}
            {formatWhen(row.last_active_at)}
          </p>
        </div>
      </div>
      <DimensionGrid dimensions={row.dimensions} />
      <TrackProgress rollup={row} />
    </article>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const panel: CSSProperties = ledgerPanel;
