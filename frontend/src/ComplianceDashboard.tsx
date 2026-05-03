import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useRef, useEffect } from "react";
import { ALL_FRAMEWORK_IDS } from "./api/client";
import { useOrgContext } from "./hooks/useOrgContext";
import { useFrameworks } from "./hooks/useFrameworks";
import {
  useAssessmentStream,
  useCompliancePosture,
  useZtaipStatus,
} from "./store/complianceStore";
import type { FrameworkSummary } from "./api/frameworks";
import type { AssessmentEvent, FrameworkPosture } from "./types/compliance";
import { Skeleton, StatCardSkeleton, FrameworkCardSkeleton } from "./components/Skeleton";
import { DashboardEmpty, FrameworksEmpty } from "./components/ui/EmptyState";
import { AnimatedNumber, AnimatedScoreRing } from "./components/AnimatedScore";
import { TrustChip } from "./components/ui/TrustChip";

/** Token references — values resolve from :root in index.css */
const tokens = {
  border: "var(--border)",
  borderLit: "var(--border)",
  textPrimary: "var(--text)",
  textMuted: "var(--text-secondary)",
  textDim: "var(--text-quiet)",
  green: "var(--green)",
  amber: "var(--amber)",
  red: "var(--red)",
  blue: "var(--blue)",
  cardHoverBg: "var(--card-hover)",
  card: "var(--card)",
} as const;

function scoreRingColor(score: number): string {
  if (score >= 70) return tokens.green;
  if (score >= 50) return tokens.amber;
  return tokens.red;
}

