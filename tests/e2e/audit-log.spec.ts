import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const KEYS_PATH = path.join(__dirname, ".api-keys.json");

let fullKey: string;

test.beforeAll(async () => {
  const raw = await readFile(KEYS_PATH, "utf8");
  const keys = JSON.parse(raw) as Record<string, string>;
  fullKey = keys["test-full"];
});

test("REST note creation appears in /settings audit log with key source", async ({
  page,
  request,
}) => {
  // Mint a unique title so we can find this specific row in the table.
  const title = `audit-log-test-${Date.now()}`;
  const create = await request.post("/api/v1/notes", {
    headers: { Authorization: `Bearer ${fullKey}` },
    data: { title, content: "from rest", tags: [] },
  });
  expect(create.status()).toBe(201);

  await page.goto("/settings");
  await expect(page.getByText("Activity log")).toBeVisible();

  // The row should mention "created note" and the title from metadata.
  const row = page.locator("tr").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText("created note")).toBeVisible();
  // Source should be a key badge (REST call, not a cookie session).
  await expect(row.getByText(/^key:/)).toBeVisible();
});

test("UI-driven note creation logs Web session as source", async ({
  page,
}) => {
  const title = `audit-ui-${Date.now()}`;
  await page.goto("/dashboard/notes/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Body").fill("from cookie session");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);

  await page.goto("/settings");
  const row = page.locator("tr").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText("Web session")).toBeVisible();
});
