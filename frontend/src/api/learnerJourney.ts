import { fetchApi } from "./client";

export interface DiagnosticResponse {
  jurisdiction: string;
  purpose_tags: string[];
  question_id: string;
  response: string;
  rationale: string;
  confidence: number;
}

export interface DiagnosticRecommendation {
  track_id: string | null;
  practice_id: string | null;
  rationale: string;
  confidence: number;
  algorithm_version: string;
}

export interface DiagnosticAttempt {
  id: string;
  org_id: string;
  learner_id: string;
  role: string;
  experience_level: string;
  target_framework: string;
  learning_goal: string;
  status: string;
  questions: { id: string; prompt: string }[];
  recommendation: DiagnosticRecommendation | null;
}

export function createDiagnosticAttempt(body: {
  jurisdiction: string;
  purpose_tags: string[];
  role: string;
  experience_level: "new" | "developing" | "experienced";
  target_framework: string;
  learning_goal: string;
}): Promise<DiagnosticAttempt> {
  return fetchApi("/api/v1/diagnostic/attempts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function completeDiagnosticAttempt(
  attemptId: string,
  responses: DiagnosticResponse[],
): Promise<DiagnosticAttempt> {
  return fetchApi(`/api/v1/diagnostic/attempts/${encodeURIComponent(attemptId)}/complete`, {
    method: "POST",
    body: JSON.stringify({ responses }),
  });
}

export function skipDiagnostic(rationale: string): Promise<{ onboarding_complete: boolean }> {
  return fetchApi("/api/v1/diagnostic/skip", {
    method: "POST",
    body: JSON.stringify({ rationale }),
  });
}

export interface PublishedPractice {
  practice_id: string;
  practice_version_id: string;
  version: string;
  title: string;
  summary: string;
  frameworks: string[];
  difficulty: string;
  scenario_slug: string | null;
  content_hash: string;
  prerequisite_track_version_ids: string[];
  completed: boolean;
  locked: boolean;
  recommended: boolean;
}

export interface PublishedTrack {
  track_id: string;
  track_version_id: string;
  version: number;
  title: string;
  content_hash: string;
  prerequisite_track_version_ids: string[];
  completed: boolean;
  locked: boolean;
  recommended: boolean;
}

export interface LearningPlan {
  learner_id: string;
  recommended_track_version_id: string | null;
  recommended_practice_version_id: string | null;
  tracks: PublishedTrack[];
  practices: PublishedPractice[];
}

export function getLearningPlan(): Promise<LearningPlan> {
  return fetchApi("/api/v1/curriculum/me/learning-plan");
}
