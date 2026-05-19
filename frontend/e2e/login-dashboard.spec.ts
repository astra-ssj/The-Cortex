import { test, expect } from "@playwright/test";

const API_HEALTH = process.env.CORTEX_API_HEALTH_URL ?? "http://127.0.0.1:8000/health";

test("demo login reaches compliance dashboard", async ({ page, request }) => {
  let apiOk = false;
  try {
    const health = await request.get(API_HEALTH);
    apiOk = health.ok();
  } catch {
    apiOk = false;
  }
  test.skip(!apiOk, `API not reachable at ${API_HEALTH} — start uvicorn for full-stack E2E.`);

  await page.goto("/login");

  await page.getByLabel("Email").fill("ciso@astralabs.com");
  await page.getByLabel("Password", { exact: true }).fill("cortex-ciso-2026");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page.getByRole("heading", { name: "Compliance overview" })).toBeVisible({
    timeout: 30_000,
  });
});
