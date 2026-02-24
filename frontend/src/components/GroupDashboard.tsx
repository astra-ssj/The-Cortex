import { useState, useEffect, useMemo } from "react";
import { groupsApi } from "../api/client";
import type { GroupPostureResponse, GroupEntity } from "../api/client";

// ─── CORTEX dark theme (match ComplianceDashboard) ─────────────────────────
const tokens = {
  bg: "#05080f",
  surface: "#090e1a",
  panel: "#0c1220",
  card: "#0d1526",
  border: "#141e30",
  text: "#e2e8f4",
  muted: "#94a3b8",
  dim: "#4a5a72",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
} as const;

function scoreColor(score: number): string {
  if (score >= 70) return tokens.green;
  if (score >= 50) return tokens.amber;
  return tokens.red;
}

function riskBorderColor(risk: string): string {
  switch (risk) {
    case "CRITICAL":
      return tokens.red;
    case "HIGH":
      return tokens.amber;
    case "MEDIUM":
      return tokens.blue;
    case "LOW":
      return tokens.green;
    default:
      return tokens.border;
  }
}

function typeBadgeStyle(type: string): { bg: string; color: string } {
  switch (type) {
    case "ESSENTIAL":
      return { bg: "rgba(239, 68, 68, 0.2)", color: "#fca5a5" };
    case "IMPORTANT":
      return { bg: "rgba(245, 158, 11, 0.2)", color: "#fcd34d" };
    case "STANDARD":
      return { bg: "rgba(59, 130, 246, 0.2)", color: "#93c5fd" };
    default:
      return { bg: tokens.border, color: tokens.muted };
  }
}

function riskBadgeStyle(risk: string): { bg: string; color: string } {
  switch (risk) {
    case "CRITICAL":
      return { bg: "#7f1d1d", color: "#fca5a5" };
    case "HIGH":
      return { bg: "#78350f", color: "#fcd34d" };
    case "MEDIUM":
      return { bg: "#1e3a5f", color: "#93c5fd" };
    case "LOW":
      return { bg: "#14532d", color: "#86efac" };
    default:
      return { bg: tokens.border, color: tokens.muted };
  }
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "NON_COMPLIANT":
      return tokens.red;
    case "PARTIAL":
      return tokens.amber;
    case "COMPLIANT":
      return tokens.green;
    default:
      return tokens.muted;
  }
}

