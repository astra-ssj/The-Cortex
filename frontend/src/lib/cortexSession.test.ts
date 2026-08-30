/** @vitest-environment jsdom */

import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { revokeCurrentSession } from "../api/client";
import {
  CORTEX_STORAGE_KEYS,
  logoutCortexBrowserSession,
} from "./cortexSession";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key(index) {
      let current = 0;
      for (const key of values.keys()) {
        if (current === index) return key;
        current += 1;
      }
      return null;
    },
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("logoutCortexBrowserSession", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("revokes before clearing all session state and query data", async () => {
    const queryClient = new QueryClient();
    for (const key of CORTEX_STORAGE_KEYS) localStorage.setItem(key, `${key}-value`);
    queryClient.setQueryData(["private-data"], { secret: true });

    const revoke = vi.fn(async () => {
      expect(localStorage.getItem("cortex_refresh_token")).toBeTruthy();
      expect(queryClient.getQueryData(["private-data"])).toEqual({ secret: true });
    });

    await logoutCortexBrowserSession(queryClient, revoke);

    expect(revoke).toHaveBeenCalledOnce();
    for (const key of CORTEX_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("clears browser and query state when backend revocation fails", async () => {
    const queryClient = new QueryClient();
    localStorage.setItem("cortex_token", "access");
    localStorage.setItem("cortex_refresh_token", "refresh");
    localStorage.setItem("cortex_learning_session_id", "learning-session");
    queryClient.setQueryData(["private-data"], { secret: true });

    await expect(
      logoutCortexBrowserSession(queryClient, async () => {
        throw new Error("offline");
      }),
    ).resolves.toBeUndefined();

    expect(localStorage.length).toBe(0);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("revokeCurrentSession", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("posts the refresh token with the current bearer token", async () => {
    localStorage.setItem("cortex_token", "access-token");
    localStorage.setItem("cortex_refresh_token", "refresh-token");
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(null, { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await revokeCurrentSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(String(url)).toContain("/api/v1/auth/logout");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer access-token",
      },
      body: JSON.stringify({ refresh_token: "refresh-token" }),
    });
  });
});