function riskBadgeStyle(risk: string): { background: string; color: string } {
  switch (risk) {
    case "CRITICAL":
      return { background: "var(--tone-critical-bg)", color: "var(--tone-critical-fg)" };
    case "HIGH":
      return { background: "var(--tone-high-bg)", color: "var(--tone-high-fg)" };
    case "MEDIUM":
      return { background: "var(--tone-medium-bg)", color: "var(--tone-medium-fg)" };
    case "LOW":
      return { background: "var(--tone-low-bg)", color: "var(--tone-low-fg)" };
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
      className="card-stagger cortex-card-link block rounded-[var(--radius-md)] transition"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        padding: "var(--space-5)",
        color: "var(--text)",
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
          <h3 className="font-bold" style={{ color: "var(--text)", fontSize: "var(--text-body)" }}>
            {fw.name}
          </h3>
          <p className="cortex-text-caption mt-1" style={{ color: tokens.textDim }}>
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
              style={{ color: "var(--text)" }}
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
      <p className="cortex-text-body mt-3" style={{ color: "var(--muted)" }}>
        {fw.control_count} control{fw.control_count !== 1 ? "s" : ""}
        {typeof postureEntry?.gapCount === "number" && (
          <span style={{ color: tokens.textDim }}> · {postureEntry.gapCount} gaps</span>
        )}
      </p>
      {typeof score === "number" && (
        <div
          className="mt-3 overflow-hidden rounded"
          style={{ height: 4, background: tokens.border }}
        >
          <div
            className="bar-animated"
            style={{
              height: "100%",
              width: `${score}%`,
              background: scoreRingColor(score),
              borderRadius: 2,
            }}
          />
        </div>
      )}
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
  const navigate = useNavigate();
  const { orgId, demoMode } = useOrgContext();
  const { data: frameworks, isLoading, error } = useFrameworks();
  const { data: posture, isLoading: postureLoading } = useCompliancePosture(orgId);
  const { data: ztaip } = useZtaipStatus();
  const { events, isStreaming, streamError, clearStreamError, startStream, stopStream } =
    useAssessmentStream();
  const streamPanelRef = useRef<HTMLDivElement | null>(null);

  const streamPhase = streamError
    ? "error"
    : !isStreaming && events.length === 0
      ? "idle"
      : isStreaming && events.length === 0
        ? "connecting"
        : isStreaming
          ? "streaming"
          : "complete";

  function streamPhaseHintText(): string {
    switch (streamPhase) {
      case "idle":
        return "Opens a live SSE connection to the assessment engine; posture and review queue refresh when the run completes.";
      case "connecting":
        return "Connecting to the assessment stream…";
      case "streaming":
        return "Receiving assessment events…";
      case "complete":
        return "Last run finished — scroll the log below.";
      case "error":
        return "Stream failed — confirm the API is up and you are signed in.";
      default:
        return "";
    }
  }

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
        style={{ padding: "28px", background: "var(--shell)", color: "var(--text)" }}
        aria-busy="true"
        aria-live="polite"
      >
        <h1 className="cortex-text-page-title">Compliance overview</h1>
        <p className="cortex-text-caption mt-2">Loading posture and frameworks…</p>
        <div
          style={{
            background: "var(--surface)",
            border: `1px solid ${tokens.border}`,
            borderRadius: "8px",
            padding: "10px 16px",
            marginBottom: "24px",
          }}
        >
          <Skeleton width="60%" height="11px" />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>

        <Skeleton width="160px" height="13px" style={{ marginBottom: "16px" }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "14px",
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <FrameworkCardSkeleton key={i} />
          ))}
        </div>
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
          background: "var(--tone-error-box-bg)",
          color: "var(--tone-critical-fg)",
        }}
      >
        <p className="font-medium">Failed to load frameworks</p>
        <p className="mt-1 text-sm">{error instanceof Error ? error.message : String(error)}</p>
        {isAuthError ? (
          <p className="mt-2 text-sm">Your session may have expired. You should be redirected to sign in.</p>
        ) : (
          <p className="mt-2 text-sm">
            Make sure the API is running. From repo root with Python venv active:{" "}
            <code className="rounded px-1" style={{ background: "var(--panel)" }}>./scripts/run-api.sh</code>
          </p>
        )}
      </div>
    );
  }

  if (!frameworks?.length) {
    return (
      <div style={{ padding: "28px", background: "var(--shell)", color: "var(--text)" }}>
        <h1 className="cortex-text-page-title">Compliance overview</h1>
        <p className="cortex-text-caption mt-2 mb-6">Select frameworks to begin posture tracking.</p>
        <div
          style={{
            background: "var(--panel)",
            border: `1px solid ${tokens.border}`,
            borderRadius: "10px",
          }}
        >
          <FrameworksEmpty onSelectFrameworks={() => navigate("/onboarding")} />
        </div>
      </div>
    );
  }

  const hasAssessedPosture =
    posture &&
    typeof posture.overallScore === "number" &&
    posture.overallScore > 0;

  if (!hasAssessedPosture && !isLoading && orgId && !postureLoading) {
    return (
      <div style={{ padding: "28px", background: "var(--shell)", color: "var(--text)" }}>
        <h1 className="cortex-text-page-title">Compliance overview</h1>
        <p className="cortex-text-caption mt-2 mb-6">
          Run an assessment to populate scores and gap counts for your organisation.
        </p>
        {ztaip && (
          <div
            className="ztaip-bar rounded-lg border px-4 py-2"
            style={{
              marginBottom: "24px",
              background: "var(--surface)",
              borderColor: tokens.border,
              color: tokens.textDim,
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span className="font-medium" style={{ color: tokens.textMuted }}>
              ZTAIP:
            </span>{" "}
            audit events {ztaip.auditFabric.totalEvents} · circuit breakers {ztaip.circuitBreakersCount} · human review
            queue {ztaip.humanReviewQueueCount} · {ztaip.sovereigntyBroker}
          </div>
        )}
        <div
          style={{
            background: "var(--panel)",
            border: `1px solid ${tokens.border}`,
            borderRadius: "10px",
          }}
        >
          <DashboardEmpty
            orgName={posture?.organisationName ?? "Your Organisation"}
            onRunAssessment={() => {
              navigate("/onboarding");
            }}
            onViewFrameworks={() => {
              navigate("/frameworks");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="cortex-page-stack" style={{ background: "var(--shell)", color: "var(--text)" }}>
      <header>
        <h1 className="cortex-text-page-title">Compliance overview</h1>
        <p className="cortex-text-caption mt-2 max-w-2xl">
          Framework posture, audit readiness, and assessment streams scoped to your organisation.
        </p>
      </header>
      {posture?.message ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: tokens.borderLit,
            background: "var(--surface)",
            color: tokens.textMuted,
          }}
          role="status"
        >
          {posture.message}
        </div>
      ) : null}
      {/* ZTAIP status bar */}
      {ztaip && (
        <div
          className="rounded-lg border px-4 py-2"
          style={{
            background: "var(--surface)",
            borderColor: tokens.border,
            color: tokens.textDim,
            fontSize: "var(--text-caption)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span className="font-medium" style={{ color: tokens.textMuted }}>
            ZTAIP:
          </span>{" "}
          audit events {ztaip.auditFabric.totalEvents} · circuit breakers {ztaip.circuitBreakersCount} · human review
          queue {ztaip.humanReviewQueueCount} · {ztaip.sovereigntyBroker}
        </div>
      )}

      {/* Org banner */}
      {posture && (
        <section
          className="rounded-lg border-b px-4 py-4"
          style={{
            background: "var(--surface)",
            borderColor: tokens.border,
            borderBottomWidth: "1px",
          }}
          aria-labelledby="org-snapshot-title"
        >
          <h2 id="org-snapshot-title" className="cortex-text-section font-bold" style={{ color: "var(--text)" }}>
            {demoMode ? "AstraLabs Group" : posture.organisationName}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <TrustChip label="Coverage" variant="neutral">
              {posture.frameworks.length} framework{posture.frameworks.length !== 1 ? "s" : ""}
            </TrustChip>
            <TrustChip label="Snapshot" variant="neutral">
              {posture.updatedAt}
            </TrustChip>
          </div>
        </section>
      )}

      {/* Stats row: Overall Posture, Audit Readiness, Critical Gaps, Compliant X/8 */}
      {posture && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Posture summary">
          <div
            className="rounded-lg border p-5"
            style={{
              background: "var(--panel)",
              borderColor: tokens.border,
              padding: "var(--space-5) var(--space-6)",
            }}
          >
            <h3 className="cortex-text-caption font-semibold uppercase tracking-wide" style={{ color: tokens.textDim }}>
              Overall posture
            </h3>
            <div className="mt-2 flex items-center gap-3">
              {typeof posture.overallScore === "number" && posture.overallScore > 0 ? (
                <AnimatedScoreRing
                  value={posture.overallScore}
                  size={64}
                  strokeWidth={5}
                  duration={1400}
                  delay={100}
                />
              ) : (
                <div>
                  <p className="font-bold" style={{ color: tokens.textMuted, fontSize: "20px", margin: 0 }}>
                    Not Yet Assessed
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/onboarding")}
                    style={{
                      marginTop: 8,
                      border: "none",
                      background: "transparent",
                      color: "var(--cyan)",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Run your first assessment →
                  </button>
                </div>
              )}
            </div>
          </div>
          <div
            className="rounded-lg border p-5"
            style={{
              background: "var(--panel)",
              borderColor: tokens.border,
              padding: "var(--space-5) var(--space-6)",
            }}
          >
            <h3 className="cortex-text-caption font-semibold uppercase tracking-wide" style={{ color: tokens.textDim }}>
              Audit readiness
            </h3>
            <div className="mt-2 flex items-center gap-3">
              {typeof posture.auditReadiness === "number" ? (
                <AnimatedScoreRing
                  value={posture.auditReadiness}
                  size={64}
                  strokeWidth={5}
                  duration={1400}
                  delay={200}
                  color="var(--amber)"
                />
              ) : (
                <p className="font-bold" style={{ color: tokens.textMuted, fontSize: "24px" }}>—</p>
              )}
            </div>
          </div>
          <div
            className="rounded-lg border p-5"
            style={{
              background: "var(--panel)",
              borderColor: tokens.border,
              padding: "var(--space-5) var(--space-6)",
            }}
          >
            <h3 className="cortex-text-caption font-semibold uppercase tracking-wide" style={{ color: tokens.textDim }}>
              Critical gaps
            </h3>
            <p className="font-bold" style={{ color: "var(--text)", fontSize: "24px" }}>
              {typeof posture.criticalGapsCount === "number" ? (
                <AnimatedNumber
                  value={posture.criticalGapsCount}
                  duration={800}
                  delay={300}
                  style={{
                    fontSize: "28px",
                    fontWeight: 700,
                    fontFamily: "'Syne', sans-serif",
                    color: "var(--red)",
                  }}
                />
              ) : (
                "—"
              )}
            </p>
          </div>
          <div
            className="rounded-lg border p-5"
            style={{
              background: "var(--panel)",
              borderColor: tokens.border,
              padding: "var(--space-5) var(--space-6)",
            }}
          >
            <h3 className="cortex-text-caption font-semibold uppercase tracking-wide" style={{ color: tokens.textDim }}>
              Compliant frameworks
            </h3>
            <p className="font-bold" style={{ color: "var(--text)", fontSize: "24px" }}>
              <AnimatedNumber
                value={posture.frameworks.filter((f) => f.status === "COMPLIANT").length}
                duration={800}
                delay={400}
                style={{
                  fontSize: "28px",
                  fontWeight: 700,
                  fontFamily: "'Syne', sans-serif",
                  color: "var(--text)",
                }}
              />
              /{posture.frameworks.length}
            </p>
          </div>
        </section>
      )}

      {/* Framework cards */}
      <section aria-labelledby="fw-directory-heading">
        <h2 id="fw-directory-heading" className="cortex-text-section mb-4">
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
      </section>

      {/* Run assessment + stream panel */}
      <section
        className="rounded-lg border p-4"
        aria-labelledby="assessment-panel-heading"
        style={{
          background: "var(--panel)",
          borderColor: tokens.border,
        }}
      >
        <h2 id="assessment-panel-heading" className="cortex-text-section">
          Run assessment
        </h2>
        <p className="mt-1 text-sm" style={{ color: tokens.textMuted }}>
          Stream assessment for {orgId} — all 8 frameworks
        </p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: tokens.textDim }}>
          {streamPhaseHintText()}
        </p>
        {streamError && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p style={{ color: tokens.red, fontSize: 13, margin: 0 }}>{streamError}</p>
            <button
              type="button"
              onClick={() => clearStreamError()}
              className="rounded border px-2 py-1 text-xs"
              style={{ borderColor: tokens.border, color: tokens.textMuted, background: "transparent" }}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              startStream(orgId, ALL_FRAMEWORK_IDS.split(","));
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
              padding: "var(--space-4)",
              background: "var(--surface)",
              borderColor: tokens.border,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-caption)",
              color: tokens.textDim,
              maxHeight: "400px",
            }}
            aria-live={isStreaming ? "polite" : "off"}
            tabIndex={0}
            role="log"
            aria-label="Assessment event stream"
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
                    borderBottom: "1px solid var(--panel)",
                  }}
                >
                  [{type}] {message}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
