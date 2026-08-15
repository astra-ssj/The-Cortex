export type Role = "admin" | "analyst" | "viewer";

export const ROLE_PERMISSIONS = {
  admin: {
    canRunAssessment: true,
    canApproveReview: true,
    canOverrideControl: true,
    canEditFindings: true,
    canGenerateReport: true,
    canToggleDemo: true,
    canAccessSettings: true,
    canViewTeamCompetency: true,
  },
  analyst: {
    canRunAssessment: true,
    canApproveReview: true,
    canOverrideControl: false,
    canEditFindings: true,
    canGenerateReport: true,
    canToggleDemo: false,
    canAccessSettings: false,
    canViewTeamCompetency: false,
  },
  viewer: {
    canRunAssessment: false,
    canApproveReview: false,
    canOverrideControl: false,
    canEditFindings: false,
    canGenerateReport: true,
    canToggleDemo: false,
    canAccessSettings: false,
    canViewTeamCompetency: false,
  },
} as const;

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

/** Map JWT / API role to UI role. Unknown values fail closed to viewer (matches server RBAC). */
export function normalizeRole(raw: unknown): Role {
  if (raw === "admin" || raw === "analyst" || raw === "viewer") return raw;
  const r = typeof raw === "string" ? raw.toLowerCase() : "";
  if (r === "admin" || r === "administrator" || r === "ciso") return "admin";
  if (r === "dpo" || r === "analyst" || r === "security_lead") return "analyst";
  return "viewer";
}
