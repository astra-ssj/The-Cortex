import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FrameworkSummary } from "../api/frameworks";
import {
  riskBadgeVariant,
  riskCompare,
  scoreRingStroke,
  statusBadgeVariant,
  statusCompare,
} from "../complianceDashboardUtils";
import { Badge, Button, Select, Table, Tooltip } from "../components/ui";
import type { TableColumn } from "../components/ui/Table";
import { useOrgContext } from "../hooks/useOrgContext";
import { useFrameworks } from "../hooks/useFrameworks";
import { useRole } from "../hooks/useRole";
import { useAssessmentStream, useCompliancePosture } from "../store/complianceStore";
import type { FrameworkPosture } from "../types/compliance";

type StatusFilter = "all" | "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";

type SortKey =
  | "name"
  | "score"
  | "status"
  | "risk"
  | "controls"
  | "gaps"
  | "trend"
  | "jurisdiction"
  | "lastAssessed";

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name" },
  { key: "score", label: "Score", align: "right" },
  { key: "status", label: "Status" },
  { key: "risk", label: "Risk" },
  { key: "controls", label: "Controls", align: "right" },
  { key: "gaps", label: "Gaps", align: "right" },
  { key: "trend", label: "Trend", align: "right" },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "lastAssessed", label: "Last Assessed" },
  { key: "actions", label: "Actions", align: "right", sortable: false },
];

