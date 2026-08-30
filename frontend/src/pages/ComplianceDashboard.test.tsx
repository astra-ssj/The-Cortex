/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { ComplianceDashboard } from "./ComplianceDashboard";
import type { ComplianceOverview } from "../api/compliance";

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

const EMPTY: ComplianceOverview = {
  org_id: "org-1",
  org_label: "AstraLabs Group",
  framework: "iso27001-2022",
  framework_name: "ISO/IEC 27001:2022",
  summary: {
    controls_assessed: 0,
    controls_available: 18,
    average_competency: 0,
    open_gaps: 0,
  },
  controls: [],
  not_assessed: [
    { ref: "a.8.2", name: "Privileged Access Rights" },
    { ref: "a.5.26", name: "Response to Information Security Incidents" },
  ],
};

const POPULATED: ComplianceOverview = {
  ...EMPTY,
  summary: {
    controls_assessed: 3,
    controls_available: 18,
    average_competency: 61,
    open_gaps: 1,
  },
  controls: [
    {
      ref: "a.5.28",
      name: "Collection of Evidence",
      competency: 34,
      status: "gap",
      dimensions: ["Evidence quality"],
      scenario_slug: "asset_classification_breach",
    },
    {
      ref: "a.8.2",
      name: "Privileged Access Rights",
      competency: 64,
      status: "developing",
      dimensions: ["Control mapping"],
      scenario_slug: "cloud_access_onboarding",
    },
    {
      ref: "a.8.32",
      name: "Change Management",
      competency: 85,
      status: "strong",
      dimensions: ["Remediation"],
      scenario_slug: "change_management_failure",
    },
  ],
  not_assessed: [{ ref: "a.6.8", name: "Information Security Event Reporting" }],
};

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}{loc.search}</div>;
}

function renderPage(payload: ComplianceOverview | { status: number }) {
  localStorage.setItem("cortex_user", JSON.stringify({ role: "admin", org_id: "org-1" }));
  localStorage.setItem("cortex_org_id", "org-1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if ("status" in payload) {
        return new Response(JSON.stringify({ detail: "boom" }), {
          status: payload.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<ComplianceDashboard />} />
          <Route path="/learning" element={<LocationProbe />} />
          <Route path="/audit-simulator" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Compliance Overview", () => {
  it("sends an untrained org to the simulator rather than showing a zero score", async () => {
    renderPage(EMPTY);

    expect(
      await screen.findByText(/has no demonstrated competency yet/i),
    ).toBeTruthy();
    // A 0 average would read as "assessed and failing" — it must not appear.
    expect(screen.queryByText("Average competency")).toBeNull();
    expect(screen.getByText(/18 controls are currently coverable/i)).toBeTruthy();
  });

  it("names unassessed controls as unknowns, not passes", async () => {
    renderPage(EMPTY);

    expect(await screen.findByText(/These are unknowns, not passes/i)).toBeTruthy();
    expect(screen.getByText("a.8.2")).toBeTruthy();
    expect(screen.getByText("Privileged Access Rights")).toBeTruthy();
  });

  it("summarises posture and groups controls worst-first", async () => {
    renderPage(POPULATED);

    expect(await screen.findByText("3/18")).toBeTruthy();
    expect(screen.getByText("61")).toBeTruthy();
    expect(screen.getByText("Gap · 1")).toBeTruthy();
    expect(screen.getByText("Developing · 1")).toBeTruthy();
    expect(screen.getByText("Strong · 1")).toBeTruthy();

    const headings = screen.getAllByText(/^(Gap|Developing|Strong) · \d+$/);
    expect(headings.map((h) => h.textContent)).toEqual([
      "Gap · 1",
      "Developing · 1",
      "Strong · 1",
    ]);
  });

  it("offers practise only where there is a gap to close", async () => {
    renderPage(POPULATED);

    await screen.findByText("Collection of Evidence");
    // Gap and developing are actionable; strong is not.
    expect(screen.getAllByRole("button", { name: "Practise" })).toHaveLength(2);
  });

  it("routes a gap straight back into the scenario that raised it", async () => {
    const user = userEvent.setup();
    renderPage(POPULATED);

    await screen.findByText("Collection of Evidence");
    const [firstGap] = screen.getAllByRole("button", { name: "Practise" });
    expect(firstGap).toBeTruthy();
    await user.click(firstGap as HTMLElement);

    expect(screen.getByTestId("location").textContent).toBe(
      "/learning?scenario=asset_classification_breach",
    );
  });

  it("surfaces a load failure instead of rendering an empty posture", async () => {
    renderPage({ status: 500 });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Could not load compliance posture/i)).toBeTruthy();
  });
});
