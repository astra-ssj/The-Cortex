export type Role = "admin" | "analyst" | "viewer";

export const ROLE_PERMISSIONS = {
  admin: {
    canRunAssessment: true,
    canApproveReview: true,
    canOverrideControl: true,
    canEditFindings: true,
    canManageIntegrations: true,
    canGenerateReport: true,
    canToggleDemo: true,
    canAccessSettings: true,
  },
  analyst: {
    canRunAssessment: true,
    canApproveReview: true,
    canOverrideControl: false,
    canEditFindings: true,
    canManageIntegrations: false,
    canGenerateReport: true,
    canToggleDemo: false,
    canAccessSettings: false,
  },
  viewer: {
    canRunAssessment: false,
    canApproveReview: false,
    canOverrideControl: false,
    canEditFindings: false,
    canManageIntegrations: false,
    canGenerateReport: true,
    canToggleDemo: false,
    canAccessSettings: false,
  },
} as const;

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

/** Defaults legacy / unknown API role strings to admin until backend ships RBAC claims. */
export function normalizeRole(raw: unknown): Role {
  if (raw === "admin" || raw === "analyst" || raw === "viewer") return raw;
  return "admin";
}
