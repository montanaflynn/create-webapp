import path from "node:path";
import { test as setup, expect } from "@playwright/test";

const authFile = path.join(__dirname, ".auth/user.json");

setup("authenticate as seeded user", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("password@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // First request to /api/auth/[...all] triggers a Turbopack compile (~5s on
  // CI cold start) before the redirect fires — give it room.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.context().storageState({ path: authFile });
});
