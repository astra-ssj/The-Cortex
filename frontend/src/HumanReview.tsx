/**
 * Human Review Queue — GDPR Art.22 / EU AI Act Art.14 oversight.
 * Lists low-confidence assessments from Dynamic Autonomy Router (confidence < 0.75)
 * with Approve / Override actions. Logged to audit fabric.
 */

import { useState, useMemo } from "react";
import { useReviewQueue, approveControl, overrideControl } from "./api/client";
import { useOrgContext } from "./hooks/useOrgContext";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM"] as const;
const FRAMEWORKS = [
  "All",
  "GDPR 2016/679",
  "NIS2 Directive",
  "EU AI Act 2024",
  "ISO/IEC 27001:2022",
  "Cyber Essentials v3.1",
] as const;
const SORT_OPTIONS = [
  { value: "confidence", label: "Confidence (lowest first)" },
  { value: "severity", label: "Severity" },
  { value: "date", label: "Date" },
] as const;

type SeverityFilter = (typeof SEVERITIES)[number] | "All";
type FrameworkFilter = (typeof FRAMEWORKS)[number];
type SortKey = (typeof SORT_OPTIONS)[number]["value"];

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-cortex-red/20 text-cortex-red border border-cortex-red/40";
    case "HIGH":
      return "bg-cortex-amber/20 text-cortex-amber border border-cortex-amber/40";
    default:
      return "bg-cortex-muted/20 text-cortex-muted border border-cortex-border";
  }
}

function confidenceColor(confidence: number): string {
  if (confidence < 0.5) return "text-cortex-red";
  if (confidence < 0.75) return "text-cortex-amber";
  return "text-cortex-green";
}

function truncate(s: string, len: number): string {
  return s.length <= len ? s : s.slice(0, len - 3) + "…";
}

