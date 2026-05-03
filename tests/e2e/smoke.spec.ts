import { expect, test } from "@playwright/test";

// Smoke explicitly tests the sign-in flow itself, so it starts unauthed.
// Other tests inherit the storageState saved by auth.setup.ts.
test.use({ storageState: { cookies: [], origins: [] } });

test("sign in lands on dashboard", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("password@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Welcome to create-webapp")).toBeVisible();
});
