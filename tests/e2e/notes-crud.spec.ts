import { expect, test } from "@playwright/test";

test("note lifecycle: create, view, edit, delete", async ({ page }) => {
  const title = `Test note ${Date.now()}`;
  const editedTitle = `${title} (edited)`;
  const body = "Initial body content.";
  const editedBody = "Updated body content.";

  // CREATE — redirects to /dashboard list on success
  await page.goto("/dashboard/notes/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Body").fill(body);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // READ — open the detail view
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/dashboard\/notes\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();

  // UPDATE — redirects back to the read view on save
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByLabel("Title").fill(editedTitle);
  await page.getByLabel("Body").fill(editedBody);
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .click();

  await expect(page).toHaveURL(/\/dashboard\/notes\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();
  await expect(page.getByText(editedBody)).toBeVisible();

  // DELETE — confirm dialog, then redirect to /dashboard list
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(
    page.getByRole("link", { name: editedTitle }),
  ).not.toBeVisible();
});
