/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InstructorDashboard from "./InstructorDashboard";

beforeEach(() => {
  const values = new Map<string, string>([
    ["cortex_user", JSON.stringify({ role: "admin", org_id: "org-1" })],
    ["cortex_org_id", "org-1"],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() { return values.size; },
  } as Storage);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDashboard(empty = false) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = empty
      ? []
      : url.includes("/cohorts")
        ? [{ id: "c1", org_id: "org-1", name: "October cohort", description: "", status: "active", learner_count: 2, created_at: null, jurisdiction: "internal", purpose_tags: [] }]
        : url.includes("/assignments")
          ? [{ id: "a1", org_id: "org-1", cohort_id: "c1", title: "Evidence practice", instructions: "", due_at: null, status: "published", practices: ["evidence"], learner_ids: ["u1"], completed_count: 0, learner_count: 1, jurisdiction: "internal", purpose_tags: [] }]
          : [{ learner_id: "u1", display_name: "learner@example.com", assigned: 1, completed: 0, overdue: 1, last_active_at: null, jurisdiction: "internal", purpose_tags: [] }];
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><InstructorDashboard /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("InstructorDashboard", () => {
  it("shows cohort, assignment, and overdue learner state", async () => {
    renderDashboard();
    expect((await screen.findAllByText("October cohort")).length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence practice")).toBeTruthy();
    expect(screen.getByText("learner@example.com")).toBeTruthy();
  });

  it("renders empty states for a new instructor", async () => {
    renderDashboard(true);
    expect(await screen.findByText(/No cohorts yet/i)).toBeTruthy();
    expect(screen.getByText(/No assignments yet/i)).toBeTruthy();
    expect(screen.getByText(/No targeted learners yet/i)).toBeTruthy();
  });
});
