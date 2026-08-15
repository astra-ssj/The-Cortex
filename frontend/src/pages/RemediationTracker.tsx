/**
 * Remediation Tracker — programme management for findings.
 * Kanban columns (Open, In Progress, Remediated, Accepted), filters,
 * detail panel with owner/due date/actions/notes. Drag updates status.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  fetchFindings,
  updateFinding,
  type RemediationFinding,
  type FindingStatus,
  type UpdateFindingBody,
} from "../api/client";
import { useOrgContext } from "../hooks/useOrgContext";
import { useRole } from "../hooks/useRole";
import {
  FRAMEWORK_FILTER_OPTIONS,
  frameworkIdFromFilterLabel,
  type FrameworkFilterOption,
} from "../lib/frameworkRegistry";
import { invalidateComplianceData } from "../store/complianceStore";
import { RemediationEmpty } from "../components/ui/EmptyState";

const STATUSES: FindingStatus[] = ["OPEN", "IN_PROGRESS", "REMEDIATED", "ACCEPTED"];
const STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  REMEDIATED: "Remediated",
  ACCEPTED: "Accepted",
};
const SEVERITIES = ["All", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
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

// Competency-derived gaps carry no due date — a learner sets their own pace — so
// every date helper has to treat null as "not scheduled" rather than as overdue.
function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function isDueWithinDays(dueDate: string | null, days: number): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

function dueDateClass(dueDate: string | null): string {
  if (isOverdue(dueDate)) return "text-cortex-red font-medium";
  if (isDueWithinDays(dueDate, 7)) return "text-cortex-amber";
  return "text-cortex-muted";
}

/** True when only a retake can close this gap. */
function isCompetencyGap(f: RemediationFinding): boolean {
  return f.source === "competency" && Boolean(f.scenario_slug);
}

/** Deep link that starts the scenario which raised the gap. */
function retakePath(f: RemediationFinding): string {
  const params = new URLSearchParams({ scenario: String(f.scenario_slug), gap: f.id });
  return `/learning?${params.toString()}`;
}

const DIMENSION_LABELS: Record<string, string> = {
  control_mapping: "Control Mapping",
  evidence: "Evidence Quality",
  escalation: "Escalation Judgment",
  remediation: "Remediation",
};

function dimensionLabel(dimension: string | null): string {
  if (!dimension) return "—";
  return DIMENSION_LABELS[dimension] ?? dimension;
}

function retakeRequiredMessage(f: RemediationFinding): string {
  return `${dimensionLabel(f.dimension)} scored ${f.competency_score ?? "below the floor"} on this scenario. Retake it and score above the floor to close this gap — marking it done by hand would make the competency claim self-certified.`;
}

function progressPercent(f: RemediationFinding): number {
  const total = f.actions?.length || 1;
  const done = f.completed_actions?.length ?? 0;
  return Math.round((done / total) * 100);
}

const GAP_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const GAP_PANEL: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
const GAP_ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px 128px minmax(140px, 1.4fr) 120px 88px 72px 110px 108px",
  gap: 12,
  alignItems: "center",
  width: "100%",
  padding: "10px 16px",
  border: "none",
  borderBottom: "1px solid var(--border)",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  color: "var(--text)",
};
const GAP_FILTER = "rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text";
const GAP_LABEL = "font-data text-xs uppercase tracking-wider text-cortex-muted";

type ControlGapsViewProps = {
  findings: RemediationFinding[];
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  severityFilter: string;
  setSeverityFilter: React.Dispatch<React.SetStateAction<string>>;
  frameworkFilter: FrameworkFilterOption;
  setFrameworkFilter: React.Dispatch<React.SetStateAction<FrameworkFilterOption>>;
  entityFilter: string;
  setEntityFilter: React.Dispatch<React.SetStateAction<string>>;
  pageTitle: string;
  pageSubtitle: string;
  navigate: ReturnType<typeof useNavigate>;
  canRunAssessment: boolean;
};

