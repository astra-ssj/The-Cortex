/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WelcomeTour } from "./WelcomeTour";
import { TOUR_REPLAY_EVENT, TOUR_STORAGE_KEY } from "../lib/welcomeTour";

/** jsdom in this project does not provide localStorage. */
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
  delete document.documentElement.dataset.welcomeTour;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.welcomeTour;
});

describe("WelcomeTour", () => {
  it("shows the overlay on first visit when the storage key is missing", () => {
    render(<WelcomeTour />);
    const dialog = screen.getByRole("dialog", { name: "Welcome to Astra GRC" });
    expect(dialog).toBeTruthy();
    expect(dialog.textContent ?? "").toContain("1 / 6");
  });

  it("writes astra_grc_tour_done and closes on Skip", async () => {
    const user = userEvent.setup();
    render(<WelcomeTour />);
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(localStorage.getItem(TOUR_STORAGE_KEY)).toBe("1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show the overlay when the tour is already done", () => {
    localStorage.setItem(TOUR_STORAGE_KEY, "1");
    render(<WelcomeTour />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reopens on astra:replay-tour without requiring the key to be cleared first", async () => {
    localStorage.setItem(TOUR_STORAGE_KEY, "1");
    render(<WelcomeTour />);
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => {
      window.dispatchEvent(new Event(TOUR_REPLAY_EVENT));
    });

    expect(screen.getByRole("dialog", { name: "Welcome to Astra GRC" })).toBeTruthy();
    expect(localStorage.getItem(TOUR_STORAGE_KEY)).toBe("1");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
