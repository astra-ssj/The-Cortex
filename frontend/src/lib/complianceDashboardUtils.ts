import type { AssessmentEvent, FrameworkPosture } from "../types/compliance";
import type { BadgeVariant } from "../components/ui/Badge";
import type { TableColumn } from "../components/ui/Table";

export type FrameworkSortKey =
  | "name"
  | "jurisdiction"
  | "score"
  | "controls"
  | "risk"
  | "status";

export type DisplayType =
  | "start"
  | "fw_start"
  | "fw_done"
  | "control"
  | "review"
  | "complete"
  | "error";

export const FRAMEWORK_TABLE_COLUMNS: TableColumn[] = [
  { key: "name", label: "Framework" },
  { key: "jurisdiction", label: "Scope" },
  { key: "score", label: "Score", align: "right" },
  { key: "controls", label: "Controls", align: "right" },
  { key: "risk", label: "Risk" },
  { key: "status", label: "Status" },
];

export const RISK_SORT_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NOT_ASSESSED: 4,
};

export function scoreRingStroke(score: number): string {
  if (score >= 70) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

export function riskBadgeVariant(risk: string): BadgeVariant {
  switch (risk) {
    case "CRITICAL":
      return "danger";
    case "HIGH":
      return "warning";
    case "MEDIUM":
      return "info";
    case "LOW":
      return "success";
    case "NOT_ASSESSED":
      return "neutral";
    default:
      return "neutral";
  }
}

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "NON_COMPLIANT":
      return "danger";
    case "PARTIAL":
      return "warning";
    case "COMPLIANT":
      return "success";
    default:
      return "neutral";
  }
}

export function riskCompare(a?: string, b?: string): number {
  const ao = a !== undefined ? (RISK_SORT_ORDER[a] ?? 99) : 99;
  const bo = b !== undefined ? (RISK_SORT_ORDER[b] ?? 99) : 99;
  return ao - bo;
}

export function statusCompare(
  a?: FrameworkPosture["status"],
  b?: FrameworkPosture["status"],
): number {
  const rank = (s?: FrameworkPosture["status"]) =>
    s === "NON_COMPLIANT" ? 0 : s === "PARTIAL" ? 1 : s === "COMPLIANT" ? 2 : 3;
  return rank(a) - rank(b);
}

export function eventDisplay(e: AssessmentEvent): { type: DisplayType; message: string } {
  switch (e.kind) {
    case "run_start":
      return {
        type: "start",
        message: `Run started (${(e as { frameworkIds?: string[] }).frameworkIds?.length ?? 0} frameworks)`,
      };
    case "framework_start":
      return {
        type: "fw_start",
        message: `Framework: ${(e as { frameworkName: string }).frameworkName} (${(e as { frameworkId: string }).frameworkId})`,
      };
    case "framework_done":
      return { type: "fw_done", message: `Done: ${(e as { frameworkId: string }).frameworkId}` };
    case "control_context":
      return { type: "control", message: `Context: ${(e as { controlId: string }).controlId}` };
    case "control_result": {
      const r = e as { controlId: string; controlName: string; status: string; finding?: string };
      return {
        type: "control",
        message: `${r.controlName} — ${r.status}${r.finding ? `: ${r.finding.slice(0, 60)}…` : ""}`,
      };
    }
    case "run_done":
      return { type: "complete", message: "Assessment complete" };
    case "error":
      return { type: "error", message: (e as { message: string }).message };
    default:
      return { type: "error", message: `Unknown event: ${(e as { kind: string }).kind}` };
  }
}

export function streamEventColor(
  type: DisplayType,
): "var(--green)" | "var(--amber)" | "var(--red)" | "var(--blue)" | "var(--text-secondary)" {
  if (type === "complete") return "var(--green)";
  if (type === "review") return "var(--amber)";
  if (type === "error") return "var(--red)";
  if (type === "fw_start") return "var(--blue)";
  return "var(--text-secondary)";
}
