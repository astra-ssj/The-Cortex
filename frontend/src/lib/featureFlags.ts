export const FEATURES = {
  auditSimulator: false, // Client-side simulation
  projectTracker: false, // Static ROADMAP_EPICS
  // These are TRUE — they have real backends:
  evidenceVault: true, // GET /api/v1/audit — the real append-only prev_hash chain
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
    case "/roadmap":
      return !FEATURES.projectTracker;
    default:
      return false;
  }
}
