/** @vitest-environment jsdom */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { HelpPanel } from "./HelpPanel";
import { HELP_DOC_SECTIONS } from "../lib/helpDocsContent";

afterEach(cleanup);

function renderPanel() {
  return render(
    <MemoryRouter>
      <HelpPanel open onClose={() => {}} />
    </MemoryRouter>,
  );
}

const SECTION_TITLES = [
  "Getting Started",
  "Scenarios",
  "Scenario Workspace",
  "Competency Panel",
  "Compliance Posture",
  "Difficulty Levels",
  "Keyboard Shortcuts",
  "Support",
] as const;

/** Section headers survive the search filter; collapsed bodies do not render. */
function visibleSections(): string[] {
  return SECTION_TITLES.filter(
    (title) => screen.queryAllByRole("button", { name: new RegExp(`^${title}`) }).length > 0,
  );
}

async function search(term: string) {
  const user = userEvent.setup();
  const box = screen.getByPlaceholderText("Search help topics...");
  await user.clear(box);
  await user.type(box, term);
}

// Terms a learner is expected to reach the help by. Content may be reworded,
// but these must keep resolving — a rewrite that drops one is a regression.
const REQUIRED_TERMS = [
  { term: "competency", section: "Competency Panel" },
  { term: "CX-1004", section: "Scenarios" },
  { term: "escalation", section: "Competency Panel" },
  { term: "evidence", section: "Competency Panel" },
  { term: "control gap", section: "Competency Panel" },
  { term: "posture", section: "Compliance Posture" },
  { term: "ISO 27001", section: "Scenarios" },
] as const;

describe("HelpPanel search", () => {
  it.each(REQUIRED_TERMS)("resolves $term to the $section section", async ({ term, section }) => {
    renderPanel();
    await search(term);

    const found = visibleSections();
    expect(found.length).toBeGreaterThan(0);
    expect(found).toContain(section);
  });

  it("shows every section when the query is empty", () => {
    renderPanel();
    expect(visibleSections()).toHaveLength(SECTION_TITLES.length);
  });

  it("filters out sections that do not match", async () => {
    renderPanel();
    await search("CX-1004");

    // The scenario list matches; the shortcut table does not.
    expect(visibleSections()).not.toContain("Keyboard Shortcuts");
  });

  it("shows no sections for a term the help does not cover", async () => {
    renderPanel();
    await search("zzzznotathing");

    expect(visibleSections()).toHaveLength(0);
  });
});

describe("HelpPanel content honesty", () => {
  it("presents GDPR and SOC 2 as in development, never as selectable", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /^Scenarios/ }));
    expect(screen.getByText(/GDPR and SOC 2 are in development/)).toBeTruthy();
  });

  it("describes H as opening this panel rather than the help page", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /^Keyboard Shortcuts/ }));
    const shortcuts = screen.getByText(/H → This quick reference panel/);
    expect(shortcuts.textContent).not.toMatch(/Help page/);
  });
});

describe("help docs content", () => {
  const copy = JSON.stringify(HELP_DOC_SECTIONS);

  it("matches the README framework coverage statement", () => {
    expect(copy).toMatch(/ISO 27001:2022 is the only selectable framework/);
    expect(copy).toMatch(/GDPR and SOC 2 are in development/);
  });

  it("does not claim a disabled framework can be chosen", () => {
    expect(copy).not.toMatch(/ISO 27001:2022 or GDPR/);
  });

  it("does not claim audit type filters the scenario list", () => {
    expect(copy).not.toMatch(/matching scenario list/);
    expect(copy).toMatch(/does not yet filter the scenario list/);
  });

  it("does not advertise a glossary the panel never renders", () => {
    expect(copy).not.toMatch(/glossary/i);
  });
});