function ControlGapsView({
  findings, search, setSearch, severityFilter, setSeverityFilter,
  frameworkFilter, setFrameworkFilter, entityFilter, setEntityFilter,
  pageTitle, pageSubtitle, navigate, canRunAssessment,
}: ControlGapsViewProps) {
  const list = useMemo(() => {
    let next = findings;
    if (severityFilter !== "All") next = next.filter((f) => f.severity === severityFilter);
    if (frameworkFilter !== "All") {
      const fid = frameworkIdFromFilterLabel(frameworkFilter) ?? frameworkFilter;
      next = next.filter((f) => f.framework_id === fid);
    }
    if (entityFilter !== "All") next = next.filter((f) => f.entity_code === entityFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      next = next.filter((f) => f.title.toLowerCase().includes(q));
    }
    return next;
  }, [findings, search, severityFilter, frameworkFilter, entityFilter]);

  const groups = GAP_SEVERITIES.map((severity) => ({
    severity,
    items: list.filter((f) => f.severity === severity),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 className="font-ui text-2xl font-semibold text-cortex-text">{pageTitle}</h1>
        <p className="mt-1 font-ui text-sm text-cortex-muted">{pageSubtitle}</p>
      </div>
      <div style={{ ...GAP_PANEL, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: 16 }}>
        <input
          type="text"
          placeholder="Search by finding name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text placeholder:text-cortex-muted"
        />
        <span className={GAP_LABEL}>Severity</span>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className={GAP_FILTER}>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className={GAP_LABEL}>Framework</span>
        <select value={frameworkFilter} onChange={(e) => setFrameworkFilter(e.target.value as FrameworkFilterOption)} className={GAP_FILTER}>
          {FRAMEWORK_FILTER_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className={GAP_LABEL}>Entity</span>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className={GAP_FILTER}>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      {list.length === 0 ? (
        <div style={GAP_PANEL}>
          <RemediationEmpty
            onViewFindings={() => navigate("/review-queue")}
            onRunAssessment={canRunAssessment ? () => navigate("/onboarding") : undefined}
          />
        </div>
      ) : groups.map(({ severity, items }) => (
        <div key={severity} style={{ ...GAP_PANEL, overflow: "hidden" }}>
          <div
            className={`px-4 py-3 font-data text-sm font-semibold uppercase tracking-wider ${severityBadgeClass(severity)}`}
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            {severity} · {items.length}
          </div>
          {items.map((f) => (
            <button key={f.id} type="button" onClick={() => navigate(`/findings/${encodeURIComponent(f.id)}`)} style={GAP_ROW}>
              <span className={`rounded border px-2 py-0.5 font-data text-xs ${severityBadgeClass(f.severity)}`}>{f.severity}</span>
              <span className="font-data text-xs text-cortex-blue">{f.id}</span>
              <span className="font-ui text-sm font-medium text-cortex-text" title={f.title}>{truncate(f.title, 72)}</span>
              <span className="font-data text-xs text-cortex-muted">{f.framework}</span>
              <span className="font-data text-xs text-cortex-muted">{f.control_id}</span>
              <span className="font-data text-xs text-cortex-muted" title={f.entity}>
                {isCompetencyGap(f) ? dimensionLabel(f.dimension) : f.entity}
              </span>
              <span className="font-ui text-xs text-cortex-muted">{f.owner}</span>
              {/* A competency gap has no due date; naming the exit condition is more
                  use to the learner than an em dash. */}
              {isCompetencyGap(f) ? (
                <span className="font-data text-xs text-cortex-blue">Retake to close</span>
              ) : (
                <span className={`font-data text-xs ${dueDateClass(f.due_date)}`}>
                  {f.due_date || "—"}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function RemediationTracker() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isControlGaps = pathname === "/findings";
  const pageTitle = isControlGaps ? "Control Gaps" : "Remediation Tracker";
  const pageSubtitle = isControlGaps
    ? "Active control gaps identified across your organisation. As you complete scenarios in the Learning Loop, your decisions surface findings like these."
    : "Track owners, due dates and progress for each active finding.";
  const { orgId } = useOrgContext();
  const { can } = useRole();
  const canEditFindings = can("canEditFindings");
  const [findings, setFindings] = useState<RemediationFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const [frameworkFilter, setFrameworkFilter] = useState<FrameworkFilterOption>("All");
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
  // A refused close is guidance, not a failure: it names the scenario to retake.
  // Kept out of `error`, which renders as a red banner over the whole board.
  const [blockedClose, setBlockedClose] = useState<{ id: string; message: string } | null>(null);

  const loadFindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFindings({ org_id: orgId });
      setFindings(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadFindings();
  }, [loadFindings]);

  const bumpComplianceCaches = useCallback(() => {
    invalidateComplianceData(queryClient, orgId);
  }, [queryClient, orgId]);

  const filteredBySearch = useMemo(() => {
    let list = findings;
    if (statusFilter !== "All") {
      list = list.filter((f) => f.status === statusFilter);
    }
    if (severityFilter !== "All") {
      list = list.filter((f) => f.severity === severityFilter);
    }
    if (frameworkFilter !== "All") {
      const fid = frameworkIdFromFilterLabel(frameworkFilter) ?? frameworkFilter;
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
      if (!canEditFindings) return;
      setDraggedId(null);
      let data: { id: string; status: string };
      try {
        data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
      } catch {
        return;
      }
      if (!data.id || data.status === toStatus) return;

      // Refuse locally as well as server-side. The API returns 409, but dropping a
      // card and watching it snap back with an error is a worse explanation than
      // not letting go of it in the first place.
      const dragged = findings.find((f) => f.id === data.id);
      if (toStatus === "REMEDIATED" && dragged && isCompetencyGap(dragged)) {
        setBlockedClose({
          id: dragged.id,
          message: `${dimensionLabel(dragged.dimension)} is proven by retaking the scenario, not by moving a card. Open the gap to retake it.`,
        });
        return;
      }

      try {
        const updated = await updateFinding(data.id, { status: toStatus });
        bumpComplianceCaches();
        setBlockedClose(null);
        setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        if (selectedFinding?.id === updated.id) {
          setSelectedFinding(updated);
          setDetailStatus(updated.status as FindingStatus);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [findings, selectedFinding, bumpComplianceCaches, canEditFindings]
  );

  const openDetail = (f: RemediationFinding) => {
    setSelectedFinding(f);
    setBlockedClose(null);
    setDetailOwner(f.owner);
    setDetailDueDate(f.due_date ?? "");
    setDetailStatus(f.status as FindingStatus);
    setDetailPriority((f.priority as "P0" | "P1" | "P2") || "P1");
    setDetailNotes("");
    setDetailCompletedActions(f.completed_actions ?? []);
  };

  const closeDetail = () => setSelectedFinding(null);

  const handleSaveChanges = async () => {
    if (!selectedFinding) return;
    if (detailStatus === "REMEDIATED" && isCompetencyGap(selectedFinding)) {
      setBlockedClose({ id: selectedFinding.id, message: retakeRequiredMessage(selectedFinding) });
      return;
    }
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
      bumpComplianceCaches();
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setSelectedFinding(updated);
      setDetailStatus(updated.status as FindingStatus);
      setDetailOwner(updated.owner);
      setDetailDueDate(updated.due_date ?? "");
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
      bumpComplianceCaches();
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
      bumpComplianceCaches();
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

  if (!loading && findings.length === 0) {
    return (
      <div style={{ padding: "28px" }}>
        <div className="mb-6">
          <h1 className="font-ui text-2xl font-semibold text-cortex-text">{pageTitle}</h1>
          <p className="mt-1 font-ui text-sm text-cortex-muted">
            {pageSubtitle}
          </p>
        </div>
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
          }}
        >
          <RemediationEmpty
            onViewFindings={() => navigate("/review-queue")}
            onRunAssessment={
              can("canRunAssessment") ? () => navigate("/onboarding") : undefined
            }
          />
        </div>
      </div>
    );
  }

  if (isControlGaps) {
    return (
      <ControlGapsView
        findings={findings}
        search={search}
        setSearch={setSearch}
        severityFilter={severityFilter}
        setSeverityFilter={setSeverityFilter}
        frameworkFilter={frameworkFilter}
        setFrameworkFilter={setFrameworkFilter}
        entityFilter={entityFilter}
        setEntityFilter={setEntityFilter}
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
        navigate={navigate}
        canRunAssessment={can("canRunAssessment")}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — Control Gaps at /findings, Remediation Tracker at /remediation */}
      <div>
        <h1 className="font-ui text-2xl font-semibold text-cortex-text">{pageTitle}</h1>
        <p className="mt-1 font-ui text-sm text-cortex-muted">
          {pageSubtitle}
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
          onChange={(e) => setFrameworkFilter(e.target.value as FrameworkFilterOption)}
          className="rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
        >
          {FRAMEWORK_FILTER_OPTIONS.map((f) => (
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

      {blockedClose && !selectedFinding && (
        <p
          role="status"
          className="rounded-lg border border-cortex-amber/40 bg-cortex-amber/10 p-3 font-ui text-sm text-cortex-amber"
        >
          {blockedClose.message}
        </p>
      )}

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
                  draggable={canEditFindings}
                  onDragStart={canEditFindings ? (e) => handleDragStart(e, f) : undefined}
                  onClick={() => openDetail(f)}
                  className={`${canEditFindings ? "cursor-grab active:cursor-grabbing" : "cursor-default"} rounded-lg border border-cortex-border bg-cortex-surface p-3 transition hover:border-cortex-border ${draggedId === f.id ? "opacity-50" : ""}`}
                >
                  <span className={`rounded border px-2 py-0.5 font-data text-xs ${severityBadgeClass(f.severity)}`}>
                    {f.severity}
                  </span>
                  <p className="mt-1 font-data text-xs">
                    <Link
                      to={`/findings/${encodeURIComponent(f.id)}`}
                      className="text-cortex-blue hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {f.id}
                    </Link>
                  </p>
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
                  {isCompetencyGap(f) ? (
                    <p className="mt-1 font-data text-xs text-cortex-blue">
                      Retake to close · {f.days_open}d open
                    </p>
                  ) : (
                    <p className={`mt-1 font-data text-xs ${dueDateClass(f.due_date)}`}>
                      Due: {f.due_date || "—"}
                      {f.days_open != null ? ` · ${f.days_open}d open` : ""}
                    </p>
                  )}
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
                  <p className="mt-1 font-data text-xs">
                    <Link
                      to={`/findings/${encodeURIComponent(selectedFinding.id)}`}
                      className="text-cortex-blue hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {selectedFinding.id}
                    </Link>
                  </p>
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

              {isCompetencyGap(selectedFinding) && (
                <section className="mt-6 rounded-lg border border-cortex-blue/40 bg-cortex-blue/10 p-4">
                  <h3 className="font-data text-xs uppercase tracking-wider text-cortex-blue">
                    Raised by your own decisions
                  </h3>
                  <p className="mt-2 font-ui text-sm text-cortex-text">
                    {dimensionLabel(selectedFinding.dimension)} scored{" "}
                    <strong>{selectedFinding.competency_score ?? "—"}</strong> when you finished{" "}
                    <strong>{selectedFinding.scenario_slug}</strong>. This gap closes when you retake
                    that scenario and lift the dimension back over the floor.
                  </p>
                  {selectedFinding.controls.length > 0 && (
                    <p className="mt-2 font-data text-xs text-cortex-muted">
                      Controls touched: {selectedFinding.controls.join(", ")}
                    </p>
                  )}
                  <Link
                    to={retakePath(selectedFinding)}
                    className="mt-3 inline-block rounded bg-cortex-blue px-4 py-2 font-ui text-sm font-medium text-white hover:bg-cortex-blue/90"
                  >
                    Retake scenario →
                  </Link>
                </section>
              )}

              {blockedClose?.id === selectedFinding.id && (
                <p
                  role="status"
                  className="mt-4 rounded-lg border border-cortex-amber/40 bg-cortex-amber/10 p-3 font-ui text-sm text-cortex-amber"
                >
                  {blockedClose.message}
                </p>
              )}

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
                        disabled={!canEditFindings}
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
                      disabled={!canEditFindings}
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
                      disabled={!canEditFindings}
                      onChange={(e) => setDetailDueDate(e.target.value)}
                      className="mt-1 w-full rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text"
                    />
                  </div>
                  <div>
                    <label className="block font-ui text-xs text-cortex-muted">Priority</label>
                    <select
                      value={detailPriority}
                      disabled={!canEditFindings}
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
                    disabled={!canEditFindings}
                    onChange={(e) => setDetailNotes(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && canEditFindings && handleAddNote()}
                    placeholder="Add a note"
                    className="flex-1 rounded border border-cortex-border bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text placeholder:text-cortex-muted"
                  />
                  <button
                    type="button"
                    disabled={!canEditFindings}
                    onClick={handleAddNote}
                    className="rounded bg-cortex-surface px-3 py-1.5 font-ui text-sm text-cortex-text hover:bg-cortex-border disabled:opacity-50"
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
                    aria-label="Finding status"
                    value={detailStatus}
                    disabled={!canEditFindings}
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
                    disabled={!canEditFindings || saving}
                    className="rounded bg-cortex-blue px-4 py-2 font-ui text-sm font-medium text-white hover:bg-cortex-blue/90 disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                  {isCompetencyGap(selectedFinding) ? (
                    <Link
                      to={retakePath(selectedFinding)}
                      className="rounded bg-cortex-green px-4 py-2 font-ui text-sm font-medium text-white hover:bg-cortex-green/90"
                    >
                      Retake to close →
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={handleMarkRemediated}
                      disabled={!canEditFindings || saving || detailStatus === "REMEDIATED"}
                      className="rounded bg-cortex-green px-4 py-2 font-ui text-sm font-medium text-white hover:bg-cortex-green/90 disabled:opacity-50"
                    >
                      Mark Remediated
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
