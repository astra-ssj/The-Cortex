import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrgContext } from "../hooks/useOrgContext";
import {
  useInsights,
  type Insight,
  type InsightSeverity,
  type InsightsSummary,
} from "../api/client";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./ui/EmptyState";

// Severity → visual language. The left accent is the at-a-glance triage signal.
const SEVERITY_STYLE: Record<
  InsightSeverity,
  { accent: string; soft: string; label: string }
> = {
  CRITICAL: { accent: "var(--red, #E24B4A)", soft: "var(--red-soft)", label: "Critical" },
  HIGH: { accent: "var(--amber, #BA7517)", soft: "var(--amber-soft)", label: "High" },
  MEDIUM: { accent: "var(--blue, #3b82f6)", soft: "var(--blue-soft)", label: "Medium" },
  WIN: { accent: "var(--green, #22c55e)", soft: "var(--green-soft)", label: "Win" },
  LOW: { accent: "var(--text-tertiary, #94a3b8)", soft: "var(--surface)", label: "Low" },
};

function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}

function formatEur(value: number): string {
  if (!value) return "€0";
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${Math.round(value / 1_000)}k`;
  return `€${value}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  if (secs < 90) return "1 min ago";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function SummaryChip({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 999,
        background: "var(--surface)",
        border: `1px solid color-mix(in srgb, ${color} 45%, var(--border))`,
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
    >
      <strong style={{ color, fontSize: 14, fontWeight: 700 }}>{count}</strong>
      {label}
    </span>
  );
}

function SummaryStrip({ summary }: { summary: InsightsSummary }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 22,
      }}
    >
      <SummaryChip count={summary.critical} label="Critical" color={SEVERITY_STYLE.CRITICAL.accent} />
      <SummaryChip count={summary.high} label="High" color={SEVERITY_STYLE.HIGH.accent} />
      <SummaryChip count={summary.medium} label="Medium" color={SEVERITY_STYLE.MEDIUM.accent} />
      <SummaryChip count={summary.wins} label="Wins" color={SEVERITY_STYLE.WIN.accent} />
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
          padding: "6px 14px",
          borderRadius: 999,
          background: "color-mix(in srgb, var(--red, #E24B4A) 12%, var(--surface))",
          border: "1px solid color-mix(in srgb, var(--red, #E24B4A) 45%, var(--border))",
          fontSize: 12,
          color: "var(--text-secondary)",
          marginLeft: "auto",
        }}
      >
        <strong style={{ color: "var(--red, #E24B4A)", fontSize: 14, fontWeight: 700 }}>
          {formatEur(summary.total_exposure_eur)}
        </strong>
        exposure
      </span>
    </div>
  );
}

function InsightCard({ insight, onTrace }: { insight: Insight; onTrace: (i: Insight) => void }) {
  const sev = SEVERITY_STYLE[insight.severity as InsightSeverity] ?? SEVERITY_STYLE.LOW;
  return (
    <article
      style={{
        position: "relative",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${sev.accent}`,
        borderRadius: 10,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            padding: "3px 9px",
            borderRadius: 6,
            background: sev.soft,
            color: sev.accent,
          }}
        >
          {sev.label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            padding: "3px 9px",
            borderRadius: 6,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-tertiary)",
          }}
        >
          {categoryLabel(insight.category)}
        </span>
      </div>

      <h3
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text)",
          lineHeight: 1.35,
        }}
      >
        {insight.title}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.55,
        }}
      >
        {insight.detail}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 2 }}>
        {insight.related_nodes.length > 0 ? (
          <button
            type="button"
            onClick={() => onTrace(insight)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 700,
              color: "var(--cyan, #22d3ee)",
              fontFamily: "inherit",
            }}
          >
            Trace in graph →
          </button>
        ) : null}
        {insight.action?.label && insight.action?.href ? (
          <ActionLink label={insight.action.label} href={insight.action.href} />
        ) : null}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
          {relativeTime(insight.computed_at)}
        </span>
      </div>
    </article>
  );
}

function ActionLink({ label, href }: { label: string; href: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--text-secondary)",
        textDecoration: "underline",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function LoadingSkeletons() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Skeleton height={42} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} height={120} />
      ))}
    </div>
  );
}

export default function InsightsFeed() {
  const { orgId } = useOrgContext();
  const navigate = useNavigate();
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useInsights(orgId);
  // Re-render the "updated N min ago" label without refetching.
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const onTrace = (insight: Insight) => {
    const focus = insight.related_nodes.join(",");
    navigate(`/graph?focus=${encodeURIComponent(focus)}`);
  };

  if (isLoading) {
    return <LoadingSkeletons />;
  }

  if (error) {
    return (
      <p style={{ color: "var(--red)", marginTop: 8, fontSize: 13 }}>
        Failed to generate insights: {error.message}
      </p>
    );
  }

  const insights = data?.insights ?? [];
  const summary = data?.summary;

  if (insights.length === 0) {
    return (
      <EmptyState
        icon="✦"
        title="No insights yet"
        description="Run an assessment or connect an integration so CORTEX can start reasoning about your compliance posture."
        cta="Connect an integration"
        onCta={() => navigate("/integrations")}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {summary ? <SummaryStrip summary={summary} /> : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
          marginBottom: 12,
          fontSize: 11,
          color: "var(--text-tertiary)",
        }}
      >
        <span>Updated {relativeTime(new Date(dataUpdatedAt).toISOString())}</span>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: isFetching ? "wait" : "pointer",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--cyan, #22d3ee)",
            fontFamily: "inherit",
          }}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} onTrace={onTrace} />
        ))}
      </div>
    </div>
  );
}
