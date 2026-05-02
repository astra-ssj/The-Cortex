import { describe, it, expect } from "vitest";
import { ALL_FRAMEWORK_IDS } from "./client";

describe("ALL_FRAMEWORK_IDS", () => {
  it("contains eight comma-separated framework ids for batch assessment runs", () => {
    const ids = ALL_FRAMEWORK_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(ids).toHaveLength(8);
  });
});
