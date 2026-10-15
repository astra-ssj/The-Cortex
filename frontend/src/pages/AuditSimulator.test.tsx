/** @vitest-environment jsdom */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
  it("enables ISO 27001, GDPR, and SOC 2 frameworks for audit simulation", () => {
    renderPage();

    const iso = screen.getByRole("button", { name: /ISO 27001:2022/ });
    const gdpr = screen.getByRole("button", { name: /GDPR/ });
    const soc2 = screen.getByRole("button", { name: /SOC 2/ });

    expect(iso.getAttribute("aria-disabled")).toBe("false");
    expect(gdpr.getAttribute("aria-disabled")).toBe("false");
    expect(soc2.getAttribute("aria-disabled")).toBe("false");
    expect(iso.tabIndex).toBe(0);
    expect(gdpr.tabIndex).toBe(0);
    expect(soc2.tabIndex).toBe(0);
    expect(screen.queryByText("Coming Soon")).toBeNull();
  });

  it("selects GDPR and carries the framework and audit type into /learning on Start simulation", async () => {
    const user = userEvent.setup();
    renderPage();

    const run = screen.getByRole("button", { name: "Start simulation" });
    expect((run as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: /GDPR/ }));
    const group1 = screen.getByRole("radiogroup", { name: "Audit type" });
    expect(group1).toBeTruthy();
    expect((run as HTMLButtonElement).disabled).toBe(true);

    await user.click(within(group1).getByLabelText("Routine Inspection"));
    expect((run as HTMLButtonElement).disabled).toBe(false);

    await user.click(run);
    expect(screen.getByTestId("location").textContent).toBe(
      "/learning?framework=gdpr-2016-679&audit_type=routine_inspection",
    );
  });

  it("selects SOC 2 and carries the framework and audit type into /learning on Start simulation", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /SOC 2/ }));
    const group = screen.getByRole("radiogroup", { name: "Audit type" });
    expect(group).toBeTruthy();

    await user.click(within(group).getByLabelText("Targeted Investigation"));
    await user.click(screen.getByRole("button", { name: "Start simulation" }));

    expect(screen.getByTestId("location").textContent).toBe(
      "/learning?framework=soc2&audit_type=targeted_investigation",
    );
  });

  it("keeps Start simulation disabled until a live framework and audit type are selected", async () => {
    const user = userEvent.setup();
    renderPage();

    const run = screen.getByRole("button", { name: "Start simulation" });
    expect((run as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("radiogroup", { name: "Audit type" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /ISO 27001:2022/ }));
    const group = screen.getByRole("radiogroup", { name: "Audit type" });
    expect(group).toBeTruthy();
    expect((run as HTMLButtonElement).disabled).toBe(true);

    await user.click(within(group).getByLabelText("New Audit"));
    expect((run as HTMLButtonElement).disabled).toBe(false);
  });

  it("carries the framework and audit type into /learning on Start simulation", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /ISO 27001:2022/ }));
    const group = screen.getByRole("radiogroup", { name: "Audit type" });
    await user.click(within(group).getByLabelText("New Audit"));
    await user.click(screen.getByRole("button", { name: "Start simulation" }));

    expect(screen.getByTestId("location").textContent).toBe(
      "/learning?framework=iso27001-2022&audit_type=new_audit",
    );
  });
});
