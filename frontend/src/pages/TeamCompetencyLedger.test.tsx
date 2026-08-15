/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";

import TeamCompetencyLedger from "./TeamCompetencyLedger";
import type { LearnerCompetency } from "../api/learning";

function createMemoryStorage(): Storage {
  const memory: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(memory).length;
    },
    clear() {
      for (const k of Object.keys(memory)) delete memory[k];
    },
    getItem: (key: string) => memory[key] ?? null,
    key: (index: number) => Object.keys(memory)[index] ?? null,
    removeItem: (key: string) => {
      delete memory[key];
    },
    setItem: (key: string, value: string) => {
      memory[key] = value;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ALICE: LearnerCompetency = {
  org_id: "org-1",
  learner_id: "alice",
  display_name: "alice@example.com",
  dimensions: [
    {
      dimension: "control_mapping",
      label: "Control Mapping",
      score: 40,
      best: 40,
      scenarios_with_signal: 1,
      proven: false,
      is_gap: true,
    },
    {
      dimension: "evidence",
      label: "Evidence Quality",
      score: 50,
      best: 50,
      scenarios_with_signal: 1,
      proven: false,
      is_gap: true,
    },
    {
      dimension: "escalation",
      label: "Escalation Judgment",
      score: 55,
      best: 55,
      scenarios_with_signal: 1,
      proven: false,
      is_gap: true,
    },
    {
      dimension: "remediation",
      label: "Remediation",
      score: 50,
      best: 50,
      scenarios_with_signal: 0,
      proven: false,
      is_gap: true,
    },
  ],
  sessions_started: 1,
  scenarios_completed: 1,
  scenarios_available: 5,
  gap_dimensions: ["control_mapping", "evidence", "escalation", "remediation"],
  proven_dimensions: [],
  track_complete: false,
  last_active_at: "2026-08-15T10:00:00Z",
};

function renderLedger(role: string, rows: LearnerCompetency[] = [ALICE]) {
  localStorage.setItem("cortex_user", JSON.stringify({ role, org_id: "org-1" }));
  localStorage.setItem("cortex_org_id", "org-1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TeamCompetencyLedger />
    </QueryClientProvider>,
  );
}

describe("TeamCompetencyLedger", () => {
  it("reuses the individual ledger layout with one row per person", async () => {
    renderLedger("admin");
    expect(await screen.findByText("alice@example.com")).toBeTruthy();
    expect(screen.getByLabelText("Competency dimensions")).toBeTruthy();
    expect(screen.getAllByText(/ISO 27001:2022 track/i).length).toBeGreaterThan(0);
  });

  it("hides the org view from roles without view_team_competency", () => {
    renderLedger("viewer");
    expect(screen.getByText(/Team ledger is restricted/i)).toBeTruthy();
  });
});
