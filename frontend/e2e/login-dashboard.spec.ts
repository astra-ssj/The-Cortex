import { test, expect } from "@playwright/test";

const API_HEALTH = process.env.CORTEX_API_HEALTH_URL ?? "http://127.0.0.1:8000/health";

test("demo admin login reaches the Audit Simulator", async ({ page, request }) => {
  let apiOk = false;
  try {
    const health = await request.get(API_HEALTH);
    apiOk = health.ok();
  } catch {
    apiOk = false;
  }
  test.skip(!apiOk, `API not reachable at ${API_HEALTH} — start the API for full-stack E2E.`);

  await page.goto("/login");

  await page.getByLabel("Email").fill("admin@astralabs.com");
  await page.getByLabel("Password", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/audit-simulator/, { timeout: 30_000 });

  const skipTour = page.getByRole("button", { name: "Skip" });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  await expect(
    page.getByLabel("Page header").getByRole("heading", { name: "Audit Simulator" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Framework selector" })).toBeVisible();
});
