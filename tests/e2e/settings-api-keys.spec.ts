import { expect, test } from "@playwright/test";

test("api key lifecycle: create, reveal once, revoke", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("API keys", { exact: true })).toBeVisible();

  // CREATE — fill form and submit
  const name = `e2e-${Date.now()}`;
  await page.getByLabel("Key name").fill(name);
  await page.getByRole("button", { name: "Create API key" }).click();

  // REVEAL — banner with full secret + copy button should appear exactly once
  const banner = page.getByText(/Save this secret/);
  await expect(banner).toBeVisible();

  // The new key appears in the list
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();

  // Dismiss the reveal banner — secret disappears, only prefix remains
  await page.getByRole("button", { name: /I.{1,3}ve saved it/ }).click();
  await expect(banner).not.toBeVisible();

  // REVOKE — open confirm dialog and confirm
  await row.getByRole("button", { name: `Revoke API key ${name}` }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Revoke", exact: true }).click();

  // Row now shows "Revoked" badge and the revoke action is gone
  const revokedRow = page.getByRole("listitem").filter({ hasText: name });
  await expect(revokedRow.getByText("Revoked")).toBeVisible();
  await expect(
    revokedRow.getByRole("button", { name: `Revoke API key ${name}` }),
  ).toHaveCount(0);
});

test("blocks creating a key with no scopes", async ({ page }) => {
  await page.goto("/settings");

  const name = `no-scopes-${Date.now()}`;
  await page.getByLabel("Key name").fill(name);

  // Uncheck all scope boxes
  for (const label of ["Read notes", "Write notes", "Read tags"]) {
    const checkbox = page.getByRole("checkbox", { name: label });
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }

  await page.getByRole("button", { name: "Create API key" }).click();
  await expect(page.getByText("Select at least one scope.")).toBeVisible();
});
