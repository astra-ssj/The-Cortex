/** @vitest-environment jsdom */

/**
 * The loop closes here: a competency gap offers a retake, not a close button.
 *
 * The API already returns 409 on a manual close, so these tests are about the
 * tracker not asking the user to discover that by being refused — and about the
 * distinction holding, so an authored gap is still closeable by hand.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { RemediationTracker } from "./RemediationTracker";
import type { RemediationFinding } from "../api/client";

const COMPETENCY_GAP: RemediationFinding = {
  id: "gap-abc-123",
  title: "Evidence Quality: takes actions that weaken the evidence available",
  severity: "CRITICAL",
  framework: "ISO/IEC 27001:2022",
  framework_id: "iso27001-2022",
  control_id: "A.5.28",
  control_name: "Evidence Quality",
  reference: "A.5.28, A.5.20",
  entity: "Supplier incident response",
  entity_code: "PR",
  status: "OPEN",
  current_state: "Scored 30 on evidence quality, below the competency floor of 60.",
  required_state: "Evidence is preserved before remediation begins.",
  actions: ["Review A.5.28", "Retake the scenario"],
  completed_actions: [],
  owner: "learner-1",
  due_date: null,
  days_open: 2,
  priority: "P0",
  notes: [],
  source: "competency",
  dimension: "evidence",
  scenario_slug: "supplier_incident_response",
  session_id: "11111111-1111-1111-1111-111111111111",
  learner_id: "learner-1",
  competency_score: 30,
  controls: ["A.5.28", "A.5.20"],
  closed_at: null,
  closed_by_session: null,
};

const MANUAL_GAP: RemediationFinding = {
  ...COMPETENCY_GAP,
  id: "finding-manual-1",
  title: "Penetration test overdue",
  source: "manual",
  dimension: null,
  scenario_slug: null,
  session_id: null,
  learner_id: null,
  competency_score: null,
  due_date: "2026-09-01",
};

let patchCalls: Array<{ id: string; body: unknown }> = [];

function mockApi(items: RemediationFinding[]): void {
  patchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        const id = decodeURIComponent(url.split("/findings/")[1]!.split("?")[0]!);
        patchCalls.push({ id, body: JSON.parse(String(init.body)) });
        const target = items.find((f) => f.id === id)!;
        return new Response(JSON.stringify({ ...target, status: "REMEDIATED" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/v1/findings")) {
        return new Response(
          JSON.stringify({ items, total: items.length, offset: 0, limit: 50 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function renderTracker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/remediation"]}>
        <Routes>
          <Route path="/remediation" element={<RemediationTracker />} />
          <Route path="/learning" element={<div>Learning Loop stub</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** useOrgContext reads localStorage, which this jsdom environment does not provide. */
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
  // normalizeRole fails closed to viewer, and a viewer cannot edit findings — so
  // without an admin the close paths under test would be disabled for the wrong reason.
  localStorage.setItem("cortex_user", JSON.stringify({ role: "admin" }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Remediation Tracker · competency gaps", () => {
  it("offers a retake instead of a manual close, and names why", async () => {
    mockApi([COMPETENCY_GAP]);
    renderTracker();

    const card = await screen.findByText(/Evidence Quality: takes actions/);
    await userEvent.click(card);

    expect(await screen.findByText(/Raised by your own decisions/)).toBeTruthy();
    expect(screen.getByText(/supplier_incident_response/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Retake/ }).length).toBeGreaterThan(0);
    // The dead end this replaces.
    expect(screen.queryByRole("button", { name: "Mark Remediated" })).toBeNull();
  });

  it("links the retake at the scenario that raised the gap", async () => {
    mockApi([COMPETENCY_GAP]);
    renderTracker();

    await userEvent.click(await screen.findByText(/Evidence Quality: takes actions/));
    const link = screen.getAllByRole("link", { name: /Retake/ })[0]!;

    expect(link.getAttribute("href")).toBe(
      "/learning?scenario=supplier_incident_response&gap=gap-abc-123",
    );
  });

  it("refuses a manual close locally, without a request the API would reject", async () => {
    mockApi([COMPETENCY_GAP]);
    renderTracker();

    await userEvent.click(await screen.findByText(/Evidence Quality: takes actions/));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Finding status" }),
      "REMEDIATED",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Retake it and score above the floor/);
    expect(patchCalls).toEqual([]);
  });

  it("still lets an authored gap be closed by hand", async () => {
    mockApi([MANUAL_GAP]);
    renderTracker();

    await userEvent.click(await screen.findByText(/Penetration test overdue/));
    const close = screen.getByRole("button", { name: "Mark Remediated" });
    await userEvent.click(close);

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]).toEqual({
      id: "finding-manual-1",
      body: { status: "REMEDIATED" },
    });
  });
});
