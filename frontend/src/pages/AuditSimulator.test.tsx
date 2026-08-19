/** @vitest-environment jsdom */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import AuditSimulator from "./AuditSimulator";

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditSimulator />
    </MemoryRouter>,
  );
}

describe("AuditSimulator", () => {
  it("keeps Run Assessment disabled until framework and audit type are selected", async () => {
    const user = userEvent.setup();
    renderPage();

    const run = screen.getByRole("button", { name: "Run Assessment" });
    expect((run as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("radiogroup", { name: "Audit type" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /ISO 27001:2022/ }));
    expect(screen.getByRole("radiogroup", { name: "Audit type" })).toBeTruthy();
    expect((run as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByLabelText("New Audit"));
    expect((run as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens a dismissible Coming Soon modal for SOC 2 without advancing", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /SOC 2/ }));
    expect(screen.getByRole("dialog").textContent ?? "").toContain(
      "SOC 2 scenarios are in development",
    );
    expect(screen.queryByRole("radiogroup", { name: "Audit type" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
