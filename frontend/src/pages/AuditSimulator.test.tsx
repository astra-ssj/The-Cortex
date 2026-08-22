/** @vitest-environment jsdom */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import AuditSimulator from "./AuditSimulator";

afterEach(cleanup);

/** Renders the current location so a test can assert the navigated URL. */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}{loc.search}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/audit-simulator"]}>
      <Routes>
        <Route path="/audit-simulator" element={<AuditSimulator />} />
        <Route path="/learning" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuditSimulator", () => {
  it("disables frameworks with no scenario content", () => {
    renderPage();

    const gdpr = screen.getByRole("button", { name: /GDPR/ });
    const soc2 = screen.getByRole("button", { name: /SOC 2/ });

    // Disabled cards carry the badge and are removed from tab order.
    expect(gdpr.getAttribute("aria-disabled")).toBe("true");
    expect(soc2.getAttribute("aria-disabled")).toBe("true");
    expect(gdpr.tabIndex).toBe(-1);
    expect(soc2.tabIndex).toBe(-1);
    expect(screen.getAllByText("Coming Soon")).toHaveLength(2);
  });

  it("does not navigate or select when a disabled framework is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /GDPR/ }));
    // No audit-type selector appears: selection state did not advance.
    expect(screen.queryByRole("radiogroup", { name: "Audit type" })).toBeNull();
    // Still on the simulator route.
    expect(screen.queryByRole("button", { name: "Run Assessment" })).toBeTruthy();
  });

  it("keeps Run Assessment disabled until a live framework and audit type are selected", async () => {
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

  it("navigates to /learning with no query string on Run Assessment", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /ISO 27001:2022/ }));
    await user.click(screen.getByLabelText("New Audit"));
    await user.click(screen.getByRole("button", { name: "Run Assessment" }));

    // Landed on /learning with a clean URL — no dead framework/audit_type params.
    expect(screen.getByTestId("location").textContent).toBe("/learning");
  });
});
