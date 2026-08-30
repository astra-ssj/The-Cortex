/** Learning Loop v1 API helpers — org-scoped scenario sessions. */

import { fetchApi } from "./client";

export interface CompetencyDimension {
  score: number;
  delta: number;
  observations: string[];
}

export interface LearningSession {
  id: string;
  org_id: string;
  scenario: string;
  learner_id: string;
  state: Record<string, unknown>;
  stage: string;
  risk: string | null;
  competency?: Record<string, CompetencyDimension>;
  created_at?: string | null;
  updated_at?: string | null;
  jurisdiction?: string;
  purpose_tags?: string[];
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchApi<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export interface ScenarioSummary {
  slug: string;
  title: string;
  brief: string;
  track: string;
  frameworks: string[];
  difficulty: string;
}

export function getScenarios(): Promise<ScenarioSummary[]> {
  return fetchApi<ScenarioSummary[]>("/api/v1/learning/scenarios");
}

export interface SessionSummary {
  session_id: string;
  scenario_slug: string;
  scenario_title: string;
  difficulty: string;
  stage: string;
  risk: string | null;
  competency: Record<string, CompetencyDimension>;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * `mine` returns only the caller's sessions. `team` spans the organisation and
 * requires the view_team_competency permission — competency is personal
 * performance data, so the org-wide read is deliberate rather than the default.
 */
export type SessionScope = "mine" | "team";

export function getSessions(
  org_id: string,
  scope: SessionScope = "mine"
): Promise<SessionSummary[]> {
  const params = new URLSearchParams({ scope });
  if (org_id) params.set("org_id", org_id);
  return fetchApi<SessionSummary[]>(`/api/v1/learning/sessions?${params.toString()}`);
}

/** One dimension rolled up across every session a learner has run. */
export interface LearnerDimension {
  dimension: string;
  label: string;
  score: number;
  best: number;
  scenarios_with_signal: number;
  proven: boolean;
  is_gap: boolean;
}

export interface LearnerCompetency {
  org_id: string;
  learner_id: string;
  display_name: string;
  dimensions: LearnerDimension[];
  sessions_started: number;
  scenarios_completed: number;
  scenarios_available: number;
  gap_dimensions: string[];
  proven_dimensions: string[];
  track_complete: boolean;
  last_active_at: string | null;
}

export function getMyCompetency(org_id: string): Promise<LearnerCompetency> {
  const qs = org_id ? `?org_id=${encodeURIComponent(org_id)}` : "";
  return fetchApi<LearnerCompetency>(`/api/v1/learning/competency${qs}`);
}

export function getTeamCompetency(org_id: string): Promise<LearnerCompetency[]> {
  const qs = org_id ? `?org_id=${encodeURIComponent(org_id)}` : "";
  return fetchApi<LearnerCompetency[]>(`/api/v1/learning/competency/team${qs}`);
}

export function createLearningSession(body?: {
  org_id?: string;
  scenario?: string;
  scenario_slug?: string;
  /** Carried from the Audit Simulator so the session records the chosen frame. */
  framework?: string;
  audit_type?: string;
}): Promise<LearningSession> {
  return postJson<LearningSession>("/api/v1/learning/sessions", body ?? {});
}

export function getLearningSession(
  sessionId: string,
  orgId?: string
): Promise<LearningSession> {
  const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  return fetchApi<LearningSession>(
    `/api/v1/learning/sessions/${encodeURIComponent(sessionId)}${qs}`
  );
}

export function decideLearningSession(
  sessionId: string,
  choice: string,
  orgId?: string
): Promise<LearningSession> {
  const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  return postJson<LearningSession>(
    `/api/v1/learning/sessions/${encodeURIComponent(sessionId)}/decide${qs}`,
    { choice }
  );
}

/** One graded decision paired with the reference answer for its stage. */
export interface DebriefDecision {
  sequence: number;
  stage: string;
  chosen_id: string;
  chosen_label: string;
  correct: boolean;
  consequence: string;
  framework_rationale: string;
  reference_id: string | null;
  reference_label: string | null;
  reference_rationale: string | null;
  controls: string[];
  observations: string[];
  decided_at: string | null;
}

export interface DebriefDimension {
  dimension: string;
  label: string;
  score: number;
  is_gap: boolean;
  observations: string[];
}

export interface ScenarioDebriefData {
  session_id: string;
  scenario_slug: string;
  scenario_title: string;
  difficulty: string;
  frameworks: string[];
  brief: string;
  stage: string;
  risk: string | null;
  complete: boolean;
  decisions: DebriefDecision[];
  competency: DebriefDimension[];
  controls_touched: string[];
  gap_dimensions: string[];
  correct_count: number;
  decision_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export function getScenarioDebrief(
  sessionId: string,
  orgId?: string
): Promise<ScenarioDebriefData> {
  const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  return fetchApi<ScenarioDebriefData>(
    `/api/v1/learning/sessions/${encodeURIComponent(sessionId)}/debrief${qs}`
  );
}
