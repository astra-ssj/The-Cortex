/**
 * Compliance posture types. Must match API response shape (api/schemas.py).
 */

export type ControlPostureStatus =
  | "compliant"
  | "partial"
  | "non_compliant"
  | "not_assessed";

export interface ControlPosture {
  controlId: string;
  controlName: string;
  status: ControlPostureStatus;
  lastAssessedAt?: string;
  findingSummary?: string;
}

export interface FrameworkPosture {
  frameworkId: string;
  frameworkName: string;
  controlCount: number;
  controls: ControlPosture[];
  /** From API: framework-level score (0–100). Used when no controls array. */
  score?: number;
  /** From API: number of gaps. */
  gapCount?: number;
  /** From API: PARTIAL | COMPLIANT | NON_COMPLIANT. */
  status?: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
  /** From API: CRITICAL | HIGH | MEDIUM | LOW. */
  riskLevel?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  /** From API: trend value. */
  trend?: number;
}

export interface CompliancePosture {
  organisationId: string;
  organisationName: string;
  frameworks: FrameworkPosture[];
  updatedAt: string;
  /** From API: overall posture percentage. */
  overallScore?: number;
  /** From API: audit readiness percentage. */
  auditReadiness?: number;
  /** From API: last assessed timestamp. */
  lastAssessed?: string;
}

// ---- ZTAIP system status (GET /api/v1/system/ztaip-status) ----

export interface AuditFabricStatus {
  totalEvents: number;
  lastEventAt: string | null;
}

export interface ZTAIPStatus {
  auditFabric: AuditFabricStatus;
  circuitBreakersCount: number;
  humanReviewQueueCount: number;
  sovereigntyBroker: "active" | "degraded" | "unavailable";
  agentCertificatesCount: number;
}

// ---- Assessment SSE stream (event type = kind, data = payload) ----

export type AssessmentEventKind =
  | "run_start"
  | "framework_start"
  | "control_context"
  | "control_result"
  | "framework_done"
  | "run_done"
  | "error";

export interface AssessmentEventRunStart {
  kind: "run_start";
  runId: string;
  organizationId: string;
  frameworkIds: string[];
  startedAt: string;
}

export interface AssessmentEventFrameworkStart {
  kind: "framework_start";
  frameworkId: string;
  frameworkName: string;
}

export interface AssessmentEventControlContext {
  kind: "control_context";
  frameworkId: string;
  controlId: string;
  context: Record<string, unknown>;
}

export interface AssessmentEventControlResult {
  kind: "control_result";
  frameworkId: string;
  controlId: string;
  controlName: string;
  status: "assessed" | "skipped" | "error";
  finding?: string;
}

export interface AssessmentEventFrameworkDone {
  kind: "framework_done";
  frameworkId: string;
}

export interface AssessmentEventRunDone {
  kind: "run_done";
  runId: string;
  finishedAt: string;
}

export interface AssessmentEventError {
  kind: "error";
  controlId?: string;
  message: string;
}

export type AssessmentEvent =
  | AssessmentEventRunStart
  | AssessmentEventFrameworkStart
  | AssessmentEventControlContext
  | AssessmentEventControlResult
  | AssessmentEventFrameworkDone
  | AssessmentEventRunDone
  | AssessmentEventError;
