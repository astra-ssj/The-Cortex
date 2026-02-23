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
import type { AssessmentEvent } from "./types/compliance";

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

function FrameworkCard({ fw }: { fw: FrameworkSummary }) {
  return (
    <Link
      to={`/frameworks/${fw.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      <h3 className="font-semibold text-slate-800">{fw.name}</h3>
      <p className="mt-1 text-sm text-slate-500">
        v{fw.version} · {fw.jurisdiction}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {fw.purpose_tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
          >
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm font-medium text-slate-600">
        {fw.control_count} control{fw.control_count !== 1 ? "s" : ""}
      </p>
    </Link>
  );
}

export function ComplianceDashboard() {
  const { data: frameworks, isLoading, error } = useFrameworks();
  const { data: posture } = useCompliancePosture(DEFAULT_ORG_ID);
  const { data: ztaip } = useZtaipStatus();
  const { events, isStreaming, startStream, stopStream } = useAssessmentStream();
  const streamPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (events.length > 0 && streamPanelRef.current) {
      streamPanelRef.current.scrollTop = streamPanelRef.current.scrollHeight;
    }
  }, [events.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">Loading frameworks…</p>
      </div>
    );
  }

  if (error) {
    const isAuthError =
      error instanceof Error &&
      (error.message.includes("Invalid or expired token") || error.message.includes("Not authenticated"));
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Failed to load frameworks</p>
        <p className="mt-1 text-sm">{error instanceof Error ? error.message : String(error)}</p>
        {isAuthError ? (
          <p className="mt-2 text-sm text-red-700">Your session may have expired. You should be redirected to sign in.</p>
        ) : (
          <p className="mt-2 text-sm text-red-700">
            Make sure the API is running. From repo root with Python venv active:{" "}
            <code className="rounded bg-red-100 px-1">./scripts/run-api.sh</code>
          </p>
        )}
      </div>
    );
  }

  if (!frameworks?.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        No frameworks registered.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ztaip && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
          <span className="font-medium">ZTAIP:</span> audit events {ztaip.auditFabric.totalEvents} · circuit breakers {ztaip.circuitBreakersCount} · human review queue {ztaip.humanReviewQueueCount} · {ztaip.sovereigntyBroker}
        </div>
      )}
      {posture && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-800">Posture — {posture.organisationName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {posture.frameworks.length} frameworks · updated {posture.updatedAt}
          </p>
        </div>
      )}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Compliance frameworks</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {frameworks.map((fw) => (
            <FrameworkCard key={fw.id} fw={fw} />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-800">Run assessment</h2>
        <p className="mt-1 text-sm text-slate-500">
          Stream assessment for {DEFAULT_ORG_ID} — all 8 frameworks
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              console.log("Stream button clicked");
              startStream(DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS.split(","));
            }}
            disabled={isStreaming}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {isStreaming ? "Streaming…" : "Start stream"}
          </button>
          {isStreaming && (
            <button
              type="button"
              onClick={stopStream}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Stop
            </button>
          )}
        </div>
        {(isStreaming || events.length > 0) && (
          <div
            ref={streamPanelRef}
            style={{
              marginTop: "24px",
              padding: "16px",
              background: "#05080f",
              borderRadius: "8px",
              border: "1px solid #1e2e48",
              fontFamily: "monospace",
              fontSize: "12px",
              maxHeight: "400px",
              overflowY: "auto",
            }}
          >
            {isStreaming && events.length === 0 && (
              <div style={{ color: "#94a3b8", padding: "2px 0" }}>Connecting…</div>
            )}
            {events.map((e, i) => {
              const { type, message } = eventDisplay(e);
              return (
                <div
                  key={i}
                  style={{
                    color:
                      type === "complete"
                        ? "#10b981"
                        : type === "review"
                          ? "#f59e0b"
                          : type === "error"
                            ? "#ef4444"
                            : type === "fw_start"
                              ? "#3b82f6"
                              : "#94a3b8",
                    padding: "2px 0",
                    borderBottom: "1px solid #0c1220",
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
