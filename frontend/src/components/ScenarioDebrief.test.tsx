/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { ScenarioDebrief } from "./ScenarioDebrief";
import type { DebriefDecision, ScenarioDebriefData } from "../api/learning";

// vitest runs without globals, so testing-library's auto-cleanup hook is never
// registered and renders would otherwise accumulate across tests in this file.
afterEach(cleanup);

const MISSED_DECISION: DebriefDecision = {
  sequence: 1,
  stage: "initial_assessment",
  chosen_id: "notify_authority_immediately",
  chosen_label: "Notify the supervisory authority immediately",
  correct: false,
  risk_outcome: "qualified_alternative",
  consequence: "The authority opens a file on incomplete facts.",
  framework_rationale: "Premature notification under ISO 27001:2022 A.5.26.",
  reference_id: "invoke_supplier_contract",
  reference_label: "Invoke the supplier incident clause",
  reference_rationale: "Satisfies ISO 27001:2022 A.5.20 — supplier agreements carry duties.",
  controls: ["A.5.20", "A.5.26"],
  observations: ["Control mapping declined."],
  decided_at: null,
};

function debrief(overrides: Partial<ScenarioDebriefData> = {}): ScenarioDebriefData {
  return {
    session_id: "s-1",
    scenario_slug: "supplier_incident_response",
    scenario_title: "Supplier Breach: Processor Notification Window",
    difficulty: "practitioner",
    frameworks: ["iso27001-2022"],
    brief: "A processor has reported a breach.",
    stage: "complete",
    risk: "late_notification",
    complete: true,
    decisions: [MISSED_DECISION],
    competency: [
      {
        dimension: "control_mapping",
        label: "Control mapping",
        score: 40,
        is_gap: true,
        observations: ["Control mapping declined: premature notification."],
      },
      { dimension: "evidence", label: "Evidence quality", score: 72, is_gap: false, observations: [] },
      { dimension: "escalation", label: "Escalation judgment", score: 35, is_gap: true, observations: [] },
      { dimension: "remediation", label: "Remediation", score: 65, is_gap: false, observations: [] },
    ],
    controls_touched: ["A.5.20", "A.5.26"],
    gap_dimensions: ["escalation", "control_mapping"],
    correct_count: 0,
    decision_count: 1,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function renderDebrief(data: ScenarioDebriefData, onRestart = vi.fn()) {
  return render(
    <MemoryRouter>
      <ScenarioDebrief debrief={data} onRestart={onRestart} />
    </MemoryRouter>,
  );
}

describe("ScenarioDebrief", () => {
  it("names the reference answer the learner missed", () => {
    renderDebrief(debrief());

    expect(screen.getByText("Notify the supervisory authority immediately")).toBeTruthy();
    expect(screen.getByText("Invoke the supplier incident clause")).toBeTruthy();
    expect(screen.getByText(/QUALIFIED ALTERNATIVE/)).toBeTruthy();
    // Both the chosen rationale and why the reference was correct must be shown;
    // a miss with no explanation teaches nothing.
    expect(screen.getByText(/Premature notification under ISO 27001:2022 A.5.26/)).toBeTruthy();
    expect(screen.getByText(/supplier agreements carry duties/)).toBeTruthy();
  });

  it("renders all four dimensions and marks the ones below the floor", () => {
    renderDebrief(debrief());

    for (const label of ["Control mapping", "Evidence quality", "Escalation judgment", "Remediation"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/recommended for more practice/)).toHaveLength(2);
  });

  it("hands off to Astra progress and practices by naming weak dimensions", () => {
    renderDebrief(debrief());

    const handoff = screen.getByText(/prioritised for more practice/);
    expect(handoff.textContent).toContain("Control mapping");
    expect(handoff.textContent).toContain("Escalation judgment");
    expect(handoff.textContent).toMatch(/recorded in your learning history/);

    expect(screen.getByText("View progress").closest("a")?.getAttribute("href")).toBe("/progress");
    expect(screen.getByText("Choose another practice").closest("a")?.getAttribute("href")).toBe("/practices");
    expect(screen.queryByText(/compliance posture|control gaps|evidence trail/i)).toBeNull();
  });

  it("says so explicitly when every dimension meets the floor", () => {
    renderDebrief(
      debrief({
        competency: debrief().competency.map((d) => ({ ...d, score: 80, is_gap: false })),
        gap_dimensions: [],
        correct_count: 1,
      }),
    );

    expect(screen.getByText(/Every dimension is at or above the competency floor/)).toBeTruthy();
    expect(screen.queryByText(/recommended for more practice/)).toBeNull();
  });

  it("hides the reference answer when the learner was correct", () => {
    renderDebrief(
      debrief({ decisions: [{ ...MISSED_DECISION, correct: true }], correct_count: 1 }),
    );

    expect(screen.getByText(/MATCHED REFERENCE/)).toBeTruthy();
    expect(screen.queryByText("Reference answer")).toBeNull();
  });

  it("shows source provenance for a skill-derived practice", () => {
    renderDebrief(
      debrief({
        source_skill_id: "evidence-freshness-check",
        source_skill_version: "v2026.10.19.2",
        source_skill_hash: "713d89b9b3f74106c82d322c91e3dbfbe7c8e3ba738a464fd31734a138abe954",
        source_skill_license: "MIT",
        source_review_state: "adapted",
        learning_objectives: ["Read the date inside the artefact"],
      }),
    );

    expect(screen.getByText("evidence freshness check")).toBeTruthy();
    expect(screen.getByText(/Better ISMS · v2026.10.19.2 · MIT/)).toBeTruthy();
    expect(screen.getByText("Read the date inside the artefact")).toBeTruthy();
  });

  it("restarts the loop from the debrief", async () => {
    const onRestart = vi.fn();
    renderDebrief(debrief(), onRestart);

    await userEvent.click(screen.getByText("Next scenario"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
