export const FEATURES = {
  telemetryFusion: false, // No backend integration exists
  evidenceVault: false, // Mock chain — no real evidence storage
  regulationIntel: false, // Hardcoded regulatory data
  auditSimulator: false, // Client-side simulation
  aiSystemsLive: false, // Static SYSTEMS constant
  projectTracker: false, // Static ROADMAP_EPICS
  // These are TRUE — they have real backends:
  dashboard: true,
  frameworks: true,
  findings: true,
  assessmentStream: true,
  reviewQueue: true,
  auditReport: true,
  groupDashboard: true,
  cloudScans: true,
  integrations: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}

/** Sidebar badge — true when the route still ships simulated or unreleased UX. */
export function showNavSoonForPath(path: string): boolean {
  switch (path) {
    case "/intelligence":
      return !(
        FEATURES.auditSimulator &&
        FEATURES.telemetryFusion &&
        FEATURES.regulationIntel &&
        FEATURES.evidenceVault
      );
    case "/ai-systems":
      return !FEATURES.aiSystemsLive;
    case "/roadmap":
      return !FEATURES.projectTracker;
    default:
      return false;
  }
}
