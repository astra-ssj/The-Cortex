import { Link } from "react-router-dom";
import { useRef, useEffect } from "react";
import { DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS } from "./api/client";
import { useFrameworks } from "./hooks/useFrameworks";
import {
  useAssessmentStream,
  useCompliancePosture,
  useZtaipStatus,
} from "./store/complianceStore";
import type { FrameworkSummary } from "./api/frameworks";
import type { AssessmentEvent, FrameworkPosture } from "./types/compliance";

// ─── CORTEX dark theme design tokens ───────────────────────────────────────
const tokens = {
  background: "#05080f",
  surface: "#090e1a",
  panel: "#0c1220",
  card: "#0d1526",
  border: "#141e30",
  borderLit: "#1e2e48",
  textPrimary: "#e2e8f4",
  textMuted: "#94a3b8",
  textDim: "#4a5a72",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  cardHoverBg: "#111827",
} as const;

function scoreRingColor(score: number): string {
  if (score >= 70) return tokens.green;
  if (score >= 50) return tokens.amber;
  return tokens.red;
}

function riskBadgeStyle(risk: string): { background: string; color: string } {
  switch (risk) {
    case "CRITICAL":
      return { background: "#7f1d1d", color: "#fca5a5" };
    case "HIGH":
      return { background: "#78350f", color: "#fcd34d" };
    case "MEDIUM":
      return { background: "#1e3a5f", color: "#93c5fd" };
    case "LOW":
      return { background: "#14532d", color: "#86efac" };
    default:
      return { background: tokens.border, color: tokens.textMuted };
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
      return tokens.textMuted;
  }
}

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
      return { type: "control", message: `${r.controlName} — ${r.status}${r.finding ? `: ${r.finding.slice(0, 60)}…` : ""}` };
    }
    case "run_done":
      return { type: "complete", message: "Assessment complete" };
    case "error":
      return { type: "error", message: (e as { message: string }).message };
    default:
      return { type: "error", message: `Unknown event: ${(e as { kind: string }).kind}` };
  }
}

