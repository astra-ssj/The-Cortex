import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoWcagViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function authenticate(page: Page): Promise<void> {
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.setItem("cortex_token", "accessibility-test-token");
    localStorage.setItem(
      "cortex_user",
      JSON.stringify({
        name: "Accessibility Tester",
        role: "ADMIN",
        org_id: "test-org",
        onboarding_complete: true,
      }),
    );
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    const body = url.includes("learning-plan")
      ? { practices: [], tracks: [] }
      : url.includes("practices")
        ? []
        : { users: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

test.describe("WCAG 2.2 AA release gate", () => {
  for (const route of ["/login", "/register"]) {
    test(`${route} has no automated WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoWcagViolations(page);
    });
  }

  for (const route of ["/practices", "/help"]) {
    test(`${route} has no automated WCAG A/AA violations`, async ({ page }) => {
      await authenticate(page);
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      await expectNoWcagViolations(page);
    });
  }

  test("keyboard users can reach and operate registration", async ({ page }) => {
    await page.goto("/register");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Invite token (optional)")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Company Name")).toBeFocused();
    await page.getByRole("button", { name: /create account/i }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Company Name")).toBeFocused();
    await expect(page.getByLabel("Company Name")).toHaveAttribute("aria-invalid", "true");
  });

  test("mobile navigation works at 320 CSS pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await authenticate(page);
    await page.goto("/help");
    const menu = page.getByRole("button", { name: "Open navigation menu" });
    await menu.click();
    await expect(page.getByRole("navigation", { name: "Application sections" })).toBeVisible();
    await page.getByRole("link", { name: "Practices" }).click();
    await expect(page).toHaveURL(/\/practices$/);
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
  });
});
