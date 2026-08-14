/**
 * Competency history — scored performance across org sessions.
 * Read-only; Resume/Review reuses LearningLoop via cortex_learning_session_id.
 */

import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  getSessions,
  type CompetencyDimension,
  type SessionSummary,
} from "../api/learning";
import { Skeleton } from "../components/Skeleton";
import { useOrgContext } from "../hooks/useOrgContext";

const TERMINAL_STAGE = "complete";

const DIMENSION_ORDER = [
  "control_mapping",
  "evidence",
  "escalation",
  "remediation",
] as const;

const DIMENSION_LABELS: Record<(typeof DIMENSION_ORDER)[number], string> = {
  control_mapping: "Control Mapping",
  evidence: "Evidence Quality",
  escalation: "Escalation Judgment",
  remediation: "Remediation",
};

const panel: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-5)",
};

function hasCompetency(competency: Record<string, CompetencyDimension> | undefined): boolean {
  return Boolean(competency && Object.keys(competency).length > 0);
}

function difficultyColor(difficulty: string): string {
  if (difficulty === "foundation") return "var(--cyan)";
  if (difficulty === "practitioner") return "var(--amber)";
  if (difficulty === "expert") return "var(--red)";
  return "var(--text-secondary)";
}

function formatSessionDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function averageScores(sessions: SessionSummary[]): Record<(typeof DIMENSION_ORDER)[number], number> | null {
  const scored = sessions.filter((s) => hasCompetency(s.competency));
  if (scored.length === 0) return null;
  const totals = { control_mapping: 0, evidence: 0, escalation: 0, remediation: 0 };
  for (const s of scored) {
    for (const key of DIMENSION_ORDER) {
      totals[key] += Math.max(0, Math.min(100, Number(s.competency[key]?.score) || 0));
    }
  }
  const n = scored.length;
  return {
    control_mapping: Math.round(totals.control_mapping / n),
    evidence: Math.round(totals.evidence / n),
    escalation: Math.round(totals.escalation / n),
    remediation: Math.round(totals.remediation / n),
  };
}

function badgeStyle(color: string): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color,
    border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
    borderRadius: 999,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  };
}

function actionButtonStyle(): CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    cursor: "pointer",
  };
}

function HistorySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={panel}>
          <Skeleton height="16px" width="45%" style={{ marginBottom: 12 }} />
          <Skeleton height="12px" width="70%" style={{ marginBottom: 10 }} />
          <Skeleton height="28px" width="100%" />
        </div>
      ))}
    </div>
  );
}

export default function CompetencyHistory() {
  const { orgId } = useOrgContext();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["learning-sessions", orgId],
    queryFn: () => getSessions(orgId),
  });

  const sessions = query.data ?? [];
  const averages = useMemo(() => averageScores(sessions), [sessions]);

  const openSession = (sessionId: string) => {
    localStorage.setItem("cortex_learning_session_id", sessionId);
    navigate("/learning");
  };

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>My Progress</h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          Your competency scores across all completed scenarios.
        </p>
      </div>

      {query.isPending ? (
        <HistorySkeleton />
      ) : query.isError ? (
        <div style={{ ...panel, textAlign: "center" }}>
          <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: 14 }}>
            Could not load your progress.
          </p>
          <button type="button" onClick={() => void query.refetch()} style={actionButtonStyle()}>
            Retry
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ ...panel, textAlign: "center", padding: "48px 24px" }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            No scenarios started yet.
          </p>
          <p style={{ margin: "10px auto 20px", maxWidth: 420, fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" }}>
            Start your first scenario to begin tracking your GRC competency.
          </p>
          <button
            type="button"
            onClick={() => navigate("/learning")}
            style={{
              ...actionButtonStyle(),
              background: "var(--cyan)",
              borderColor: "transparent",
              color: "var(--bg)",
              fontWeight: 700,
            }}
          >
            Go to Learning →
          </button>
        </div>
      ) : (
        <>
          {averages ? (
            <div
              aria-label="Average competency scores"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              {DIMENSION_ORDER.map((key) => {
                const score = averages[key];
                return (
                  <div key={key} style={panel}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                      {DIMENSION_LABELS[key]}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{score}</div>
                    <div
                      style={{
                        marginTop: 10,
                        height: 4,
                        borderRadius: 2,
                        background: "var(--border)",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ width: `${score}%`, height: "100%", background: "var(--cyan)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sessions.map((s) => {
              const terminal = s.stage === TERMINAL_STAGE;
              const scored = hasCompetency(s.competency);
              const diffColor = difficultyColor(s.difficulty);
              const stageColor = terminal ? "var(--green)" : "var(--amber)";
              return (
                <article key={s.session_id} style={panel}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <h2 style={{ margin: 0, flex: 1, minWidth: 160, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                      {s.scenario_title}
                    </h2>
                    {s.difficulty ? (
                      <span style={badgeStyle(diffColor)}>{s.difficulty}</span>
                    ) : null}
                    <span style={badgeStyle(stageColor)}>{terminal ? "Completed" : "In Progress"}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {formatSessionDate(s.updated_at)}
                    </span>
                    <button type="button" onClick={() => openSession(s.session_id)} style={actionButtonStyle()}>
                      {terminal ? "Review" : "Resume"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {DIMENSION_ORDER.map((key) => {
                      const dim = s.competency?.[key];
                      const label = DIMENSION_LABELS[key];
                      const empty = !scored || dim == null;
                      return (
                        <span
                          key={key}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: "1px solid var(--border)",
                            background: "var(--card)",
                            color: empty ? "var(--text-tertiary)" : "var(--text-secondary)",
                          }}
                        >
                          {label} {empty ? "—" : Math.round(Number(dim.score) || 0)}
                        </span>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
