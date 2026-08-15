/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Settings from "./Settings";

function createMemoryStorage(): Storage {
  const memory: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(memory).length;
    },
    clear() {
      for (const k of Object.keys(memory)) delete memory[k];
    },
    getItem: (key: string) => memory[key] ?? null,
    key: (index: number) => Object.keys(memory)[index] ?? null,
    removeItem: (key: string) => {
      delete memory[key];
    },
    setItem: (key: string, value: string) => {
      memory[key] = value;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSettings(role: string) {
  localStorage.setItem("cortex_user", JSON.stringify({ role, org_id: "org-1" }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/users") && !init?.method) {
        return new Response(
          JSON.stringify({
            org_id: "org-1",
            users: [{ id: "u1", email: "admin@example.com", full_name: "Admin", role: "ADMIN", is_active: true, created_at: null }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/auth/invite") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            invite_id: "inv-1",
            email: "learner@example.com",
            role: "ANALYST",
            token: "invite-token-once",
            expires_at: "2026-08-22T00:00:00Z",
            message: "Share this token once.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Settings />
    </QueryClientProvider>,
  );
}

describe("Settings users tab", () => {
  it("lists members and shows the invite token once", async () => {
    renderSettings("admin");
    await userEvent.click(screen.getByRole("button", { name: "Users" }));
    expect(await screen.findByText("admin@example.com")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Invite email"), "learner@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Issue invite" }));
    await waitFor(() => {
      expect(screen.getByTestId("invite-token").textContent).toBe("invite-token-once");
    });
  });
});
