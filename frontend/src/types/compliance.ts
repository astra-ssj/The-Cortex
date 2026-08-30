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
  score?: number;
  gapCount?: number;
  status?: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
  riskLevel?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NOT_ASSESSED";
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
  overallRiskLevel?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NOT_ASSESSED";
  /** Empty-state guidance from API (e.g. before first assessment). */
  message?: string;
  /** Total gap count (from API criticalGaps length or sum of framework gapCount). */
  criticalGapsCount?: number;
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
  /** ZTAIP confidence from assessment LLM (0–1). */
  confidence?: number;
  llm_provider?: string;
  compliance_status?: string;
  /** GRC bundled skill matched for this framework (assessment_engine). */
  skill_id?: string | null;
  skill_name?: string;
  citation_format?: string;
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
