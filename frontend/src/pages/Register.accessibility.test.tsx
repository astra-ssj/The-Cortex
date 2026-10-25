/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import Register from "./Register";

afterEach(cleanup);

describe("Register accessibility", () => {
  it("associates validation errors and moves focus to the first invalid field", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /create account/i }));

    const company = screen.getByLabelText("Company Name");
    expect(company.getAttribute("aria-invalid")).toBe("true");
    expect(company.getAttribute("aria-describedby")).toBe("register-company_name-error");
    expect(document.activeElement).toBe(company);
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("Company name is required"))).toBe(true);
  });

  it("provides accessible names for every registration control", () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );

    for (const name of [
      "Invite token (optional)",
      "Company Name",
      "Jurisdiction",
      "Industry",
      "Full Name",
      "Work Email",
      "Password",
      "Confirm Password",
    ]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
  });
});
