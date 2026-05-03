import { expect, test } from "@playwright/test";

test("notes with tags: create, render as badges on read view, filter by tag", async ({
  page,
}) => {
  const stamp = Date.now();
  const title = `Tagged note ${stamp}`;
  const tag = `t${stamp}`;

  // CREATE — fill the form and commit one new tag via the combobox dropdown.
  // We click the "Create '<tag>'" option rather than press Enter; Enter is
  // racy here (sometimes commits the chip, sometimes falls through to form
  // submit depending on whether the dropdown is open in time).
  await page.goto("/dashboard/notes/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Body").fill("Body");

  const tagsInput = page.locator("#tags");
  await tagsInput.click();
  await tagsInput.pressSequentially(tag);
  await page.getByRole("option").filter({ hasText: tag }).click();

  await page.getByRole("button", { name: "Create", exact: true }).click();

  // READ — open the note, assert the tag renders as a Badge link
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("link", { name: tag })).toBeVisible();

  // FILTER — clicking the tag badge navigates to /dashboard?tag=…
  await page.getByRole("link", { name: tag }).click();
  await expect(page).toHaveURL(new RegExp(`\\?tag=${tag}(?:&|$)`));
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // Cleanup so re-runs stay deterministic
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
});
