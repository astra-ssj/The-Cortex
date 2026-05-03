import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { groupsApi } from "../api/client";
import { useOrgContext } from "../hooks/useOrgContext";
import type { GroupPostureResponse, GroupEntity } from "../api/client";
import { Skeleton, StatCardSkeleton, EntityCardSkeleton, HeatmapSkeleton } from "./Skeleton";
import { GroupEmpty } from "./EmptyState";
import { AnimatedNumber } from "./AnimatedScore";

// ─── CORTEX dark theme (match ComplianceDashboard) ─────────────────────────
const tokens = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  panel: "var(--card)",
  card: "var(--card)",
  border: "var(--border)",
  text: "var(--text)",
  muted: "var(--text-secondary)",
  dim: "var(--text-quiet)",
  green: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
  blue: "var(--blue)",
} as const;

function scoreColor(score: number): string {
  if (score >= 70) return tokens.green;
  if (score >= 50) return tokens.amber;
  return tokens.red;
}

function entityScoreCssColor(score: number): string {
  if (score >= 70) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
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
      return { bg: "color-mix(in srgb, var(--red) 20%, transparent)", color: "var(--tone-critical-fg)" };
    case "IMPORTANT":
      return { bg: "color-mix(in srgb, var(--amber) 20%, transparent)", color: "var(--tone-high-fg)" };
    case "STANDARD":
      return { bg: "color-mix(in srgb, var(--blue) 20%, transparent)", color: "var(--tone-medium-fg)" };
    default:
      return { bg: tokens.border, color: tokens.muted };
  }
}

function riskBadgeStyle(risk: string): { bg: string; color: string } {
  switch (risk) {
    case "CRITICAL":
      return { bg: "var(--tone-critical-bg)", color: "var(--tone-critical-fg)" };
    case "HIGH":
      return { bg: "var(--tone-high-bg)", color: "var(--tone-high-fg)" };
    case "MEDIUM":
      return { bg: "var(--tone-medium-bg)", color: "var(--tone-medium-fg)" };
    case "LOW":
      return { bg: "var(--tone-low-bg)", color: "var(--tone-low-fg)" };
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
  index,
}: {
  entity: GroupEntity;
  expanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const borderColor = riskBorderColor(entity.risk_level);
  const typeStyle = typeBadgeStyle(entity.type);
  const riskStyle = riskBadgeStyle(entity.risk_level);

  return (
    <div
      className="card-stagger"
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
        e.currentTarget.style.boxShadow = "var(--shadow-drop-md)";
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
        <AnimatedNumber
          value={entity.overall_score}
          suffix="%"
          duration={1000}
          delay={index * 80}
          style={{
            fontSize: 32,
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: entityScoreCssColor(entity.overall_score),
          }}
        />
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
  const navigate = useNavigate();
  const { orgId, demoMode } = useOrgContext();
  const [data, setData] = useState<GroupPostureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    groupsApi
      .getPosture(orgId)
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
  }, [orgId, demoMode]);

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
      <div style={{ padding: "28px", maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Skeleton width="280px" height="18px" style={{ marginBottom: "6px" }} />
            <Skeleton width="380px" height="12px" />
          </div>
          <Skeleton width="80px" height="20px" borderRadius="4px" />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>

        <Skeleton width="120px" height="13px" style={{ marginBottom: "16px" }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <EntityCardSkeleton key={i} />
          ))}
        </div>

        <HeatmapSkeleton />
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

  if (data.entities.length === 0) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 8px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: "bold", color: tokens.text, margin: "0 0 4px 0" }}>
            {demoMode ? "AstraLabs Group — Intelligence Overview" : `${data.group_name} — Intelligence Overview`}
          </h1>
          <p style={{ fontSize: 14, color: tokens.muted, margin: 0 }}>
            {demoMode ? "Multi-entity compliance posture across 6 jurisdictions" : "Multi-entity compliance posture overview"}
          </p>
        </div>
        <div
          style={{
            background: tokens.panel,
            border: `1px solid ${tokens.border}`,
            borderRadius: "10px",
          }}
        >
          <GroupEmpty
            onAddEntities={() => navigate("/onboarding")}
            onLearnMore={() => navigate("/dashboard")}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: "bold", color: tokens.text, margin: "0 0 4px 0" }}>
          {demoMode ? "AstraLabs Group — Intelligence Overview" : `${data.group_name} — Intelligence Overview`}
        </h1>
        <p style={{ fontSize: 14, color: tokens.muted, margin: 0 }}>
          {demoMode ? "Multi-entity compliance posture across 6 jurisdictions" : "Multi-entity compliance posture overview"}
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
          <AnimatedNumber
            value={data.overall_score}
            suffix="%"
            duration={1200}
            delay={0}
            style={{
              color: "var(--amber)",
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
            }}
          />
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
          <AnimatedNumber
            value={data.entities_count}
            duration={600}
            delay={100}
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
              color: tokens.text,
            }}
          />
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
          <AnimatedNumber
            value={data.frameworks_active}
            duration={600}
            delay={150}
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
              color: tokens.text,
            }}
          />
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
          <AnimatedNumber
            value={criticalEntityCount}
            duration={600}
            delay={200}
            style={{
              color: "var(--red)",
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
            }}
          />
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
          <AnimatedNumber
            value={totalFindings}
            duration={600}
            delay={250}
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
              color: tokens.amber,
            }}
          />
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
        {data.entities.map((entity, index) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            index={index}
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
                              color: score >= 50 ? "var(--bg)" : "var(--text)",
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
