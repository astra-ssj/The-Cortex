/**
 * Compliance store: posture, ZTAIP status, org profile, assessment stream, roadmap.
 * Uses API client and TanStack Query; stream state is local.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { AssessmentEvent, CompliancePosture, ZTAIPStatus } from "../types/compliance";
import {
  buildStreamUrl,
  organisationsApi,
  ztaipApi,
} from "../api/client";

// ─── Roadmap types (epics + stories) ───────────────────────────────────────
export type StoryStatus = "done" | "in_progress" | "not_started";
export type Priority = "P0" | "P1" | "P2";
export type StoryOwner = "CORTEX" | "Cursor" | "Manual";
export type EpicStatus = "COMPLETE" | "IN PROGRESS" | "NOT STARTED";

export interface RoadmapStory {
  id: string;
  title: string;
  status: StoryStatus;
  priority: Priority;
  owner: StoryOwner;
  phase?: 2 | 3 | 4;
}

export interface RoadmapEpic {
  id: string;
  number: number;
  title: string;
  status: EpicStatus;
  stories: RoadmapStory[];
}

export const ROADMAP_EPICS: RoadmapEpic[] = [
  {
    id: "epic-1",
    number: 1,
    title: "Foundation",
    status: "COMPLETE",
    stories: [
      { id: "s1-1", title: "ZTAIP Architecture", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-2", title: "Organisational Ontology", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-3", title: "8 Compliance Frameworks — 491 controls", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-4", title: "Assessment Engine with LLM routing", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-5", title: "Immutable Audit Fabric", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-6", title: "Circuit Breakers", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-7", title: "Dynamic Autonomy Router", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-8", title: "Docker deployment", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-9", title: "CI/CD Pipeline", status: "done", priority: "P1", owner: "Cursor", phase: 2 },
      { id: "s1-10", title: "PostgreSQL schema + ontology", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
    ],
  },
  {
    id: "epic-2",
    number: 2,
    title: "Core Intelligence",
    status: "IN PROGRESS",
    stories: [
      { id: "s2-1", title: "Assessment Engine with SSE streaming", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-2", title: "Framework posture display", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-3", title: "Dark intelligence dashboard", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-4", title: "AstraLabs org data seeded", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-5", title: "Real posture scores", status: "in_progress", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-6", title: "Trend data from historical runs", status: "done", priority: "P1", owner: "CORTEX", phase: 2 },
      { id: "s2-7", title: "Human Review Workflow (GDPR Art.22)", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-8", title: "Remediation Tracker with Kanban", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-9", title: "Audit Report Generator", status: "in_progress", priority: "P1", owner: "Cursor", phase: 2 },
      { id: "s2-10", title: "Multi-Entity Group Dashboard", status: "not_started", priority: "P1", owner: "Cursor", phase: 2 },
    ],
  },
  {
    id: "epic-3",
    number: 3,
    title: "Data Ingestion",
    status: "IN PROGRESS",
    stories: [
      { id: "s3-1", title: "Org structure seeded (6 entities)", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s3-2", title: "Mock compliance policies (3 ISO 27001 docs)", status: "done", priority: "P1", owner: "Cursor", phase: 2 },
      { id: "s3-3", title: "Document ingestion pipeline", status: "done", priority: "P1", owner: "CORTEX", phase: 2 },
      { id: "s3-4", title: "Azure connector", status: "done", priority: "P1", owner: "CORTEX", phase: 2 },
      { id: "s3-5", title: "AWS connector", status: "in_progress", priority: "P1", owner: "CORTEX", phase: 2 },
      { id: "s3-6", title: "HR system import", status: "not_started", priority: "P2", owner: "Manual", phase: 3 },
      { id: "s3-7", title: "Real-time scanning", status: "not_started", priority: "P2", owner: "Manual", phase: 3 },
      { id: "s3-8", title: "Test document ingestion", status: "not_started", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s3-9", title: "Test Azure connector", status: "not_started", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s3-10", title: "Test AWS connector", status: "not_started", priority: "P0", owner: "CORTEX", phase: 2 },
    ],
  },
  {
    id: "epic-4",
    number: 4,
    title: "Intelligence Altitudes",
    status: "NOT STARTED",
    stories: [
      { id: "s4-1", title: "Board altitude view", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s4-2", title: "C-Suite altitude view", status: "not_started", priority: "P1", owner: "CORTEX", phase: 3 },
      { id: "s4-3", title: "Management altitude view", status: "not_started", priority: "P1", owner: "CORTEX", phase: 3 },
      { id: "s4-4", title: "Multi-entity consolidated posture", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s4-5", title: "Regulatory horizon tracking", status: "not_started", priority: "P2", owner: "Manual", phase: 3 },
      { id: "s4-6", title: "Cross-framework intelligence engine", status: "not_started", priority: "P1", owner: "CORTEX", phase: 3 },
      { id: "s4-7", title: "Risk register view", status: "not_started", priority: "P1", owner: "CORTEX", phase: 3 },
      { id: "s4-8", title: "Evidence library view", status: "not_started", priority: "P1", owner: "Cursor", phase: 3 },
    ],
  },
  {
    id: "epic-5",
    number: 5,
    title: "Commercial Readiness",
    status: "NOT STARTED",
    stories: [
      { id: "s5-1", title: "Authentication + JWT", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s5-2", title: "Role-based access control", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s5-3", title: "Multi-tenant architecture", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s5-4", title: "Self-serve onboarding", status: "not_started", priority: "P1", owner: "Cursor", phase: 3 },
      { id: "s5-5", title: "SOC 2 framework", status: "not_started", priority: "P1", owner: "Cursor", phase: 3 },
      { id: "s5-6", title: "DORA framework", status: "not_started", priority: "P1", owner: "Cursor", phase: 3 },
      { id: "s5-7", title: "Subscription + billing", status: "not_started", priority: "P2", owner: "Manual", phase: 4 },
      { id: "s5-8", title: "White-label theming", status: "not_started", priority: "P2", owner: "Manual", phase: 4 },
    ],
  },
];

export function getRoadmapSummary() {
  let storiesComplete = 0;
  let storiesInProgress = 0;
  let storiesNotStarted = 0;
  ROADMAP_EPICS.forEach((epic) => {
    epic.stories.forEach((s) => {
      if (s.status === "done") storiesComplete += 1;
      else if (s.status === "in_progress") storiesInProgress += 1;
      else storiesNotStarted += 1;
    });
  });
  const total = storiesComplete + storiesInProgress + storiesNotStarted;
  const overallProgress = total ? Math.round((storiesComplete / total) * 100) : 0;
  return {
    totalEpics: ROADMAP_EPICS.length,
    storiesComplete,
    storiesInProgress,
    storiesNotStarted,
    totalStories: total,
    overallProgress,
  };
}

// Query keys
export const postureQueryKey = (orgId: string) => ["posture", orgId] as const;
export const ztaipStatusQueryKey = ["ztaipStatus"] as const;
export const orgProfileQueryKey = (orgId: string) => ["orgProfile", orgId] as const;

function mapPostureResponse(raw: Record<string, unknown>): CompliancePosture {
  const frameworks = (raw.frameworks as Record<string, unknown>[] | undefined) ?? [];
  return {
    organisationId: String(raw.org_id ?? ""),
    organisationName: String(raw.org_name ?? ""),
    updatedAt: String(raw.last_assessed ?? ""),
    lastAssessed: raw.last_assessed != null ? String(raw.last_assessed) : undefined,
    overallScore: typeof raw.overall_score === "number" ? raw.overall_score : undefined,
    auditReadiness: typeof raw.audit_readiness === "number" ? raw.audit_readiness : undefined,
    frameworks: frameworks.map((f: Record<string, unknown>) => ({
      frameworkId: String(f.framework_id ?? ""),
      frameworkName: String(f.framework_name ?? ""),
      controlCount: typeof f.control_count === "number" ? f.control_count : 0,
      controls: [],
      score: typeof f.score === "number" ? f.score : undefined,
      gapCount: typeof f.gap_count === "number" ? f.gap_count : undefined,
      status: typeof f.status === "string" ? (f.status as "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT") : undefined,
      riskLevel: typeof f.risk_level === "string" ? (f.risk_level as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") : undefined,
      trend: typeof f.trend === "number" ? f.trend : undefined,
    })),
  };
}

export function useCompliancePosture(orgId: string | null) {
  return useQuery({
    queryKey: postureQueryKey(orgId ?? ""),
    queryFn: async () => {
      const raw = await organisationsApi.getPosture(orgId ?? undefined);
      return mapPostureResponse(raw as Record<string, unknown>);
    },
    enabled: orgId != null && orgId !== "",
    refetchInterval: 60_000,
  });
}

export function useZtaipStatus() {
  return useQuery({
    queryKey: ztaipStatusQueryKey,
    queryFn: () => ztaipApi.getStatus() as Promise<ZTAIPStatus>,
    staleTime: 30_000,
  });
}

export function useOrgProfile(_orgId: string | null) {
  return useQuery({
    queryKey: orgProfileQueryKey(_orgId ?? ""),
    queryFn: async () => ({ id: _orgId, name: "", jurisdiction: "", industry: null, region: null }),
    enabled: false,
  });
}

export function useAssessmentStream() {
  const [events, setEvents] = useState<AssessmentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startStream = useCallback((_organizationId: string, _frameworkIds: string[]) => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setEvents([]);
    setIsStreaming(true);
    const url = buildStreamUrl();
    const es = new EventSource(url);
    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as AssessmentEvent;
        if (data && typeof data === "object" && "kind" in data) {
          setEvents((prev) => [...prev, data]);
        }
      } catch {
        // ignore parse errors
      }
    };
    es.addEventListener("run_done", () => {
      setIsStreaming(false);
      eventSourceRef.current = null;
      es.close();
    });
    es.onerror = () => {
      setIsStreaming(false);
      eventSourceRef.current = null;
      es.close();
    };
    eventSourceRef.current = es;
  }, []);

  const stopStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  }, []);

  return { events, isStreaming, startStream, stopStream };
}
