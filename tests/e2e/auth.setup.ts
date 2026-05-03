import path from "node:path";
import { test as setup, expect } from "@playwright/test";

const authFile = path.join(__dirname, ".auth/user.json");

setup("authenticate as seeded user", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("password@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: authFile });
});
