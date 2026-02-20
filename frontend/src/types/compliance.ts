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
}

export interface CompliancePosture {
  organisationId: string;
  organisationName: string;
  frameworks: FrameworkPosture[];
  updatedAt: string;
}
