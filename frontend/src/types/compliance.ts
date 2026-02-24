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
  version?: string;
  controlCount: number;
  controls: ControlPosture[];
  score?: number;
  gapCount?: number;
  status?: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
  riskLevel?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  trend?: number;
  jurisdiction?: string;
}

export interface CompliancePosture {
  organisationId: string;
  organisationName: string;
  frameworks: FrameworkPosture[];
  updatedAt: string;
  lastAssessed?: string;
  overallScore?: number;
  auditReadiness?: number;
  /** Total gap count (from API critical_gaps number or criticalGaps array length). */
  criticalGapsCount?: number;
  /** Compliant framework count from API (for 0/8 display). */
  compliantCount?: number;
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