// ─── Entity card (expandable) ──────────────────────────────────────────────
function EntityCard({
  entity,
  expanded,
  onToggle,
}: {
  entity: GroupEntity;
  expanded: boolean;
  onToggle: () => void;
}) {
  const borderColor = riskBorderColor(entity.risk_level);
  const typeStyle = typeBadgeStyle(entity.type);
  const riskStyle = riskBadgeStyle(entity.risk_level);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
      style={{
        background: tokens.card,
        border: `1px solid ${tokens.border}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 8,
        padding: 16,
        cursor: "pointer",
        transition: "box-shadow 0.2s, border-color 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
        e.currentTarget.style.borderColor = borderColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = tokens.border;
        e.currentTarget.style.borderLeft = `3px solid ${borderColor}`;
      }}
    >
      {/* Header: flag + name, jurisdiction, type */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{entity.flag}</span>
        <span style={{ fontWeight: "bold", color: tokens.text, fontSize: 15 }}>{entity.name}</span>
        <span
          style={{
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 4,
            background: tokens.panel,
            color: tokens.muted,
            border: `1px solid ${tokens.border}`,
          }}
        >
          {entity.jurisdiction}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            ...typeStyle,
          }}
        >
          {entity.type}
        </span>
      </div>

      {/* Score section */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 28,
            fontWeight: "bold",
            color: scoreColor(entity.overall_score),
            fontFamily: "DM Mono, monospace",
          }}
        >
          {entity.overall_score}%
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 4,
            background: statusBadgeColor(entity.status) + "22",
            color: statusBadgeColor(entity.status),
          }}
        >
          {entity.status.replace("_", " ")}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "2px 6px",
            borderRadius: 4,
            ...riskStyle,
          }}
        >
          {entity.risk_level}
        </span>
      </div>

      {/* Mini progress bar */}
      <div
        style={{
          height: 4,
          background: tokens.border,
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${entity.overall_score}%`,
            background: scoreColor(entity.overall_score),
            borderRadius: 2,
          }}
        />
      </div>

      {/* Details */}
      <p style={{ fontSize: 12, color: tokens.muted, margin: "0 0 8px 0", lineHeight: 1.4 }}>
        {entity.role}
      </p>
      <div style={{ display: "flex", gap: 12, fontSize: 12, color: tokens.dim, marginBottom: 10 }}>
        <span>{entity.employees} employees</span>
        {entity.critical_findings > 0 ? (
          <span style={{ color: tokens.red, fontWeight: "bold" }}>
            {entity.critical_findings} critical
          </span>
        ) : null}
        <span>{entity.open_findings} open findings</span>
      </div>

      {/* Framework mini-badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {entity.frameworks.map((fw) => (
          <span
            key={fw.id}
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 4,
              background: scoreColor(fw.score) + "22",
              color: scoreColor(fw.score),
              border: `1px solid ${scoreColor(fw.score)}44`,
            }}
          >
            {fw.name} {fw.score}%
          </span>
        ))}
      </div>

      {/* Expanded: full framework breakdown */}
      {expanded && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${tokens.border}`,
          }}
        >
          <div style={{ fontSize: 11, color: tokens.muted, marginBottom: 8, fontWeight: "bold" }}>
            Framework breakdown
          </div>
          {entity.frameworks.map((fw) => (
            <div
              key={fw.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 0",
                fontSize: 12,
                borderBottom: `1px solid ${tokens.border}`,
              }}
            >
              <span style={{ color: tokens.text }}>{fw.name}</span>
              <span style={{ color: scoreColor(fw.score), fontFamily: "DM Mono, monospace" }}>
                {fw.score}% · {fw.status} · {fw.risk}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────
export function GroupDashboard() {
  const [data, setData] = useState<GroupPostureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    groupsApi
      .getPosture()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const criticalEntityCount = useMemo(
    () => (data ? data.entities.filter((e) => e.risk_level === "CRITICAL").length : 0),
    [data]
  );
  const totalFindings = useMemo(
    () => (data ? data.entities.reduce((s, e) => s + e.open_findings, 0) : 0),
    [data]
  );

  // Heatmap: unique frameworks across all entities (sorted)
  const heatmapFrameworks = useMemo(() => {
    if (!data) return [];
    const ids = new Set<string>();
    data.entities.forEach((e) => e.frameworks.forEach((f) => ids.add(f.id)));
    return Array.from(ids).sort();
  }, [data]);

  const getScoreForCell = (entity: GroupEntity, fwId: string): number | null => {
    const fw = entity.frameworks.find((f) => f.id === fwId);
    return fw != null ? fw.score : null;
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: tokens.muted }}>
        Loading group posture…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: tokens.red }}>
        Failed to load: {error.message}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: "bold", color: tokens.text, margin: "0 0 4px 0" }}>
          AstraLabs Group — Intelligence Overview
        </h1>
        <p style={{ fontSize: 14, color: tokens.muted, margin: 0 }}>
          Multi-entity compliance posture across 6 jurisdictions
        </p>
      </div>

      {/* Summary row: 5 stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div
          style={{
            background: tokens.card,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 11, color: tokens.muted, marginBottom: 4 }}>Group Score</div>
          <div
            style={{
              fontSize: 24,
              fontWeight: "bold",
              fontFamily: "DM Mono, monospace",
              color: scoreColor(data.overall_score),
            }}
          >
            {data.overall_score}%
          </div>
        </div>
        <div
          style={{
            background: tokens.card,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 11, color: tokens.muted, marginBottom: 4 }}>Entities</div>
          <div style={{ fontSize: 24, fontWeight: "bold", color: tokens.text }}>
            {data.entities_count}
          </div>
        </div>
        <div
          style={{
            background: tokens.card,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 11, color: tokens.muted, marginBottom: 4 }}>Frameworks Active</div>
          <div style={{ fontSize: 24, fontWeight: "bold", color: tokens.text }}>
            {data.frameworks_active}
          </div>
        </div>
        <div
          style={{
            background: tokens.card,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 11, color: tokens.muted, marginBottom: 4 }}>Critical Entities</div>
          <div style={{ fontSize: 24, fontWeight: "bold", color: tokens.red }}>
            {criticalEntityCount}
          </div>
        </div>
        <div
          style={{
            background: tokens.card,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 11, color: tokens.muted, marginBottom: 4 }}>Total Findings</div>
          <div style={{ fontSize: 24, fontWeight: "bold", color: tokens.amber }}>{totalFindings}</div>
        </div>
      </div>

      {/* Entity grid 2x3 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 20,
          marginBottom: 32,
        }}
      >
        {data.entities.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            expanded={expandedId === entity.id}
            onToggle={() => setExpandedId((id) => (id === entity.id ? null : entity.id))}
          />
        ))}
      </div>

      {/* Jurisdiction map summary */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: "bold", color: tokens.text, marginBottom: 12 }}>
          Jurisdiction map summary
        </h2>
        <div
          style={{
            background: tokens.card,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: tokens.muted, minWidth: 140 }}>
              EU Scope (DE, ES):
            </span>
            <span style={{ fontSize: 12, color: tokens.text }}>
              NIS2 · GDPR · EU AI Act
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: tokens.muted, minWidth: 140 }}>
              UK Scope (UK):
            </span>
            <span style={{ fontSize: 12, color: tokens.text }}>
              UK GDPR · Cyber Essentials
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: tokens.muted, minWidth: 140 }}>
              APAC Scope (AU, TH):
            </span>
            <span style={{ fontSize: 12, color: tokens.text }}>
              ISO 27001 · NIST CSF
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: tokens.muted, minWidth: 140 }}>
              Americas (US):
            </span>
            <span style={{ fontSize: 12, color: tokens.text }}>
              NIST CSF · CSA CCM
            </span>
          </div>
        </div>
      </section>

      {/* Group risk heatmap */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: "bold", color: tokens.text, marginBottom: 12 }}>
          Group risk heatmap
        </h2>
        <div
          style={{
            background: tokens.card,
            border: `1px solid ${tokens.border}`,
            borderRadius: 8,
            overflow: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    color: tokens.muted,
                    fontWeight: "bold",
                    borderBottom: `1px solid ${tokens.border}`,
                    background: tokens.panel,
                  }}
                >
                  Entity
                </th>
                {heatmapFrameworks.map((fwId) => (
                  <th
                    key={fwId}
                    style={{
                      padding: "10px 8px",
                      textAlign: "center",
                      color: tokens.muted,
                      fontWeight: "bold",
                      borderBottom: `1px solid ${tokens.border}`,
                      background: tokens.panel,
                      minWidth: 48,
                    }}
                  >
                    {fwId.replace(/-(\d+)$/, "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.entities.map((entity) => (
                <tr
                  key={entity.id}
                  style={{ borderBottom: `1px solid ${tokens.border}` }}
                >
                  <td
                    style={{
                      padding: "10px 12px",
                      color: tokens.text,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entity.flag} {entity.name}
                  </td>
                  {heatmapFrameworks.map((fwId) => {
                    const score = getScoreForCell(entity, fwId);
                    const bg =
                      score == null
                        ? tokens.border
                        : score >= 70
                          ? tokens.green
                          : score >= 50
                            ? tokens.amber
                            : tokens.red;
                    return (
                      <td
                        key={fwId}
                        style={{
                          padding: 8,
                          textAlign: "center",
                          background: score != null ? bg + "44" : tokens.panel,
                          borderLeft: `1px solid ${tokens.border}`,
                        }}
                        title={
                          score != null
                            ? `${entity.name} · ${fwId}: ${score}%`
                            : `${entity.name} · ${fwId}: N/A`
                        }
                      >
                        {score != null ? (
                          <span
                            style={{
                              display: "inline-block",
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              background: bg,
                              color: score >= 50 ? "#05080f" : "#fff",
                              fontWeight: "bold",
                              fontSize: 10,
                              lineHeight: "20px",
                            }}
                          >
                            {score}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-block",
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              background: tokens.border,
                              color: tokens.dim,
                              fontSize: 9,
                              lineHeight: "20px",
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
