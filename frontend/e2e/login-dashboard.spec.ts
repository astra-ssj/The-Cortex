import { test, expect } from "@playwright/test";

test("new learner registration reaches diagnostic onboarding", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.invalid`;

  await page.goto("/register");
  await page.getByLabel("Company Name").fill("Astra E2E Learning");
  await page.getByLabel("Full Name").fill("E2E Learner");
  await page.getByLabel("Work Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("E2E-Learner-2026!");
  await page.getByLabel("Confirm Password").fill("E2E-Learner-2026!");
  await page.getByRole("button", { name: "Create Account →" }).click();

  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Learner diagnostic" })).toBeVisible();
});
