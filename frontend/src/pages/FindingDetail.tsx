/**
 * Deep-linkable finding detail (/findings/:id). Loads GET /api/v1/findings/{id};
 * owner/status/priority/due_date PATCH via updateFinding.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchFindings,
  getFinding,
  updateFinding,
  uploadEvidence,
  type FindingStatus,
  type RemediationFinding,
  type UpdateFindingBody,
} from "../api/client";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { FileUpload } from "../components/ui/FileUpload";
import { useOrgContext } from "../hooks/useOrgContext";
import { useRole } from "../hooks/useRole";
import { invalidateComplianceData } from "../store/complianceStore";

const STATUSES: FindingStatus[] = ["OPEN", "IN_PROGRESS", "REMEDIATED", "ACCEPTED"];
const STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  REMEDIATED: "Remediated",
  ACCEPTED: "Accepted",
};

const OWNER_OPTIONS = [
  "Unassigned",
  "CISO",
  "DPO",
  "CTO",
  "Security Lead DE",
  "Security Lead UK",
  "Security Lead ES",
  "Security Lead AU",
  "Security Lead TH",
];

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-cortex-red/20 text-cortex-red border border-cortex-red/40";
    case "HIGH":
      return "bg-cortex-amber/20 text-cortex-amber border border-cortex-amber/40";
    case "MEDIUM":
      return "bg-cortex-muted/20 text-cortex-muted border border-cortex-border";
    default:
      return "bg-cortex-muted/20 text-cortex-muted border border-cortex-border";
  }
}

function statusBadgeClass(status: FindingStatus): string {
  switch (status) {
    case "OPEN":
      return "bg-cortex-red/20 text-cortex-red border-cortex-red/40";
    case "IN_PROGRESS":
      return "bg-cortex-amber/20 text-cortex-amber border-cortex-amber/40";
    case "REMEDIATED":
      return "bg-cortex-green/20 text-cortex-green border-cortex-green/40";
    default:
      return "bg-cortex-muted/20 text-cortex-muted border-cortex-border";
  }
}

function formatDisplayDate(raw: string | undefined): string {
  if (!raw?.trim()) return "—";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return raw;
  }
}

export default function FindingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId } = useOrgContext();
  const { can } = useRole();
  const canEditFindings = can("canEditFindings");

  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<FindingStatus>("OPEN");
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">("P1");
  const [dueDate, setDueDate] = useState("");

  const {
    data: finding,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["finding", id, orgId],
    queryFn: () => getFinding(id!, { org_id: orgId }),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!finding) return;
    setOwner(finding.owner);
    setStatus(finding.status as FindingStatus);
    setPriority((finding.priority as "P0" | "P1" | "P2") || "P1");
    setDueDate(finding.due_date || "");
  }, [finding]);

  const relatedQuery = useQuery({
    queryKey: ["findings", "byFramework", finding?.framework_id, orgId],
    queryFn: () => fetchFindings({ framework_id: finding!.framework_id, org_id: orgId }),
    enabled: Boolean(finding?.framework_id),
  });

  const relatedFindings = useMemo(() => {
    const list = relatedQuery.data?.items ?? [];
    return list.filter((f) => f.id !== finding?.id).slice(0, 8);
  }, [relatedQuery.data, finding?.id]);

  const patchMutation = useMutation({
    mutationFn: (body: UpdateFindingBody) => updateFinding(id!, body),
    onSuccess: (updated) => {
      queryClient.setQueryData<RemediationFinding>(["finding", id, orgId], updated);
      void queryClient.invalidateQueries({ queryKey: ["findings", "byFramework", updated.framework_id, orgId] });
      invalidateComplianceData(queryClient, orgId);
    },
  });

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/evidence");
    }
  };

  const optionalRecord = finding as RemediationFinding | undefined;
  const createdAt =
    optionalRecord && typeof optionalRecord["created_at"] === "string"
      ? (optionalRecord["created_at"] as string)
      : undefined;
  const updatedAt =
    optionalRecord && typeof optionalRecord["updated_at"] === "string"
      ? (optionalRecord["updated_at"] as string)
      : undefined;

  const evidenceRaw = optionalRecord?.["evidence"];
  const evidenceList = Array.isArray(evidenceRaw) ? evidenceRaw : [];

  const notesTimeline = useMemo(() => {
    const notes = finding?.notes ?? [];
    return [...notes].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
  }, [finding?.notes]);

  const lastUpdatedDisplay =
    updatedAt?.trim() ||
    (notesTimeline[0]?.timestamp ? formatDisplayDate(notesTimeline[0].timestamp) : "—");

  if (isLoading && !finding) {
    return (
      <div className="flex items-center justify-center py-16 font-ui text-cortex-muted">
        Loading finding…
      </div>
    );
  }

  if (error || !finding) {
    const msg = error instanceof Error ? error.message : "Finding not found";
    return (
      <div className="rounded-lg border border-cortex-red/50 bg-cortex-red/10 p-6 font-ui">
        <p className="font-medium text-cortex-red">Could not load finding</p>
        <p className="mt-1 text-sm text-cortex-muted">{msg}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 text-sm text-cortex-text hover:bg-cortex-border"
          >
            Back
          </button>
          <Link
            to="/evidence"
            className="rounded bg-cortex-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-cortex-blue/90"
          >
            Go to Findings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="text-cortex-text">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="rounded border border-cortex-border bg-cortex-panel px-3 py-1.5 font-ui text-sm text-cortex-muted hover:text-cortex-text"
        >
          ← Back
        </button>
      </div>

      <Breadcrumb items={[{ label: "Findings", href: "/evidence" }, { label: finding.id }]} />

      <div className="mt-2 grid gap-8 lg:grid-cols-[13fr_7fr]">
        {/* Main column */}
        <div className="min-w-0 space-y-8">
          <header>
            <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">{finding.id}</p>
            <h1 className="mt-1 font-ui text-2xl font-semibold text-cortex-text">{finding.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`rounded border px-2 py-0.5 font-data text-xs ${statusBadgeClass(status)}`}
              >
                {STATUS_LABELS[status]}
              </span>
              <span
                className={`rounded border px-2 py-0.5 font-data text-xs ${severityBadgeClass(finding.severity)}`}
              >
                {finding.severity}
              </span>
              <span className="rounded border border-cortex-border px-2 py-0.5 font-data text-xs text-cortex-muted">
                {finding.framework}
              </span>
            </div>
          </header>

          <section className="max-w-none rounded-xl border border-cortex-border bg-cortex-panel/40 p-5">
            <h2 className="font-ui text-lg font-semibold text-cortex-text">Assessment</h2>
            <p className="mt-2 font-ui text-sm leading-relaxed text-cortex-text">{finding.current_state}</p>
            <h3 className="mt-4 font-ui text-base font-semibold text-cortex-text">Required state</h3>
            <p className="mt-2 font-ui text-sm leading-relaxed text-cortex-text">{finding.required_state}</p>
          </section>

          <section>
            <h2 className="font-ui text-lg font-semibold text-cortex-text">Control reference</h2>
            <p className="mt-2 font-ui text-sm text-cortex-muted">
              {finding.control_id} — {finding.control_name}
            </p>
            <p className="mt-1 font-ui text-sm text-cortex-muted">Regulatory reference: {finding.reference}</p>
            <p className="mt-3">
              <Link
                to={`/frameworks/${encodeURIComponent(finding.framework_id)}`}
                className="font-ui text-sm text-cortex-blue hover:underline"
              >
                View framework: {finding.framework}
              </Link>
            </p>
          </section>

          <section>
            <h2 className="font-ui text-lg font-semibold text-cortex-text">Evidence</h2>
            {evidenceList.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {evidenceList.map((ev, i) => {
                  const row =
                    typeof ev === "object" && ev !== null
                      ? (ev as { id?: string; title?: string; label?: string })
                      : null;
                  const title = row?.title ?? row?.label ?? JSON.stringify(ev);
                  const eid = row?.id;
                  return (
                    <li
                      key={eid ?? i}
                      className="rounded-lg border border-cortex-border bg-cortex-surface px-3 py-2 font-ui text-sm text-cortex-text"
                    >
                      <span>{title}</span>
                      {eid ? (
                        <Link
                          to={`/graph?highlight=${encodeURIComponent(eid)}`}
                          className="mt-1 block font-ui text-xs text-cortex-blue hover:underline"
                        >
                          View on compliance graph →
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 font-ui text-sm text-cortex-muted">
                No evidence attached yet.
              </p>
            )}
            {canEditFindings ? (
              <div className="mt-4">
                <FileUpload
                  label="Attach evidence"
                  onUpload={async (file, onProgress) => {
                    const result = await uploadEvidence(
                      file,
                      {
                        org_id: orgId,
                        finding_id: finding.id,
                        control_id: finding.control_id,
                        framework_id: finding.framework_id,
                      },
                      { onProgress }
                    );
                    await queryClient.invalidateQueries({ queryKey: ["finding", id, orgId] });
                    await queryClient.invalidateQueries({
                      queryKey: ["findings", "byFramework", finding.framework_id, orgId],
                    });
                    invalidateComplianceData(queryClient, orgId);
                    const linked = result.controlsLinked ?? 0;
                    return {
                      successMessage: result.evidenceId
                        ? `Linked to ${linked} control${linked === 1 ? "" : "s"} on the compliance graph. Open Graph to explore.`
                        : "Document processed (graph tables unavailable in this environment).",
                    };
                  }}
                />
              </div>
            ) : null}
          </section>

          <section>
            <h2 className="font-ui text-lg font-semibold text-cortex-text">Activity</h2>
            {notesTimeline.length > 0 ? (
              <ul className="mt-3 space-y-3 border-l border-cortex-border pl-4">
                {notesTimeline.map((n, i) => (
                  <li key={i} className="relative font-ui text-sm text-cortex-muted">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-cortex-border" />
                    {n.timestamp ? formatDisplayDate(n.timestamp) : "—"} — {n.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 font-ui text-sm text-cortex-muted">No notes yet.</p>
            )}
            <p className="mt-4 font-data text-xs text-cortex-muted">
              TODO: full audit trail when backend exposes finding history.
            </p>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-6">
          <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
            <h2 className="font-ui text-sm font-semibold text-cortex-text">Metadata</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block font-data text-xs uppercase tracking-wider text-cortex-muted">
                  Owner
                </label>
                <select
                  value={owner}
                  disabled={!canEditFindings || patchMutation.isPending}
                  onChange={(e) => {
                    const next = e.target.value;
                    setOwner(next);
                    patchMutation.mutate({ owner: next });
                  }}
                  className="mt-1 w-full rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
                >
                  {OWNER_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-data text-xs uppercase tracking-wider text-cortex-muted">
                  Status
                </label>
                <select
                  value={status}
                  disabled={!canEditFindings || patchMutation.isPending}
                  onChange={(e) => {
                    const next = e.target.value as FindingStatus;
                    setStatus(next);
                    patchMutation.mutate({ status: next });
                  }}
                  className="mt-1 w-full rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-data text-xs uppercase tracking-wider text-cortex-muted">
                  Priority
                </label>
                <select
                  value={priority}
                  disabled={!canEditFindings || patchMutation.isPending}
                  onChange={(e) => {
                    const next = e.target.value as "P0" | "P1" | "P2";
                    setPriority(next);
                    patchMutation.mutate({ priority: next });
                  }}
                  className="mt-1 w-full rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
                >
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                </select>
              </div>
              <div>
                <label className="block font-data text-xs uppercase tracking-wider text-cortex-muted">
                  Due date (SLA)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  disabled={!canEditFindings || patchMutation.isPending}
                  onChange={(e) => setDueDate(e.target.value)}
                  onBlur={() => {
                    if (dueDate !== (finding.due_date || "")) {
                      patchMutation.mutate({ due_date: dueDate });
                    }
                  }}
                  className="mt-1 w-full rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
                />
              </div>
              <dl className="space-y-2 border-t border-cortex-border pt-4 font-ui text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-cortex-muted">Created</dt>
                  <dd className="text-right text-cortex-text">{formatDisplayDate(createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-cortex-muted">Last updated</dt>
                  <dd className="text-right text-cortex-text">{lastUpdatedDisplay}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-cortex-muted">Entity</dt>
                  <dd className="text-right text-cortex-text">{finding.entity}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-cortex-muted">Days open</dt>
                  <dd className="text-right font-data text-cortex-text">{finding.days_open ?? "—"}</dd>
                </div>
              </dl>
            </div>
            {patchMutation.isError ? (
              <p className="mt-3 font-ui text-xs text-cortex-red">
                {patchMutation.error instanceof Error
                  ? patchMutation.error.message
                  : "Update failed"}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
            <h2 className="font-ui text-sm font-semibold text-cortex-text">Related findings</h2>
            {relatedQuery.isLoading ? (
              <p className="mt-3 font-ui text-sm text-cortex-muted">Loading…</p>
            ) : relatedFindings.length === 0 ? (
              <p className="mt-3 font-ui text-sm text-cortex-muted">No other open findings for this framework.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {relatedFindings.map((rf) => (
                  <li key={rf.id}>
                    <Link
                      to={`/findings/${encodeURIComponent(rf.id)}`}
                      className="font-ui text-sm text-cortex-blue hover:underline"
                    >
                      {rf.id}
                    </Link>
                    <p className="font-ui text-xs text-cortex-muted line-clamp-2">{rf.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
