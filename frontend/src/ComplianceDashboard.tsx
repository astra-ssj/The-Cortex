import { Link } from "react-router-dom";
import { useRef, useEffect, useMemo } from "react";
import { DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS } from "./api/client";
import { useFrameworks } from "./hooks/useFrameworks";
import {
  useAssessmentStream,
  useCompliancePosture,
  useZtaipStatus,
} from "./store/complianceStore";
import type { FrameworkSummary } from "./api/frameworks";
import type { AssessmentEvent } from "./types/compliance";
import type { FrameworkPosture } from "./types/compliance";

type DisplayType = "start" | "fw_start" | "fw_done" | "control" | "review" | "complete" | "error";

function eventDisplay(e: AssessmentEvent): { type: DisplayType; message: string } {
  switch (e.kind) {
    case "run_start":
      return { type: "start", message: `Run started (${(e as { frameworkIds?: string[] }).frameworkIds?.length ?? 0} frameworks)` };
    case "framework_start":
      return { type: "fw_start", message: `Framework: ${(e as { frameworkName: string }).frameworkName} (${(e as { frameworkId: string }).frameworkId})` };
    case "framework_done":
      return { type: "fw_done", message: `Done: ${(e as { frameworkId: string }).frameworkId}` };
    case "control_context":
      return { type: "control", message: `Context: ${(e as { controlId: string }).controlId}` };
    case "control_result": {
      const r = e as { controlId: string; controlName: string; status: string; finding?: string };
      const isFail = r.status === "error" || (r.finding && r.finding.length > 0);
      return { type: isFail ? "review" : "control", message: `${r.controlName} — ${r.status}${r.finding ? `: ${r.finding.slice(0, 60)}…` : ""}` };
    }
    case "run_done":
      return { type: "complete", message: "Assessment complete" };
    case "error":
      return { type: "error", message: (e as { message: string }).message };
    default:
      return { type: "error", message: `Unknown event: ${(e as { kind: string }).kind}` };
  }
}

function streamEventColor(type: DisplayType): string {
  switch (type) {
    case "fw_start":
      return "text-cortex-blue";
    case "fw_done":
      return "text-cortex-blue";
    case "control":
      return "text-cortex-green";
    case "review":
      return "text-cortex-amber";
    case "error":
      return "text-cortex-red";
    case "complete":
      return "font-bold text-cortex-green";
    default:
      return "text-cortex-muted";
  }
}

function scoreFromPosture(fp: FrameworkPosture): { score: number; gaps: number; status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT"; risk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" } {
  const controls = fp.controls || [];
  const total = controls.length || 1;
  const compliant = controls.filter((c) => c.status === "compliant").length;
  const partial = controls.filter((c) => c.status === "partial").length;
  const nonCompliant = controls.filter((c) => c.status === "non_compliant").length;
  const score = Math.round(((compliant + 0.5 * partial) / total) * 100);
  const gaps = nonCompliant;
  let status: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" = "COMPLIANT";
  if (nonCompliant > 0) status = "NON_COMPLIANT";
  else if (partial > 0 || compliant < total) status = "PARTIAL";
  let risk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (gaps > 5) risk = "CRITICAL";
  else if (gaps > 2) risk = "HIGH";
  else if (gaps > 0 || score < 80) risk = "MEDIUM";
  return { score, gaps, status, risk };
}

function RadialScore({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const stroke = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 80 ? "stroke-cortex-green" : score >= 50 ? "stroke-cortex-amber" : "stroke-cortex-red";
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} className="stroke-cortex-panel" strokeWidth="4" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className={color}
        strokeWidth="4"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - stroke)}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
    </svg>
  );
}

