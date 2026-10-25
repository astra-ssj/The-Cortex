/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { PracticeCatalogEntry } from "../api/practices";
import PracticeLibrary from "./PracticeLibrary";

function createMemoryStorage(): Storage {
  const memory = new Map<string, string>();
  return {
    get length() { return memory.size; },
    clear: () => memory.clear(),
    getItem: (key: string) => memory.get(key) ?? null,
    key: (index: number) => {
      let current = 0;
      for (const key of memory.keys()) {
        if (current === index) return key;
        current += 1;
      }
      return null;
    },
    removeItem: (key: string) => { memory.delete(key); },
    setItem: (key: string, value: string) => { memory.set(key, value); },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const practice = (
  overrides: Partial<PracticeCatalogEntry> = {},
): PracticeCatalogEntry => ({
  id: "evidence-freshness-check",
  title: "Evidence freshness check",
  summary: "Challenge stale and incomplete evidence.",
  category: "evidence",
  frameworks: ["iso27001-2022", "soc2"],
  tags: ["evidence"],
  jurisdiction: "international",
  purpose_tags: ["learning", "competency"],
  difficulty: "foundation",
  estimated_minutes: 12,
  target_dimensions: ["evidence", "escalation"],
  learning_objectives: ["Read the date inside the artefact"],
  status: "available",
  scenario_slug: "evidence_freshness_audit",
  source_repository: "https://github.com/better-isms/grcskills",
  source_release: "v2026.10.19.2",
  source_commit: "e99f09d4b836bcf596e032a8ab0dc54668faf4d5",
  source_path: "skills/tristan-roth/evidence-freshness-check/SKILL.md",
  content_hash: "7".repeat(64),
  license: "MIT",
  author: "Tristan Roth",
  review_state: "adapted",
  ...overrides,
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderPage(practices: PracticeCatalogEntry[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(practices), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/practices"]}>
        <Routes>
          <Route path="/practices" element={<PracticeLibrary />} />
          <Route path="/learning" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PracticeLibrary", () => {
  it("separates available practices from planned curriculum", async () => {
    renderPage([
      practice(),
      practice({
        id: "risk-acceptance-memo",
        title: "Risk acceptance memo",
        category: "risk",
        status: "planned",
        scenario_slug: null,
        review_state: "candidate",
      }),
    ]);

    expect(await screen.findByText("Evidence freshness check")).toBeTruthy();
    expect(screen.getByText("Risk acceptance memo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start practice" })).toBeTruthy();
    expect(screen.getByText("Planned")).toBeTruthy();
  });

  it("starts the linked learning scenario with practice provenance", async () => {
    const user = userEvent.setup();
    renderPage([practice()]);

    await user.click(await screen.findByRole("button", { name: "Start practice" }));

    expect(screen.getByTestId("location").textContent).toBe(
      "/learning?scenario=evidence_freshness_audit&practice=evidence-freshness-check",
    );
  });
});
