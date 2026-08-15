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
    expect(screen.getByText(/MISSED/)).toBeTruthy();
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
    expect(screen.getAllByText(/raised as a control gap/)).toHaveLength(2);
  });

  it("hands off to Control Gaps and Evidence by naming the weak dimensions", () => {
    renderDebrief(debrief());

    const handoff = screen.getByText(/now open control gaps/);
    expect(handoff.textContent).toContain("Control mapping");
    expect(handoff.textContent).toContain("Escalation judgment");
    expect(handoff.textContent).toMatch(/hash-chained into the evidence log/);

    expect(screen.getByText("View control gaps").closest("a")?.getAttribute("href")).toBe("/findings");
    expect(screen.getByText("View evidence trail").closest("a")?.getAttribute("href")).toBe("/evidence");
    expect(screen.getByText("Competency ledger").closest("a")?.getAttribute("href")).toBe("/progress");
  });

  it("says so explicitly when no gaps were raised", () => {
    renderDebrief(
      debrief({
        competency: debrief().competency.map((d) => ({ ...d, score: 80, is_gap: false })),
        gap_dimensions: [],
        correct_count: 1,
      }),
    );

    expect(screen.getByText(/raised no new control gaps/)).toBeTruthy();
    expect(screen.queryByText(/raised as a control gap/)).toBeNull();
  });

  it("hides the reference answer when the learner was correct", () => {
    renderDebrief(
      debrief({ decisions: [{ ...MISSED_DECISION, correct: true }], correct_count: 1 }),
    );

    expect(screen.getByText(/MATCHED REFERENCE/)).toBeTruthy();
    expect(screen.queryByText("Reference answer")).toBeNull();
  });

  it("restarts the loop from the debrief", async () => {
    const onRestart = vi.fn();
    renderDebrief(debrief(), onRestart);

    await userEvent.click(screen.getByText("Next scenario"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
