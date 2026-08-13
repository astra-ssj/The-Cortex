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

export function createLearningSession(body?: {
  org_id?: string;
  scenario?: string;
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
