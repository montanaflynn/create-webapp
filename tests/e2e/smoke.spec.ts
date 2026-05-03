import { expect, test } from "@playwright/test";

test("sign in lands on dashboard", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("password@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Welcome to create-webapp")).toBeVisible();
});
