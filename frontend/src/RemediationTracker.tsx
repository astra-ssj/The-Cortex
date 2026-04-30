/**
 * Remediation Tracker — programme management for findings.
 * Kanban columns (Open, In Progress, Remediated, Accepted), filters,
 * detail panel with owner/due date/actions/notes. Drag updates status.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  fetchFindings,
  updateFinding,
  type RemediationFinding,
  type FindingStatus,
  type UpdateFindingBody,
} from "./api/client";
import { useOrgContext } from "./hooks/useOrgContext";

const STATUSES: FindingStatus[] = ["OPEN", "IN_PROGRESS", "REMEDIATED", "ACCEPTED"];
const STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  REMEDIATED: "Remediated",
  ACCEPTED: "Accepted",
};
const SEVERITIES = ["All", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const FRAMEWORKS = [
  "All",
  "GDPR 2016/679",
  "NIS2 Directive",
  "EU AI Act 2024",
  "ISO/IEC 27001:2022",
  "NIST CSF 2.0",
  "CSA CCM v4",
  "Cyber Essentials v3.1",
  "EU Cybersecurity Act",
] as const;
const ENTITIES = ["All", "DE", "UK", "AU", "TH", "ES", "US"] as const;
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

const FRAMEWORK_ID_MAP: Record<string, string> = {
  "GDPR 2016/679": "gdpr-2016-679",
  "NIS2 Directive": "nis2-2022-2555",
  "EU AI Act 2024": "eu-ai-act-2024",
  "ISO/IEC 27001:2022": "iso27001-2022",
  "NIST CSF 2.0": "nist-csf-2.0",
  "CSA CCM v4": "csa-ccm-v4",
  "Cyber Essentials v3.1": "cyber-essentials-v3.1",
  "EU Cybersecurity Act": "eu-cybersecurity-act",
};

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

function statusColumnHeaderClass(status: FindingStatus): string {
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

function truncate(s: string, len: number): string {
  return s.length <= len ? s : s.slice(0, len - 3) + "…";
}

function isOverdue(dueDate: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function isDueWithinDays(dueDate: string, days: number): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

function dueDateClass(dueDate: string): string {
  if (isOverdue(dueDate)) return "text-cortex-red font-medium";
  if (isDueWithinDays(dueDate, 7)) return "text-cortex-amber";
  return "text-cortex-muted";
}

function progressPercent(f: RemediationFinding): number {
  const total = f.actions?.length || 1;
  const done = f.completed_actions?.length ?? 0;
  return Math.round((done / total) * 100);
}

export function RemediationTracker() {
  const { orgId } = useOrgContext();
  const [findings, setFindings] = useState<RemediationFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const [frameworkFilter, setFrameworkFilter] = useState<string>("All");
  const [entityFilter, setEntityFilter] = useState<string>("All");
  const [selectedFinding, setSelectedFinding] = useState<RemediationFinding | null>(null);
  const [detailOwner, setDetailOwner] = useState("");
  const [detailDueDate, setDetailDueDate] = useState("");
  const [detailStatus, setDetailStatus] = useState<FindingStatus>("OPEN");
  const [detailPriority, setDetailPriority] = useState<"P0" | "P1" | "P2">("P1");
  const [detailNotes, setDetailNotes] = useState("");
  const [detailCompletedActions, setDetailCompletedActions] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const loadFindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFindings({ org_id: orgId });
      setFindings(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadFindings();
  }, [loadFindings]);

  const filteredBySearch = useMemo(() => {
    let list = findings;
    if (statusFilter !== "All") {
      list = list.filter((f) => f.status === statusFilter);
    }
    if (severityFilter !== "All") {
      list = list.filter((f) => f.severity === severityFilter);
    }
    if (frameworkFilter !== "All") {
      const fid = FRAMEWORK_ID_MAP[frameworkFilter] ?? frameworkFilter;
      list = list.filter((f) => f.framework_id === fid);
    }
    if (entityFilter !== "All") {
      list = list.filter((f) => f.entity_code === entityFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q));
    }
    return list;
  }, [findings, search, statusFilter, severityFilter, frameworkFilter, entityFilter]);

  const findingsByStatus = useMemo(() => {
    const map: Record<FindingStatus, RemediationFinding[]> = {
      OPEN: [],
      IN_PROGRESS: [],
      REMEDIATED: [],
      ACCEPTED: [],
    };
    for (const f of filteredBySearch) {
      const s = f.status as FindingStatus;
      if (map[s]) map[s].push(f);
    }
    return map;
  }, [filteredBySearch]);

  const summary = useMemo(() => {
    const open = findings.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length;
    const critical = findings.filter((f) => f.severity === "CRITICAL" && f.status !== "REMEDIATED" && f.status !== "ACCEPTED").length;
    const overdue = findings.filter((f) => (f.status === "OPEN" || f.status === "IN_PROGRESS") && isOverdue(f.due_date)).length;
    const thisMonth = new Date();
    const firstDay = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
    const closedThisMonth = findings.filter(
      (f) => (f.status === "REMEDIATED" || f.status === "ACCEPTED") && f.due_date && new Date(f.due_date) >= firstDay
    ).length;
    return { totalOpen: open, critical, overdue, closedThisMonth };
  }, [findings]);

  const handleDragStart = (e: React.DragEvent, finding: RemediationFinding) => {
    setDraggedId(finding.id);
    e.dataTransfer.setData("application/json", JSON.stringify({ id: finding.id, status: finding.status }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent, toStatus: FindingStatus) => {
      e.preventDefault();
      setDraggedId(null);
      let data: { id: string; status: string };
      try {
        data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
      } catch {
        return;
      }
      if (!data.id || data.status === toStatus) return;
      try {
        const updated = await updateFinding(data.id, { status: toStatus });
        setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        if (selectedFinding?.id === updated.id) {
          setSelectedFinding(updated);
          setDetailStatus(updated.status as FindingStatus);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [selectedFinding]
  );

  const openDetail = (f: RemediationFinding) => {
    setSelectedFinding(f);
    setDetailOwner(f.owner);
    setDetailDueDate(f.due_date);
    setDetailStatus(f.status as FindingStatus);
    setDetailPriority((f.priority as "P0" | "P1" | "P2") || "P1");
    setDetailNotes("");
    setDetailCompletedActions(f.completed_actions ?? []);
  };

  const closeDetail = () => setSelectedFinding(null);

  const handleSaveChanges = async () => {
    if (!selectedFinding) return;
    setSaving(true);
    try {
      const body: UpdateFindingBody = {
        status: detailStatus,
        owner: detailOwner,
        due_date: detailDueDate,
        priority: detailPriority,
        completed_actions: detailCompletedActions,
      };
      const updated = await updateFinding(selectedFinding.id, body);
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFinding(updated);
      setDetailStatus(updated.status as FindingStatus);
      setDetailOwner(updated.owner);
      setDetailDueDate(updated.due_date);
      setDetailCompletedActions(updated.completed_actions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkRemediated = async () => {
    if (!selectedFinding) return;
    setSaving(true);
    try {
      const updated = await updateFinding(selectedFinding.id, { status: "REMEDIATED" });
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFinding(updated);
      setDetailStatus("REMEDIATED");
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedFinding || !detailNotes.trim()) return;
    const timestamp = new Date().toISOString();
    const newNotes = [...(selectedFinding.notes || []), { text: detailNotes.trim(), timestamp }];
    try {
      const updated = await updateFinding(selectedFinding.id, { notes: newNotes });
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFinding(updated);
      setDetailNotes("");
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const toggleActionComplete = (index: number) => {
    const next = detailCompletedActions.includes(index)
      ? detailCompletedActions.filter((i) => i !== index)
      : [...detailCompletedActions, index].sort((a, b) => a - b);
    setDetailCompletedActions(next);
  };

  if (loading && findings.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 font-ui text-cortex-muted">
        Loading findings…
      </div>
    );
  }

  if (error && findings.length === 0) {
    return (
      <div className="rounded-lg border border-cortex-red/50 bg-cortex-red/10 p-4 font-ui text-cortex-red">
        Failed to load findings: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-ui text-2xl font-semibold text-cortex-text">Remediation Tracker</h1>
        <p className="mt-1 font-ui text-sm text-cortex-muted">
          Active findings across AstraLabs Group — track owners, due dates and progress
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Total Open</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-red">{summary.totalOpen}</p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Critical</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-red">{summary.critical}</p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Overdue</p>
          <p className={`mt-1 font-data text-2xl font-bold ${summary.overdue ? "text-cortex-red animate-pulse" : "text-cortex-red"}`}>
            {summary.overdue}
          </p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Closed This Month</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-green">{summary.closedThisMonth}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-cortex-border bg-cortex-panel p-4">
        <input
          type="text"
          placeholder="Search by finding name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text placeholder:text-cortex-muted"
        />
        <span className="font-data text-xs uppercase tracking-wider text-cortex-muted">Status</span>
        <div className="flex gap-2">
          {["All", ...STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded px-3 py-1.5 font-ui text-sm ${statusFilter === s ? "bg-cortex-blue text-white" : "bg-cortex-surface text-cortex-muted hover:text-cortex-text"}`}
            >
              {s === "All" ? "All" : STATUS_LABELS[s as FindingStatus]}
            </button>
          ))}
        </div>
        <span className="font-data text-xs uppercase tracking-wider text-cortex-muted">Severity</span>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="font-data text-xs uppercase tracking-wider text-cortex-muted">Framework</span>
        <select
          value={frameworkFilter}
          onChange={(e) => setFrameworkFilter(e.target.value)}
          className="rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
        >
          {FRAMEWORKS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="font-data text-xs uppercase tracking-wider text-cortex-muted">Entity</span>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
        >
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-4 gap-4">
        {STATUSES.map((status) => (
          <div
            key={status}
            className="flex min-h-[400px] flex-col rounded-xl border border-cortex-border bg-cortex-panel"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div
              className={`rounded-t-xl border-b border-cortex-border px-4 py-3 font-data text-sm font-semibold uppercase tracking-wider ${statusColumnHeaderClass(status)}`}
            >
              {STATUS_LABELS[status]}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {findingsByStatus[status].map((f) => (
                <div
                  key={f.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, f)}
                  onClick={() => openDetail(f)}
                  className={`cursor-grab rounded-lg border border-cortex-border bg-cortex-surface p-3 transition hover:border-cortex-border active:cursor-grabbing ${draggedId === f.id ? "opacity-50" : ""}`}
                >
                  <span className={`rounded border px-2 py-0.5 font-data text-xs ${severityBadgeClass(f.severity)}`}>
                    {f.severity}
                  </span>
                  <p className="mt-2 font-ui text-sm font-medium text-cortex-text" title={f.title}>
                    {truncate(f.title, 50)}
                  </p>
                  <p className="mt-1 font-data text-xs text-cortex-muted">
                    {f.framework} · {f.control_id}
                  </p>
                  <p className="font-data text-xs text-cortex-muted">{f.reference}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-cortex-border flex items-center justify-center font-data text-xs text-cortex-muted">
                      {f.owner === "Unassigned" ? "?" : f.owner.slice(0, 1)}
                    </span>
                    <span className="font-ui text-xs text-cortex-muted">{f.owner}</span>
                  </div>
                  <p className={`mt-1 font-data text-xs ${dueDateClass(f.due_date)}`}>
                    Due: {f.due_date || "—"} {f.days_open != null ? ` · ${f.days_open}d open` : ""}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cortex-border">
                    <div
                      className="h-full rounded-full bg-cortex-blue transition-all"
                      style={{ width: `${progressPercent(f)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selectedFinding && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={closeDetail} aria-hidden />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-cortex-border bg-cortex-panel shadow-xl">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-ui text-lg font-semibold text-cortex-text">{selectedFinding.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded border px-2 py-0.5 font-data text-xs ${severityBadgeClass(selectedFinding.severity)}`}>
                      {selectedFinding.severity}
                    </span>
                    <span className="rounded border border-cortex-border px-2 py-0.5 font-data text-xs text-cortex-muted">
                      {selectedFinding.status}
                    </span>
                    <span className="font-data text-xs text-cortex-muted">{selectedFinding.days_open}d open</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded p-1 text-cortex-muted hover:bg-cortex-surface hover:text-cortex-text"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <section className="mt-6">
                <h3 className="font-data text-xs uppercase tracking-wider text-cortex-muted">Details</h3>
                <dl className="mt-2 space-y-1 font-ui text-sm">
                  <div>
                    <dt className="text-cortex-muted">Framework</dt>
                    <dd className="text-cortex-text">{selectedFinding.framework}</dd>
                  </div>
                  <div>
                    <dt className="text-cortex-muted">Control</dt>
                    <dd className="text-cortex-text">{selectedFinding.control_id} — {selectedFinding.control_name}</dd>
                  </div>
                  <div>
                    <dt className="text-cortex-muted">Regulatory reference</dt>
                    <dd className="text-cortex-text">{selectedFinding.reference}</dd>
                  </div>
                  <div>
                    <dt className="text-cortex-muted">Legal entity</dt>
                    <dd className="text-cortex-text">{selectedFinding.entity}</dd>
                  </div>
                  <div>
                    <dt className="text-cortex-muted">Current state</dt>
                    <dd className="text-cortex-text">{selectedFinding.current_state}</dd>
                  </div>
                  <div>
                    <dt className="text-cortex-muted">Required state</dt>
                    <dd className="text-cortex-text">{selectedFinding.required_state}</dd>
                  </div>
                </dl>
              </section>

              <section className="mt-6">
                <h3 className="font-data text-xs uppercase tracking-wider text-cortex-muted">Recommended Actions</h3>
                <ul className="mt-2 space-y-2">
                  {(selectedFinding.actions || []).map((action, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={detailCompletedActions.includes(i)}
                        onChange={() => toggleActionComplete(i)}
                        className="mt-1 rounded border-cortex-border"
                      />
                      <span className={detailCompletedActions.includes(i) ? "font-ui text-sm text-cortex-muted line-through" : "font-ui text-sm text-cortex-text"}>
                        {i + 1}. {action}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-6">
                <h3 className="font-data text-xs uppercase tracking-wider text-cortex-muted">Assignment</h3>
                <div className="mt-2 space-y-3">
                  <div>
                    <label className="block font-ui text-xs text-cortex-muted">Owner</label>
                    <select
                      value={detailOwner}
                      onChange={(e) => setDetailOwner(e.target.value)}
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
                    <label className="block font-ui text-xs text-cortex-muted">Due date</label>
                    <input
                      type="date"
                      value={detailDueDate}
                      onChange={(e) => setDetailDueDate(e.target.value)}
                      className="mt-1 w-full rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
                    />
                  </div>
                  <div>
                    <label className="block font-ui text-xs text-cortex-muted">Priority</label>
                    <select
                      value={detailPriority}
                      onChange={(e) => setDetailPriority(e.target.value as "P0" | "P1" | "P2")}
                      className="mt-1 w-full rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
                    >
                      <option value="P0">P0</option>
                      <option value="P1">P1</option>
                      <option value="P2">P2</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="mt-6">
                <h3 className="font-data text-xs uppercase tracking-wider text-cortex-muted">Notes</h3>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={detailNotes}
                    onChange={(e) => setDetailNotes(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                    placeholder="Add a note"
                    className="flex-1 rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text placeholder:text-cortex-muted"
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    className="rounded bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text hover:bg-cortex-border"
                  >
                    Add Note
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {(selectedFinding.notes || []).map((n, i) => (
                    <li key={i} className="rounded bg-cortex-surface px-2 py-1.5 font-ui text-xs text-cortex-muted">
                      {n.timestamp ? new Date(n.timestamp).toLocaleString() : ""} — {n.text}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-6">
                <h3 className="font-data text-xs uppercase tracking-wider text-cortex-muted">Status</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <select
                    value={detailStatus}
                    onChange={(e) => setDetailStatus(e.target.value as FindingStatus)}
                    className="rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    disabled={saving}
                    className="rounded bg-cortex-blue px-4 py-2 font-ui text-sm font-medium text-white hover:bg-cortex-blue/90 disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkRemediated}
                    disabled={saving || detailStatus === "REMEDIATED"}
                    className="rounded bg-cortex-green px-4 py-2 font-ui text-sm font-medium text-white hover:bg-cortex-green/90 disabled:opacity-50"
                  >
                    Mark Remediated
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
