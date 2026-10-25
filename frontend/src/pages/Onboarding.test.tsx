/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import {
  completeDiagnosticAttempt,
  createDiagnosticAttempt,
} from "../api/learnerJourney";
import Onboarding from "./Onboarding";

vi.mock("../api/learnerJourney", () => ({
  createDiagnosticAttempt: vi.fn(),
  completeDiagnosticAttempt: vi.fn(),
  skipDiagnostic: vi.fn(),
}));

const questions = [
  { id: "evidence", prompt: "What evidence would you request?" },
  { id: "escalation", prompt: "When would you escalate?" },
  { id: "remediation", prompt: "How would you prioritise remediation?" },
];

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Onboarding diagnostic", () => {
  it("captures the profile and authored rationale/confidence for every question", async () => {
    vi.mocked(createDiagnosticAttempt).mockResolvedValue({
      id: "attempt-1",
      org_id: "org-1",
      learner_id: "learner-1",
      role: "GRC analyst",
      experience_level: "developing",
      target_framework: "iso27001-2022",
      learning_goal: "Improve evidence review",
      status: "in_progress",
      questions,
      recommendation: null,
    });
    vi.mocked(completeDiagnosticAttempt).mockResolvedValue({
      id: "attempt-1",
      org_id: "org-1",
      learner_id: "learner-1",
      role: "GRC analyst",
      experience_level: "developing",
      target_framework: "iso27001-2022",
      learning_goal: "Improve evidence review",
      status: "completed",
      questions,
      recommendation: {
        track_id: "iso-track",
        practice_id: "evidence-review",
        rationale: "Matched the learner to published curriculum.",
        confidence: 0.84,
        algorithm_version: "learner-diagnostic-v1",
      },
    });

    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Current role"), "GRC analyst");
    await user.selectOptions(screen.getByLabelText("Experience"), "developing");
    await user.type(screen.getByLabelText("Learning goal"), "Improve evidence review");
    await user.click(screen.getByRole("button", { name: "Continue →" }));

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      if (!question) throw new Error("missing diagnostic question fixture");
      await screen.findByText(question.prompt);
      await user.type(screen.getByLabelText("Your response"), "I would gather attributable evidence for the review period.");
      await user.type(screen.getByLabelText("Why is this your approach?"), "It makes the conclusion reproducible.");
      await user.click(screen.getByRole("button", {
        name: index === questions.length - 1 ? "Build my plan" : "Next question →",
      }));
    }

    expect(await screen.findByText("Your learning plan is ready")).toBeTruthy();
    const call = vi.mocked(completeDiagnosticAttempt).mock.calls[0];
    expect(call).toBeDefined();
    const responses = call![1];
    expect(responses).toHaveLength(3);
    expect(responses.every((item) => item.rationale && item.confidence === 0.7)).toBe(true);
  });
});
