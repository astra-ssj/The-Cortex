import type { FrameworkSummary } from "../api/frameworks";
import type { FrameworkPosture } from "../types/compliance";
import { riskBadgeVariant, scoreRingStroke, statusBadgeVariant } from "../lib/complianceDashboardUtils";
import { Badge, Table, Tooltip } from "./ui";
import type { TableColumn } from "./ui/Table";

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

export interface FrameworkComplianceTableProps {
  columns: TableColumn[];
  sortedFrameworks: FrameworkSummary[];
  postureByFrameworkId: Map<string, FrameworkPosture> | null;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onOpenFramework: (id: string) => void;
}

export function FrameworkComplianceTable({
  columns,
  sortedFrameworks,
  postureByFrameworkId,
  sortKey,
  sortDir,
  onSort,
  onOpenFramework,
}: FrameworkComplianceTableProps) {
  return (
    <Table>
      <Table.Header columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <tbody>
        {sortedFrameworks.map((fw) => {
          const postureEntry = postureByFrameworkId?.get(fw.id);
          const score = postureEntry?.score;
          return (
            <Table.Row
              key={fw.id}
              onClick={() => onOpenFramework(fw.id)}
              aria-label={`Open framework ${fw.name}`}
            >
              <Table.Cell>
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>
                    {fw.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(fw.purpose_tags ?? []).map((tag) => (
                      <Badge
                        key={tag}
                        variant="neutral"
                        size="xs"
                        className="normal-case font-normal tracking-normal"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Table.Cell>
              <Table.Cell style={{ color: "var(--text-secondary)" }}>
                v{fw.version} · {postureEntry?.jurisdiction ?? fw.jurisdiction}
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
              <Table.Cell className="text-right" style={{ color: "var(--text-secondary)" }}>
                {fw.control_count} control{fw.control_count !== 1 ? "s" : ""}
                {typeof postureEntry?.gapCount === "number" ? (
                  <span style={{ color: "var(--text-quiet)" }}> · {postureEntry.gapCount} gaps</span>
                ) : null}
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
              <Table.Cell>
                {postureEntry?.status != null ? (
                  <Badge variant={statusBadgeVariant(postureEntry.status)} size="xs">
                    {postureEntry.status}
                  </Badge>
                ) : (
                  <span style={{ color: "var(--text-quiet)" }}>—</span>
                )}
              </Table.Cell>
            </Table.Row>
          );
        })}
      </tbody>
    </Table>
  );
}
