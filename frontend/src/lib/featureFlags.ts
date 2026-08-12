export const FEATURES = {
  evidenceVault: false, // Mock chain — no real evidence storage
  auditSimulator: false, // Client-side simulation
  aiSystemsLive: false, // Static SYSTEMS constant
  projectTracker: false, // Static ROADMAP_EPICS
  // These are TRUE — they have real backends:
  dashboard: true,
  frameworks: true,
  findings: true,
  assessmentStream: true,
  reviewQueue: true,
  groupDashboard: true,
  evidenceIngestLive: true, // POST /api/v1/ingest/document + multi-provider LLM (core/llm)
  assessmentLlmLive: true, // GET /api/v1/assessments/stream uses assessment_llm CircuitBreaker
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}

/** Sidebar badge — true when the route still ships simulated or unreleased UX. */
export function showNavSoonForPath(path: string): boolean {
  switch (path) {
    case "/intelligence":
      return !(FEATURES.auditSimulator && FEATURES.evidenceVault);
    case "/ai-systems":
      return !FEATURES.aiSystemsLive;
    case "/roadmap":
      return !FEATURES.projectTracker;
    default:
      return false;
  }
}
