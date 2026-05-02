import { describe, it, expect } from "vitest";

import {
  ALL_FRAMEWORK_IDS,
  FRAMEWORK_FILTER_OPTIONS,
  FRAMEWORK_IDS_ORDERED,
  frameworkIdFromFilterLabel,
  frameworkLabelFromId,
} from "./frameworkRegistry";

describe("frameworkRegistry", () => {
  it("keeps bundle order aligned with comma-separated ALL_FRAMEWORK_IDS", () => {
    expect(ALL_FRAMEWORK_IDS.split(",")).toEqual([...FRAMEWORK_IDS_ORDERED]);
  });

  it("exposes All + one label per framework id for UI filters", () => {
    expect(FRAMEWORK_FILTER_OPTIONS[0]).toBe("All");
    expect(FRAMEWORK_FILTER_OPTIONS).toHaveLength(FRAMEWORK_IDS_ORDERED.length + 1);
  });

  it("round-trips filter labels to API ids", () => {
    expect(frameworkIdFromFilterLabel("GDPR 2016/679")).toBe("gdpr-2016-679");
    expect(frameworkLabelFromId("eu-ai-act-2024")).toBe("EU AI Act 2024");
  });
});
