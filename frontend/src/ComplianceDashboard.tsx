import { Link } from "react-router-dom";
import { useFrameworks } from "./hooks/useFrameworks";
import {
  useAssessmentStream,
  useCompliancePosture,
  useZtaipStatus,
} from "./store/complianceStore";
import type { FrameworkSummary } from "./api/frameworks";

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

const DEMO_ORG_ID = "demo-org-001";

export function ComplianceDashboard() {
  const { data: frameworks, isLoading, error } = useFrameworks();
  const { data: posture } = useCompliancePosture(DEMO_ORG_ID);
  const { data: ztaip } = useZtaipStatus();
  const { events, isStreaming, startStream, stopStream } = useAssessmentStream();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">Loading frameworks…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Failed to load frameworks</p>
        <p className="mt-1 text-sm">{error instanceof Error ? error.message : String(error)}</p>
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
        <p className="mt-1 text-sm text-slate-500">Stream assessment for {DEMO_ORG_ID} (GDPR + NIS2)</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => startStream(DEMO_ORG_ID, ["gdpr", "nis2"])}
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
        {events.length > 0 && (
          <ul className="mt-4 max-h-48 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-xs">
            {events.map((e, i) => (
              <li key={i} className="py-1">
                <span className="font-medium text-slate-600">{e.kind}</span>
                {"frameworkId" in e && ` — ${(e as { frameworkId: string }).frameworkId}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
