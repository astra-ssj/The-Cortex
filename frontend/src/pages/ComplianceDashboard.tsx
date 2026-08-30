import { useNavigate } from "react-router-dom";
import { useRef, useEffect, useMemo, useState } from "react";
import { useOrgContext } from "../hooks/useOrgContext";
import { useRole } from "../hooks/useRole";
import { useFrameworks } from "../hooks/useFrameworks";
import {
  useAssessmentStream,
  useCompliancePosture,
  useZtaipStatus,
} from "../store/complianceStore";
import { Skeleton, StatCardSkeleton } from "../components/Skeleton";
import { DashboardEmpty, FrameworksEmpty } from "../components/ui/EmptyState";
import { TrustChip } from "../components/ui/TrustChip";
import { Button, Card, Table, Tooltip } from "../components/ui";
import { FrameworkComplianceTable } from "../components/FrameworkComplianceTable";
import { CompliancePostureStatCards } from "../components/CompliancePostureStatCards";
import { RunAssessmentModal } from "../components/RunAssessmentModal";
import {
  eventDisplay,
  FRAMEWORK_TABLE_COLUMNS,
  type FrameworkSortKey,
  riskCompare,
  statusCompare,
  streamEventColor,
} from "../lib/complianceDashboardUtils";

export function ComplianceDashboard() {
  const navigate = useNavigate();
  const { orgId, demoMode } = useOrgContext();
  const { can } = useRole();
  const canRunAssessment = can("canRunAssessment");
  const { data: frameworks, isLoading, error } = useFrameworks();
  const { data: posture, isLoading: postureLoading } = useCompliancePosture(orgId);
  const { data: ztaip } = useZtaipStatus();
  const { events, isStreaming, streamError, clearStreamError, startStream, stopStream } =
    useAssessmentStream();
  const streamPanelRef = useRef<HTMLDivElement | null>(null);
  const [sortKey, setSortKey] = useState<FrameworkSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [runModalOpen, setRunModalOpen] = useState(false);

  const streamPhase = streamError
    ? "error"
    : !isStreaming && events.length === 0
      ? "idle"
      : isStreaming && events.length === 0
        ? "connecting"
        : isStreaming
          ? "streaming"
          : "complete";

  const streamHint: Record<string, string> = {
    idle: "Opens a live SSE connection to the assessment engine; posture and review queue refresh when the run completes.",
    connecting: "Connecting to the assessment stream…",
    streaming: "Receiving assessment events…",
    complete: "Last run finished — scroll the log below.",
    error: "Stream failed — confirm the API is up and you are signed in.",
  };

  const postureByFrameworkId = posture
    ? new Map(posture.frameworks.map((f) => [f.frameworkId, f]))
    : null;

  const sortedFrameworks = useMemo(() => {
    if (!frameworks?.length) return [];
    const list = [...frameworks];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const pa = postureByFrameworkId?.get(a.id);
      const pb = postureByFrameworkId?.get(b.id);
      switch (sortKey) {
        case "name":
          return mult * a.name.localeCompare(b.name);
        case "jurisdiction": {
          const ja = pa?.jurisdiction ?? a.jurisdiction;
          const jb = pb?.jurisdiction ?? b.jurisdiction;
          return mult * ja.localeCompare(jb);
        }
        case "score":
          return mult * ((pa?.score ?? -1) - (pb?.score ?? -1));
        case "controls":
          return mult * (a.control_count - b.control_count);
        case "risk":
          return mult * riskCompare(pa?.riskLevel, pb?.riskLevel);
        case "status":
          return mult * statusCompare(pa?.status, pb?.status);
        default:
          return 0;
      }
    });
    return list;
  }, [frameworks, postureByFrameworkId, sortKey, sortDir]);

  function handleFrameworkSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key as FrameworkSortKey);
      setSortDir("asc");
    }
  }

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
          className="mb-6 rounded-lg border p-3"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <Skeleton width="60%" height="11px" />
        </div>
        <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <Skeleton width="160px" height="13px" className="mb-4" />
        <Table>
          <Table.Header columns={FRAMEWORK_TABLE_COLUMNS} />
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Table.Row key={i}>
                <Table.Cell colSpan={6}>
                  <Skeleton height={14} />
                </Table.Cell>
              </Table.Row>
            ))}
          </tbody>
        </Table>
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
          borderColor: "var(--red)",
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
            <code className="rounded px-1" style={{ background: "var(--panel)" }}>
              ./scripts/run-api.sh
            </code>
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
        <div className="rounded-[10px] border" style={{ background: "var(--panel)", borderColor: "var(--border)" }}>
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
            className="ztaip-bar mb-6 rounded-lg border px-4 py-2"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-quiet)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
              ZTAIP:
            </span>{" "}
            audit events {ztaip.auditFabric?.totalEvents ?? 0} · circuit breakers {ztaip.circuitBreakersCount} · human review
            queue {ztaip.humanReviewQueueCount} · {ztaip.sovereigntyBroker}
          </div>
        )}
        <div className="rounded-[10px] border" style={{ background: "var(--panel)", borderColor: "var(--border)" }}>
          <DashboardEmpty
            orgName={posture?.organisationName ?? "Your Organisation"}
            onRunAssessment={
              canRunAssessment ? () => navigate("/onboarding") : undefined
            }
            onViewFrameworks={() => navigate("/frameworks")}
          />
        </div>
      </div>
    );
  }

  const modalFrameworks =
    frameworks?.map((f) => ({ id: f.id, name: f.name })) ?? null;

  return (
    <div className="cortex-page-stack" style={{ background: "var(--shell)", color: "var(--text)" }}>
      <RunAssessmentModal
        open={runModalOpen}
        onClose={() => {
          setRunModalOpen(false);
        }}
        frameworks={modalFrameworks}
        disabled={isStreaming || !canRunAssessment}
        onConfirm={(ids) => {
          startStream(orgId, ids);
        }}
      />
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
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--text-secondary)",
          }}
          role="status"
        >
          {posture.message}
        </div>
      ) : null}
      {ztaip && (
        <div
          className="rounded-lg border px-4 py-2"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-quiet)",
            fontSize: "var(--text-caption)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
            ZTAIP:
          </span>{" "}
          audit events {ztaip.auditFabric?.totalEvents ?? 0} · circuit breakers {ztaip.circuitBreakersCount} · human review
          queue {ztaip.humanReviewQueueCount} · {ztaip.sovereigntyBroker}
        </div>
      )}

      {posture && (
        <section
          className="rounded-lg border-b px-4 py-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)", borderBottomWidth: "1px" }}
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

      {posture && (
        <CompliancePostureStatCards
          posture={posture}
          onRunFirstAssessment={() => navigate("/onboarding")}
        />
      )}

      <section aria-labelledby="fw-directory-heading">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="fw-directory-heading" className="cortex-text-section">
            Compliance frameworks
          </h2>
          <Tooltip content="Sort by column headers. Click a row to open framework detail." position="left">
            <span
              className="cursor-help text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-quiet)" }}
              tabIndex={0}
            >
              How to use
            </span>
          </Tooltip>
        </div>
        <FrameworkComplianceTable
          columns={FRAMEWORK_TABLE_COLUMNS}
          sortedFrameworks={sortedFrameworks}
          postureByFrameworkId={postureByFrameworkId}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleFrameworkSort}
          onOpenFramework={(id) => navigate(`/frameworks/${encodeURIComponent(id)}`)}
        />
      </section>

      <Card>
        <Card.Body className="p-4">
          <h2 id="assessment-panel-heading" className="cortex-text-section">
            Run assessment
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Stream assessment for {orgId}. Choose which frameworks to include when you start a run.
          </p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-quiet)" }}>
            {streamHint[streamPhase] ?? ""}
          </p>
          {streamError && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{streamError}</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => clearStreamError()}>
                Dismiss
              </Button>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isStreaming || !canRunAssessment}
              title={!canRunAssessment ? "Admin or Analyst required" : undefined}
              onClick={() => {
                setRunModalOpen(true);
              }}
            >
              {isStreaming ? "Streaming…" : "Run assessment"}
            </Button>
            {isStreaming ? (
              <Button type="button" variant="secondary" size="sm" onClick={stopStream}>
                Stop
              </Button>
            ) : null}
          </div>
          {(isStreaming || events.length > 0) && (
            <div
              ref={streamPanelRef}
              className="mt-6 overflow-y-auto rounded-lg border"
              style={{
                padding: "var(--space-4)",
                background: "var(--surface)",
                borderColor: "var(--border)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-caption)",
                color: "var(--text-quiet)",
                maxHeight: "400px",
              }}
              aria-live={isStreaming ? "polite" : "off"}
              tabIndex={0}
              role="log"
              aria-label="Assessment event stream"
            >
              {isStreaming && events.length === 0 && (
                <div style={{ color: "var(--text-secondary)", padding: "2px 0" }}>Connecting…</div>
              )}
              {events.map((e, i) => {
                const { type, message } = eventDisplay(e);
                return (
                  <div
                    key={i}
                    style={{
                      color: streamEventColor(type),
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
        </Card.Body>
      </Card>
    </div>
  );
}