export function HumanReview() {
  const { orgId } = useOrgContext();
  const { items: rawItems, reviewed, refetch, isLoading, error } = useReviewQueue(orgId);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("All");
  const [frameworkFilter, setFrameworkFilter] = useState<FrameworkFilter>("All");
  const [sortBy, setSortBy] = useState<SortKey>("confidence");
  const [expandedApproveId, setExpandedApproveId] = useState<string | null>(null);
  const [expandedOverrideId, setExpandedOverrideId] = useState<string | null>(null);
  const [approveNotes, setApproveNotes] = useState<Record<string, string>>({});
  const [overridePayload, setOverridePayload] = useState<
    Record<string, { assessment: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT"; justification: string }>
  >({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [reviewedOpen, setReviewedOpen] = useState(false);

  const items = useMemo(() => {
    let list = [...(rawItems ?? [])];
    if (severityFilter !== "All") {
      list = list.filter((i) => i.severity === severityFilter);
    }
    if (frameworkFilter !== "All") {
      list = list.filter((i) => i.framework === frameworkFilter);
    }
    if (sortBy === "confidence") {
      list.sort((a, b) => a.confidence - b.confidence);
    } else if (sortBy === "severity") {
      const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
      list.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));
    } else {
      list.sort((a, b) => new Date(b.dateFlagged).getTime() - new Date(a.dateFlagged).getTime());
    }
    return list;
  }, [rawItems, severityFilter, frameworkFilter, sortBy]);

  const pendingCount = items.length;

  if (isLoading && !rawItems?.length) {
    return (
      <div className="flex items-center justify-center py-16 font-ui text-cortex-muted">
        Loading review queue…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-cortex-red/50 bg-cortex-red/10 p-4 font-ui text-cortex-red">
        Failed to load review queue: {error.message}
      </div>
    );
  }

  const handleApprove = async (id: string) => {
    const notes = (approveNotes[id] ?? "").trim();
    if (!notes) return;
    setSubmitting(id);
    try {
      await approveControl(id, notes);
      setApproveNotes((prev) => ({ ...prev, [id]: "" }));
      setExpandedApproveId(null);
      refetch();
    } finally {
      setSubmitting(null);
    }
  };

  const handleOverride = async (id: string) => {
    const payload = overridePayload[id];
    if (!payload?.justification?.trim() || payload.justification.length < 20) return;
    setSubmitting(id);
    try {
      await overrideControl(id, payload.assessment, payload.justification);
      setOverridePayload((prev) => ({ ...prev, [id]: { assessment: "PARTIAL", justification: "" } }));
      setExpandedOverrideId(null);
      refetch();
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-ui text-2xl font-semibold text-cortex-text">Human Review Queue</h1>
          <p className="mt-1 font-ui text-sm text-cortex-muted">
            AI assessments requiring human oversight — Dynamic Autonomy Router confidence &lt; 0.75
          </p>
          <p className="mt-1 font-data text-xs text-cortex-muted">
            Art.22 Compliance · EU AI Act Art.14
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-cortex-amber/50 bg-cortex-amber/10 px-3 py-1 font-data text-sm font-medium text-cortex-amber">
            {pendingCount} item{pendingCount !== 1 ? "s" : ""} pending review
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-cortex-border bg-cortex-panel p-4">
        <span className="font-data text-xs uppercase tracking-wider text-cortex-muted">Filter by severity</span>
        <div className="flex gap-2">
          {(["All", ...SEVERITIES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={`rounded px-3 py-1.5 font-ui text-sm ${severityFilter === s ? "bg-cortex-blue text-white" : "bg-cortex-surface text-cortex-muted hover:text-cortex-text"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-4 font-data text-xs uppercase tracking-wider text-cortex-muted">Framework</span>
        <select
          value={frameworkFilter}
          onChange={(e) => setFrameworkFilter(e.target.value as FrameworkFilter)}
          className="rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
        >
          {FRAMEWORKS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="ml-4 font-data text-xs uppercase tracking-wider text-cortex-muted">Sort by</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Queue table */}
      <div className="overflow-hidden rounded-xl border border-cortex-border bg-cortex-panel">
        {pendingCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="mb-4 text-4xl text-cortex-green">✓</span>
            <p className="font-ui text-lg font-medium text-cortex-text">No items pending review</p>
            <p className="mt-2 max-w-md font-ui text-sm text-cortex-muted">
              All AI assessments met the 0.75 confidence threshold. The Dynamic Autonomy Router has cleared the queue.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-cortex-border bg-cortex-surface/50">
                  <th className="px-4 py-3 text-left font-data text-xs uppercase tracking-wider text-cortex-muted">Severity</th>
                  <th className="px-4 py-3 text-left font-data text-xs uppercase tracking-wider text-cortex-muted">Framework · Control</th>
                  <th className="px-4 py-3 text-left font-data text-xs uppercase tracking-wider text-cortex-muted">Control name</th>
                  <th className="px-4 py-3 text-left font-data text-xs uppercase tracking-wider text-cortex-muted">AI Assessment</th>
                  <th className="px-4 py-3 text-left font-data text-xs uppercase tracking-wider text-cortex-muted">Confidence</th>
                  <th className="px-4 py-3 text-left font-data text-xs uppercase tracking-wider text-cortex-muted">Reference</th>
                  <th className="px-4 py-3 text-left font-data text-xs uppercase tracking-wider text-cortex-muted">Date flagged</th>
                  <th className="px-4 py-3 text-right font-data text-xs uppercase tracking-wider text-cortex-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-cortex-border/50 hover:bg-cortex-surface/30">
                    <td className="px-4 py-3">
                      <span className={`rounded border px-2 py-0.5 font-data text-xs ${severityBadgeClass(row.severity)}`}>
                        {row.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-ui text-sm text-cortex-text">
                      {row.framework} · {row.controlId}
                    </td>
                    <td className="px-4 py-3 font-ui text-sm text-cortex-text" title={row.name}>
                      {truncate(row.name, 40)}
                    </td>
                    <td className="px-4 py-3 font-data text-sm text-cortex-text">{row.assessment}</td>
                    <td className={`px-4 py-3 font-data text-sm font-medium ${confidenceColor(row.confidence)}`}>
                      {Math.round(row.confidence * 100)}%
                    </td>
                    <td className="px-4 py-3 font-data text-xs text-cortex-muted">{row.reference}</td>
                    <td className="px-4 py-3 font-data text-xs text-cortex-muted">{row.dateFlagged}</td>
                    <td className="px-4 py-3 text-right">
                      {expandedApproveId === row.id ? (
                        <div className="inline-block rounded-lg border border-cortex-border bg-cortex-surface p-3 text-left">
                          <label className="block font-ui text-xs text-cortex-muted">Assessor Notes (required)</label>
                          <input
                            type="text"
                            value={approveNotes[row.id] ?? ""}
                            onChange={(e) => setApproveNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            className="mt-1 w-64 rounded border border-cortex-border bg-cortex-panel px-2 py-1.5 font-ui text-sm text-cortex-text"
                            placeholder="Brief notes for audit"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleApprove(row.id)}
                              disabled={!(approveNotes[row.id] ?? "").trim() || submitting === row.id}
                              className="rounded bg-cortex-green px-3 py-1.5 font-ui text-sm font-medium text-white hover:bg-cortex-green/90 disabled:opacity-50"
                            >
                              Confirm Approval
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedApproveId(null)}
                              className="rounded border border-cortex-border px-3 py-1.5 font-ui text-sm text-cortex-muted hover:text-cortex-text"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : expandedOverrideId === row.id ? (
                        <div className="inline-block rounded-lg border border-cortex-border bg-cortex-surface p-3 text-left">
                          <p className="font-ui text-xs text-cortex-muted">Current AI assessment: {row.assessment}</p>
                          <label className="mt-2 block font-ui text-xs text-cortex-muted">Your Assessment</label>
                          <select
                            value={overridePayload[row.id]?.assessment ?? "PARTIAL"}
                            onChange={(e) =>
                              setOverridePayload((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...(prev[row.id] ?? { assessment: "PARTIAL", justification: "" }),
                                  assessment: e.target.value as "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT",
                                },
                              }))
                            }
                            className="mt-1 w-48 rounded border border-cortex-border bg-cortex-panel px-2 py-1.5 font-ui text-sm text-cortex-text"
                          >
                            <option value="COMPLIANT">COMPLIANT</option>
                            <option value="PARTIAL">PARTIAL</option>
                            <option value="NON_COMPLIANT">NON_COMPLIANT</option>
                          </select>
                          <label className="mt-2 block font-ui text-xs text-cortex-muted">Justification (min 20 chars)</label>
                          <textarea
                            value={overridePayload[row.id]?.justification ?? ""}
                            onChange={(e) =>
                              setOverridePayload((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...(prev[row.id] ?? { assessment: "PARTIAL", justification: "" }),
                                  justification: e.target.value,
                                },
                              }))
                            }
                            rows={2}
                            className="mt-1 w-64 rounded border border-cortex-border bg-cortex-panel px-2 py-1.5 font-ui text-sm text-cortex-text"
                            placeholder="Reason for override"
                          />
                          <p className="mt-1 font-data text-xs text-cortex-amber">
                            This override will be logged immutably to the Audit Fabric.
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleOverride(row.id)}
                              disabled={
                                !(overridePayload[row.id]?.justification ?? "").trim() ||
                                (overridePayload[row.id]?.justification ?? "").length < 20 ||
                                submitting === row.id
                              }
                              className="rounded bg-cortex-amber px-3 py-1.5 font-ui text-sm font-medium text-cortex-bg hover:bg-cortex-amber/90 disabled:opacity-50"
                            >
                              Submit Override
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedOverrideId(null)}
                              className="rounded border border-cortex-border px-3 py-1.5 font-ui text-sm text-cortex-muted hover:text-cortex-text"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedApproveId(row.id)}
                            className="rounded bg-cortex-green/20 px-3 py-1.5 font-ui text-sm font-medium text-cortex-green hover:bg-cortex-green/30"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedOverrideId(row.id)}
                            className="rounded bg-cortex-amber/20 px-3 py-1.5 font-ui text-sm font-medium text-cortex-amber hover:bg-cortex-amber/30"
                          >
                            Override
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reviewed section */}
      {(reviewed?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-cortex-border bg-cortex-panel">
          <button
            type="button"
            onClick={() => setReviewedOpen((o) => !o)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <span className="font-ui text-sm font-semibold text-cortex-text">Reviewed Items</span>
            <span className="font-data text-xs text-cortex-muted">{reviewed?.length ?? 0} items</span>
            <span className={`transition ${reviewedOpen ? "rotate-180" : ""}`}>
              <svg className="h-4 w-4 text-cortex-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>
          {reviewedOpen && (
            <div className="border-t border-cortex-border p-4">
              <ul className="space-y-3">
                {(reviewed ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-cortex-border/50 bg-cortex-surface/50 p-3 font-ui text-sm"
                  >
                    <span className="text-cortex-text">{r.framework} · {r.controlId}</span>
                    <span className="mx-2 text-cortex-muted">—</span>
                    <span className="text-cortex-muted">
                      {r.action === "approved" ? "Approved" : "Overridden"} by {r.actedBy} · {r.actedAt}
                    </span>
                    <span className="ml-2 text-cortex-muted">
                      Original confidence {Math.round(r.originalConfidence * 100)}% · Final: {r.finalDecision}
                    </span>
                    {r.auditRef && (
                      <span className="ml-2 font-data text-xs text-cortex-muted">Audit: {r.auditRef}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