function MiniScoreRing({ score }: { score: number }) {
  const stroke = scoreRingStroke(score);
  return (
    <Tooltip content={`${score}% posture`} position="top">
      <div
        className="relative flex shrink-0 items-center justify-center"
        style={{ width: 40, height: 40 }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90" aria-hidden>
          <circle cx="20" cy="20" r="16" fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke={stroke}
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
    </Tooltip>
  );
}

function formatLastAssessed(raw?: string): string {
  if (raw === undefined || raw === "") return "—";
  const d = Date.parse(raw);
  if (Number.isNaN(d)) return raw;
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function trendDisplay(trend?: number): { text: string; tone: "up" | "down" | "flat" | "none" } {
  if (typeof trend !== "number") return { text: "—", tone: "none" };
  if (trend === 0) return { text: "0", tone: "flat" };
  const arrow = trend > 0 ? "↑" : "↓";
  return {
    text: `${arrow} ${Math.abs(trend)}`,
    tone: trend > 0 ? "up" : "down",
  };
}

function sortRows(
  list: FrameworkSummary[],
  postureByFrameworkId: Map<string, FrameworkPosture> | null,
  sortKey: SortKey,
  sortDir: "asc" | "desc",
): FrameworkSummary[] {
  const mult = sortDir === "asc" ? 1 : -1;
  const out = [...list];
  out.sort((a, b) => {
    const pa = postureByFrameworkId?.get(a.id);
    const pb = postureByFrameworkId?.get(b.id);
    switch (sortKey) {
      case "name":
        return mult * a.name.localeCompare(b.name);
      case "score":
        return mult * ((pa?.score ?? -1) - (pb?.score ?? -1));
      case "status":
        return mult * statusCompare(pa?.status, pb?.status);
      case "risk":
        return mult * riskCompare(pa?.riskLevel, pb?.riskLevel);
      case "controls":
        return mult * (a.control_count - b.control_count);
      case "gaps":
        return mult * ((pa?.gapCount ?? -1) - (pb?.gapCount ?? -1));
      case "trend":
        return mult * ((pa?.trend ?? -999) - (pb?.trend ?? -999));
      case "jurisdiction": {
        const ja = pa?.jurisdiction ?? a.jurisdiction;
        const jb = pb?.jurisdiction ?? b.jurisdiction;
        return mult * ja.localeCompare(jb);
      }
      case "lastAssessed":
        // Posture exposes org-level assessment time; all rows share one timestamp — secondary sort by name.
        return mult * a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });
  return out;
}

export function FrameworksList() {
  const navigate = useNavigate();
  const { orgId } = useOrgContext();
  const { can } = useRole();
  const canRunAssessment = can("canRunAssessment");
  const { isStreaming, startStream } = useAssessmentStream();
  const { data: frameworks, isLoading, error } = useFrameworks();
  const { data: posture, isLoading: postureLoading } = useCompliancePosture(orgId);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const postureByFrameworkId = posture
    ? new Map(posture.frameworks.map((f) => [f.frameworkId, f]))
    : null;

  const jurisdictionOptions = useMemo(() => {
    const set = new Set<string>();
    frameworks?.forEach((fw) => {
      const p = postureByFrameworkId?.get(fw.id);
      set.add(p?.jurisdiction ?? fw.jurisdiction);
    });
    return [
      { value: "all", label: "All" },
      ...Array.from(set)
        .sort((x, y) => x.localeCompare(y))
        .map((j) => ({ value: j, label: j })),
    ];
  }, [frameworks, postureByFrameworkId]);

  const lastAssessedRaw = posture?.lastAssessed ?? posture?.updatedAt;

  const filtered = useMemo(() => {
    if (!frameworks?.length) return [];
    return frameworks.filter((fw) => {
      const p = postureByFrameworkId?.get(fw.id);
      if (statusFilter !== "all") {
        if (p?.status !== statusFilter) return false;
      }
      if (jurisdictionFilter !== "all") {
        const jur = p?.jurisdiction ?? fw.jurisdiction;
        if (jur !== jurisdictionFilter) return false;
      }
      return true;
    });
  }, [frameworks, postureByFrameworkId, statusFilter, jurisdictionFilter]);

  const sortedFrameworks = useMemo(
    () => sortRows(filtered, postureByFrameworkId, sortKey, sortDir),
    [filtered, postureByFrameworkId, sortKey, sortDir],
  );

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key as SortKey);
      setSortDir("asc");
    }
  }

  if (isLoading || postureLoading) {
    return (
      <div style={{ padding: "28px", background: "var(--shell)", color: "var(--text)" }}>
        <h1 className="cortex-text-page-title">Frameworks</h1>
        <p className="cortex-text-caption mt-2">Loading frameworks…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "28px", background: "var(--shell)", color: "var(--text)" }}>
        <h1 className="cortex-text-page-title">Frameworks</h1>
        <p className="mt-2 text-sm text-cortex-red">
          {error instanceof Error ? error.message : "Failed to load frameworks"}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px", background: "var(--shell)", color: "var(--text)" }}>
      <h1 className="cortex-text-page-title">Frameworks</h1>
      <p className="cortex-text-caption mt-2 max-w-2xl">
        Sortable register of registered frameworks and live posture. Select a row to open detail.
      </p>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full min-w-[180px] max-w-xs">
          <Select
            label="Status"
            selectSize="sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            options={[
              { value: "all", label: "All" },
              { value: "COMPLIANT", label: "Compliant" },
              { value: "PARTIAL", label: "Partial" },
              { value: "NON_COMPLIANT", label: "Failing" },
            ]}
          />
        </div>
        <div className="w-full min-w-[180px] max-w-xs">
          <Select
            label="Jurisdiction"
            selectSize="sm"
            value={jurisdictionFilter}
            onChange={(e) => setJurisdictionFilter(e.target.value)}
            options={jurisdictionOptions}
          />
        </div>
      </div>

      <div className="mt-6">
        <Table>
          <Table.Header
            columns={COLUMNS}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <tbody>
            {sortedFrameworks.map((fw) => {
              const postureEntry = postureByFrameworkId?.get(fw.id);
              const score = postureEntry?.score;
              const tr = trendDisplay(postureEntry?.trend);
              return (
                <Table.Row
                  key={fw.id}
                  onClick={() => navigate(`/frameworks/${encodeURIComponent(fw.id)}`)}
                  aria-label={`Open framework ${fw.name}`}
                >
                  <Table.Cell>
                    <div className="min-w-0">
                      <p className="font-semibold" style={{ color: "var(--text)" }}>
                        {fw.name}
                      </p>
                      <p className="mt-0.5 text-xs text-cortex-text-ter">v{fw.version}</p>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {typeof score === "number" ? (
                      <div className="inline-flex justify-end">
                        <MiniScoreRing score={score} />
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-quiet)" }}>—</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {postureEntry?.status != null ? (
                      <Badge variant={statusBadgeVariant(postureEntry.status)} size="xs">
                        {postureEntry.status}
                      </Badge>
                    ) : (
                      <span style={{ color: "var(--text-quiet)" }}>—</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {postureEntry?.riskLevel != null ? (
                      <Badge variant={riskBadgeVariant(postureEntry.riskLevel)} size="xs">
                        {postureEntry.riskLevel}
                      </Badge>
                    ) : (
                      <span style={{ color: "var(--text-quiet)" }}>—</span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right" style={{ color: "var(--text-secondary)" }}>
                    {fw.control_count}
                  </Table.Cell>
                  <Table.Cell className="text-right" style={{ color: "var(--text-secondary)" }}>
                    {typeof postureEntry?.gapCount === "number" ? postureEntry.gapCount : "—"}
                  </Table.Cell>
                  <Table.Cell
                    className="text-right font-medium"
                    style={{
                      color:
                        tr.tone === "up"
                          ? "var(--green)"
                          : tr.tone === "down"
                            ? "var(--red)"
                            : tr.tone === "flat"
                              ? "var(--text-secondary)"
                              : "var(--text-quiet)",
                    }}
                  >
                    {tr.text}
                  </Table.Cell>
                  <Table.Cell style={{ color: "var(--text-secondary)" }}>
                    {postureEntry?.jurisdiction ?? fw.jurisdiction}
                  </Table.Cell>
                  <Table.Cell style={{ color: "var(--text-secondary)" }}>
                    {formatLastAssessed(lastAssessedRaw)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isStreaming || !canRunAssessment}
                      title={!canRunAssessment ? "Admin or Analyst required" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        startStream(orgId, [fw.id]);
                        navigate("/dashboard");
                      }}
                    >
                      Run
                    </Button>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </tbody>
        </Table>
        {sortedFrameworks.length === 0 ? (
          <p className="mt-4 text-sm text-cortex-text-ter">
            No frameworks match the current filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