function FrameworkCard({
  fw,
  postureEntry,
}: {
  fw: FrameworkSummary;
  postureEntry?: FrameworkPosture;
}) {
  const score = postureEntry?.score;
  const riskLevel = postureEntry?.riskLevel;
  const status = postureEntry?.status;

  return (
    <Link
      to={`/frameworks/${fw.id}`}
      className="block rounded-lg transition focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-offset-[#05080f] focus:ring-[#1e2e48]"
      style={{
        background: tokens.card,
        border: "1px solid " + tokens.border,
        padding: "20px",
        color: tokens.textPrimary,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = tokens.borderLit;
        e.currentTarget.style.background = tokens.cardHoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = tokens.border;
        e.currentTarget.style.background = tokens.card;
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="font-bold"
            style={{ color: tokens.textPrimary, fontSize: "15px" }}
          >
            {fw.name}
          </h3>
          <p
            className="mt-1"
            style={{ color: tokens.textDim, fontSize: "12px" }}
          >
            v{fw.version} · {postureEntry?.jurisdiction ?? fw.jurisdiction}
          </p>
        </div>
        {typeof score === "number" && (
          <div
            className="relative flex shrink-0 items-center justify-center"
            style={{ width: 40, height: 40 }}
            title={`${score}%`}
          >
            <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke={tokens.border}
                strokeWidth="4"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke={scoreRingColor(score)}
                strokeWidth="4"
                strokeDasharray={`${(score / 100) * 100.5} 100.5`}
                strokeLinecap="round"
              />
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center text-xs font-medium"
              style={{ color: tokens.textPrimary }}
            >
              {score}%
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {fw.purpose_tags.map((tag) => (
          <span
            key={tag}
            className="rounded px-2 py-0.5"
            style={{
              background: tokens.border,
              color: tokens.textMuted,
              fontSize: "11px",
            }}
          >
            {tag}
          </span>
        ))}
      </div>
      <p
        className="mt-3"
        style={{ color: tokens.textMuted, fontSize: "13px" }}
      >
        {fw.control_count} control{fw.control_count !== 1 ? "s" : ""}
        {typeof postureEntry?.gapCount === "number" && (
          <span style={{ color: tokens.textDim }}> · {postureEntry.gapCount} gaps</span>
        )}
      </p>
      {(riskLevel != null || status != null) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {riskLevel != null && (
            <span
              className="rounded px-2 py-0.5 text-xs font-medium"
              style={riskBadgeStyle(riskLevel)}
            >
              {riskLevel}
            </span>
          )}
          {status != null && (
            <span
              className="rounded px-2 py-0.5 text-xs font-medium"
              style={{ color: statusBadgeColor(status) }}
            >
              {status}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export function ComplianceDashboard() {
  const { data: frameworks, isLoading, error } = useFrameworks();
  const { data: posture } = useCompliancePosture(DEFAULT_ORG_ID);
  const { data: ztaip } = useZtaipStatus();
  const { events, isStreaming, startStream, stopStream } = useAssessmentStream();
  const streamPanelRef = useRef<HTMLDivElement | null>(null);

  const postureByFrameworkId = posture
    ? new Map(posture.frameworks.map((f) => [f.frameworkId, f]))
    : null;

  useEffect(() => {
    if (events.length > 0 && streamPanelRef.current) {
      streamPanelRef.current.scrollTop = streamPanelRef.current.scrollHeight;
    }
  }, [events.length]);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-12"
        style={{ background: tokens.background }}
      >
        <p style={{ color: tokens.textMuted }}>Loading frameworks…</p>
      </div>
    );
  }

  if (error) {
    const isAuthError =
      error instanceof Error &&
      (error.message.includes("Invalid or expired token") || error.message.includes("Not authenticated"));
    return (
      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: tokens.red,
          background: "#1c1917",
          color: "#fca5a5",
        }}
      >
        <p className="font-medium">Failed to load frameworks</p>
        <p className="mt-1 text-sm">{error instanceof Error ? error.message : String(error)}</p>
        {isAuthError ? (
          <p className="mt-2 text-sm">Your session may have expired. You should be redirected to sign in.</p>
        ) : (
          <p className="mt-2 text-sm">
            Make sure the API is running. From repo root with Python venv active:{" "}
            <code className="rounded px-1" style={{ background: tokens.panel }}>./scripts/run-api.sh</code>
          </p>
        )}
      </div>
    );
  }

  if (!frameworks?.length) {
    return (
      <div
        className="rounded-lg border p-8 text-center"
        style={{
          background: tokens.panel,
          borderColor: tokens.border,
          color: tokens.textMuted,
        }}
      >
        No frameworks registered.
      </div>
    );
  }

  return (
    <div className="space-y-6" style={{ background: tokens.background, color: tokens.textPrimary }}>
      {/* ZTAIP status bar */}
      {ztaip && (
        <div
          className="rounded-lg border px-4 py-2"
          style={{
            background: tokens.surface,
            borderColor: tokens.border,
            color: tokens.textDim,
            fontSize: "12px",
            fontFamily: '"DM Mono", monospace',
          }}
        >
          <span className="font-medium" style={{ color: tokens.textMuted }}>ZTAIP:</span>{" "}
          audit events {ztaip.auditFabric.totalEvents} · circuit breakers {ztaip.circuitBreakersCount} · human review queue {ztaip.humanReviewQueueCount} · {ztaip.sovereigntyBroker}
        </div>
      )}

      {/* Org banner */}
      {posture && (
        <div
          className="rounded-lg border-b px-4 py-4"
          style={{
            background: tokens.surface,
            borderColor: tokens.border,
            borderBottomWidth: "1px",
          }}
        >
          <h2 className="font-bold" style={{ color: tokens.textPrimary }}>
            {posture.organisationName}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className="rounded px-2 py-0.5"
              style={{
                background: tokens.border,
                color: tokens.textMuted,
                fontSize: "11px",
              }}
            >
              {posture.frameworks.length} frameworks
            </span>
            <span
              className="rounded px-2 py-0.5"
              style={{
                background: tokens.border,
                color: tokens.textMuted,
                fontSize: "11px",
              }}
            >
              Updated {posture.updatedAt}
            </span>
          </div>
        </div>
      )}

      {/* Stats row: Overall Posture, Audit Readiness, Critical Gaps, Compliant X/8 */}
      {posture && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div
            className="rounded-lg border p-5"
            style={{
              background: tokens.panel,
              borderColor: tokens.border,
              padding: "20px 24px",
            }}
          >
            <p style={{ color: tokens.textDim, fontSize: "12px" }}>Overall Posture</p>
            <div className="mt-2 flex items-center gap-3">
              {typeof posture.overallScore === "number" ? (
                <>
                  <div
                    className="relative flex shrink-0 items-center justify-center"
                    style={{ width: 48, height: 48 }}
                    title={`${posture.overallScore}%`}
                  >
                    <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
                      <circle cx="24" cy="24" r="20" fill="none" stroke={tokens.border} strokeWidth="4" />
                      <circle
                        cx="24"
                        cy="24"
                        r="20"
                        fill="none"
                        stroke={scoreRingColor(posture.overallScore)}
                        strokeWidth="4"
                        strokeDasharray={`${(posture.overallScore / 100) * 125.6} 125.6`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span
                      className="absolute inset-0 flex items-center justify-center text-sm font-bold"
                      style={{ color: tokens.textPrimary }}
                    >
                      {posture.overallScore}%
                    </span>
                  </div>
                  <p className="font-bold" style={{ color: tokens.textPrimary, fontSize: "24px" }}>
                    {posture.overallScore}%
                  </p>
                </>
              ) : (
                <p className="font-bold" style={{ color: tokens.textMuted, fontSize: "24px" }}>—</p>
              )}
            </div>
          </div>
          <div
            className="rounded-lg border p-5"
            style={{
              background: tokens.panel,
              borderColor: tokens.border,
              padding: "20px 24px",
            }}
          >
            <p style={{ color: tokens.textDim, fontSize: "12px" }}>Audit Readiness</p>
            <div className="mt-2 flex items-center gap-3">
              {typeof posture.auditReadiness === "number" ? (
                <>
                  <div
                    className="relative flex shrink-0 items-center justify-center"
                    style={{ width: 48, height: 48 }}
                    title={`${posture.auditReadiness}%`}
                  >
                    <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
                      <circle cx="24" cy="24" r="20" fill="none" stroke={tokens.border} strokeWidth="4" />
                      <circle
                        cx="24"
                        cy="24"
                        r="20"
                        fill="none"
                        stroke={scoreRingColor(posture.auditReadiness)}
                        strokeWidth="4"
                        strokeDasharray={`${(posture.auditReadiness / 100) * 125.6} 125.6`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span
                      className="absolute inset-0 flex items-center justify-center text-sm font-bold"
                      style={{ color: tokens.textPrimary }}
                    >
                      {posture.auditReadiness}%
                    </span>
                  </div>
                  <p className="font-bold" style={{ color: tokens.textPrimary, fontSize: "24px" }}>
                    {posture.auditReadiness}%
                  </p>
                </>
              ) : (
                <p className="font-bold" style={{ color: tokens.textMuted, fontSize: "24px" }}>—</p>
              )}
            </div>
          </div>
          <div
            className="rounded-lg border p-5"
            style={{
              background: tokens.panel,
              borderColor: tokens.border,
              padding: "20px 24px",
            }}
          >
            <p style={{ color: tokens.textDim, fontSize: "12px" }}>Critical Gaps</p>
            <p className="font-bold" style={{ color: tokens.textPrimary, fontSize: "24px" }}>
              {typeof posture.criticalGapsCount === "number" ? posture.criticalGapsCount : "—"}
            </p>
          </div>
          <div
            className="rounded-lg border p-5"
            style={{
              background: tokens.panel,
              borderColor: tokens.border,
              padding: "20px 24px",
            }}
          >
            <p style={{ color: tokens.textDim, fontSize: "12px" }}>Compliant Frameworks</p>
            <p className="font-bold" style={{ color: tokens.textPrimary, fontSize: "24px" }}>
              {posture.frameworks.filter((f) => f.status === "COMPLIANT").length}/{posture.frameworks.length}
            </p>
          </div>
        </div>
      )}

      {/* Framework cards */}
      <div>
        <h2 className="mb-4 font-semibold" style={{ color: tokens.textPrimary, fontSize: "18px" }}>
          Compliance frameworks
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {frameworks.map((fw) => (
            <FrameworkCard
              key={fw.id}
              fw={fw}
              postureEntry={postureByFrameworkId?.get(fw.id)}
            />
          ))}
        </div>
      </div>

      {/* Run assessment + stream panel */}
      <div
        className="rounded-lg border p-4"
        style={{
          background: tokens.panel,
          borderColor: tokens.border,
        }}
      >
        <h2 className="font-semibold" style={{ color: tokens.textPrimary, fontSize: "18px" }}>
          Run assessment
        </h2>
        <p className="mt-1 text-sm" style={{ color: tokens.textMuted }}>
          Stream assessment for {DEFAULT_ORG_ID} — all 8 frameworks
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              startStream(DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS.split(","));
            }}
            disabled={isStreaming}
            className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: tokens.blue }}
          >
            {isStreaming ? "Streaming…" : "Start stream"}
          </button>
          {isStreaming && (
            <button
              type="button"
              onClick={stopStream}
              className="rounded border px-3 py-1.5 text-sm font-medium"
              style={{
                borderColor: tokens.border,
                color: tokens.textMuted,
                background: "transparent",
              }}
            >
              Stop
            </button>
          )}
        </div>
        {(isStreaming || events.length > 0) && (
          <div
            ref={streamPanelRef}
            className="mt-6 overflow-y-auto rounded-lg border"
            style={{
              padding: "16px",
              background: tokens.surface,
              borderColor: tokens.border,
              fontFamily: '"DM Mono", monospace',
              fontSize: "12px",
              color: tokens.textDim,
              maxHeight: "400px",
            }}
          >
            {isStreaming && events.length === 0 && (
              <div style={{ color: tokens.textMuted, padding: "2px 0" }}>Connecting…</div>
            )}
            {events.map((e, i) => {
              const { type, message } = eventDisplay(e);
              return (
                <div
                  key={i}
                  style={{
                    color:
                      type === "complete"
                        ? tokens.green
                        : type === "review"
                          ? tokens.amber
                          : type === "error"
                            ? tokens.red
                            : type === "fw_start"
                              ? tokens.blue
                              : tokens.textMuted,
                    padding: "2px 0",
                    borderBottom: "1px solid " + tokens.panel,
                  }}
                >
                  [{type}] {message}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