function FrameworkCard({
  fw,
  posture,
}: {
  fw: FrameworkSummary;
  posture: FrameworkPosture | undefined;
}) {
  const stats = posture ? scoreFromPosture(posture) : { score: 0, gaps: 0, status: "NON_COMPLIANT" as const, risk: "LOW" as const };
  const score = posture ? stats.score : 0;
  const riskColors = {
    CRITICAL: "bg-cortex-red/20 text-cortex-red border-cortex-red/40",
    HIGH: "bg-cortex-amber/20 text-cortex-amber border-cortex-amber/40",
    MEDIUM: "bg-cortex-amber/10 text-cortex-amber border-cortex-amber/30",
    LOW: "bg-cortex-green/20 text-cortex-green border-cortex-green/40",
  };
  const statusColors = {
    COMPLIANT: "text-cortex-green",
    PARTIAL: "text-cortex-amber",
    NON_COMPLIANT: "text-cortex-red",
  };

  return (
    <Link
      to={`/frameworks/${fw.id}`}
      className="block rounded-xl border border-cortex-border bg-cortex-panel p-5 transition hover:border-cortex-blue/50 hover:shadow-lg hover:shadow-cortex-blue/5"
    >
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <RadialScore score={score} size={64} />
          <span className="font-data absolute inset-0 flex items-center justify-center text-sm font-semibold text-cortex-text">
            {posture ? score : "—"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-ui font-semibold text-cortex-text">{fw.name}</h3>
          <p className="mt-0.5 font-data text-xs text-cortex-muted">v{fw.version}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-0.5 font-data text-xs ${riskColors[stats.risk]}`}>
              {stats.risk}
            </span>
            <span className={`font-data text-xs ${statusColors[stats.status]}`}>
              {stats.status.replace("_", " ")}
            </span>
            <span className="rounded bg-cortex-surface px-2 py-0.5 font-data text-xs text-cortex-muted">
              {fw.jurisdiction}
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cortex-surface">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${score}%`,
                backgroundColor: score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <p className="mt-2 font-data text-xs text-cortex-muted">
            {posture ? `${stats.gaps} gap${stats.gaps !== 1 ? "s" : ""}` : "Not assessed"} · Trend —
          </p>
        </div>
      </div>
    </Link>
  );
}

export function ComplianceDashboard() {
  const { data: frameworks, isLoading, error } = useFrameworks();
  const { data: posture } = useCompliancePosture(DEFAULT_ORG_ID);
  const { data: ztaip } = useZtaipStatus();
  const { events, isStreaming, startStream, stopStream } = useAssessmentStream();
  const streamPanelRef = useRef<HTMLDivElement | null>(null);

  const postureByFramework = useMemo(() => {
    const map = new Map<string, FrameworkPosture>();
    posture?.frameworks?.forEach((fp) => map.set(fp.frameworkId, fp));
    return map;
  }, [posture]);

  const stats = useMemo(() => {
    if (!posture?.frameworks?.length) {
      return { overallPosture: 0, auditReadiness: 0, criticalGaps: 0, compliantFrameworks: 0, totalFrameworks: frameworks?.length ?? 8 };
    }
    let totalScore = 0;
    let criticalGaps = 0;
    let compliantCount = 0;
    posture.frameworks.forEach((fp) => {
      const { score, gaps, status } = scoreFromPosture(fp);
      totalScore += score;
      criticalGaps += gaps;
      if (status === "COMPLIANT") compliantCount += 1;
    });
    const n = posture.frameworks.length;
    return {
      overallPosture: n ? Math.round(totalScore / n) : 0,
      auditReadiness: n ? Math.round(totalScore / n) : 0,
      criticalGaps,
      compliantFrameworks: compliantCount,
      totalFrameworks: frameworks?.length ?? 8,
    };
  }, [posture, frameworks?.length]);

  useEffect(() => {
    if (events.length > 0 && streamPanelRef.current) {
      streamPanelRef.current.scrollTop = streamPanelRef.current.scrollHeight;
    }
  }, [events.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-cortex-muted">Loading frameworks…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-cortex-red/50 bg-cortex-red/10 p-6 text-cortex-red">
        <p className="font-semibold">Failed to load frameworks</p>
        <p className="mt-1 font-data text-sm">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }

  if (!frameworks?.length) {
    return (
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-12 text-center text-cortex-muted">
        No frameworks registered.
      </div>
    );
  }

  const jurisdictions = Array.from(new Set(frameworks.map((f) => f.jurisdiction))).slice(0, 6);
  const orgName = posture?.organisationName ?? "AstraLabs Group";
  const lastAssessed = posture?.updatedAt ?? "—";

  return (
    <div className="space-y-6">
      {/* Org banner */}
      <div className="rounded-xl border border-cortex-border bg-cortex-surface px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-ui text-xl font-semibold text-cortex-text">{orgName}</h1>
            <p className="mt-1 font-data text-sm text-cortex-muted">
              {jurisdictions.join(" · ")} · {frameworks.length} active frameworks
            </p>
          </div>
          <p className="font-data text-sm text-cortex-muted">Last assessed: {lastAssessed}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Overall Posture</p>
          <p
            className={`mt-1 font-data text-2xl font-bold ${
              stats.overallPosture >= 80 ? "text-cortex-green" : stats.overallPosture >= 50 ? "text-cortex-amber" : "text-cortex-red"
            }`}
          >
            {posture ? `${stats.overallPosture}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Audit Readiness</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-text">
            {posture ? `${stats.auditReadiness}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Critical Gaps</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-red">{stats.criticalGaps}</p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Compliant Frameworks</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-green">
            {stats.compliantFrameworks}/{stats.totalFrameworks}
          </p>
        </div>
      </div>

      {/* Framework cards */}
      <section id="frameworks">
        <h2 className="mb-4 font-ui text-lg font-semibold text-cortex-text">Frameworks</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {frameworks.map((fw) => (
            <FrameworkCard key={fw.id} fw={fw} posture={postureByFramework.get(fw.id)} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Assessment stream */}
        <div className="lg:col-span-2 rounded-xl border border-cortex-border bg-cortex-panel">
          <div className="border-b border-cortex-border px-4 py-3">
            <h2 className="font-ui text-sm font-semibold text-cortex-text">Assessment stream</h2>
            <p className="mt-0.5 font-data text-xs text-cortex-muted">
              {DEFAULT_ORG_ID} — all {ALL_FRAMEWORK_IDS.split(",").length} frameworks
            </p>
          </div>
          <div className="p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => startStream(DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS.split(","))}
                disabled={isStreaming}
                className="rounded-lg bg-cortex-blue px-3 py-1.5 font-ui text-sm font-medium text-white hover:bg-cortex-blue/90 disabled:opacity-50"
              >
                {isStreaming ? "Streaming…" : "Start stream"}
              </button>
              {isStreaming && (
                <button
                  type="button"
                  onClick={stopStream}
                  className="rounded-lg border border-cortex-border px-3 py-1.5 font-ui text-sm text-cortex-text hover:bg-cortex-surface"
                >
                  Stop
                </button>
              )}
            </div>
            {(isStreaming || events.length > 0) && (
              <div
                ref={streamPanelRef}
                className="mt-4 max-h-[320px] overflow-y-auto rounded-lg border border-cortex-border bg-cortex-bg p-4 font-data text-xs"
              >
                {isStreaming && events.length === 0 && (
                  <div className="flex items-center gap-2 text-cortex-muted">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cortex-blue opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-cortex-blue" />
                    </span>
                    Connecting…
                  </div>
                )}
                {events.map((e, i) => {
                  const { type, message } = eventDisplay(e);
                  return (
                    <div
                      key={i}
                      className={`border-b border-cortex-panel py-1.5 last:border-0 ${streamEventColor(type)}`}
                    >
                      <span className="text-cortex-muted">[{type}]</span> {message}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ZTAIP status */}
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <h2 className="font-ui text-sm font-semibold text-cortex-text">ZTAIP Status</h2>
          <ul className="mt-4 space-y-3 font-data text-sm">
            <li className="flex items-center justify-between">
              <span className="text-cortex-muted">Audit Fabric</span>
              <span className="text-cortex-green">ACTIVE</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-cortex-muted">Circuit Breakers</span>
              <span className="text-cortex-green">{ztaip?.circuitBreakersCount ?? 1} ACTIVE</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-cortex-muted">Human Review Queue</span>
              <span className="text-cortex-green">{ztaip?.humanReviewQueueCount ?? 0} PENDING</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-cortex-muted">Sovereignty Broker</span>
              <span className="text-cortex-green">{(ztaip?.sovereigntyBroker ?? "active").toUpperCase()}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-cortex-muted">Agent Certificates</span>
              <span className="text-cortex-green">VALID</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
