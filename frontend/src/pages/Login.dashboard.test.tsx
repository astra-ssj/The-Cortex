/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

import Login from "./Login";

function createMemoryStorage(): Storage {
  const memory: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(memory).length;
    },
    clear() {
      for (const k of Object.keys(memory)) delete memory[k];
    },
    getItem(key: string) {
      return memory[key] ?? null;
    },
    key(index: number) {
      const keys = Object.keys(memory);
      return keys[index] ?? null;
    },
    removeItem(key: string) {
      delete memory[key];
    },
    setItem(key: string, value: string) {
      memory[key] = value;
    },
  } as Storage;
}

function LoginHarness() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route
        path="/login"
        element={<Login onSuccess={() => navigate("/dashboard", { replace: true })} />}
      />
      <Route
        path="/dashboard"
        element={
          <main>
            <h1 className="cortex-text-page-title">Compliance overview</h1>
          </main>
        }
      />
    </Routes>
  );
}

describe("Login → dashboard", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const u =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (u.includes("/api/v1/auth/token")) {
          return new Response(
            JSON.stringify({
              access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake-signature",
              org_id: "demo-org-001",
              onboarding_complete: true,
              onboarding_step: 5,
              user: {
                email: "ciso@astralabs.com",
                onboarding_complete: true,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores session and navigates to dashboard content after sign-in", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <LoginHarness />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email/i), "ciso@astralabs.com");
    await user.type(screen.getByLabelText(/^password$/i), "cortex-ciso-2026");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /compliance overview/i })).toBeTruthy();
    });
    expect(localStorage.getItem("cortex_token")).toBeTruthy();
  });
});
