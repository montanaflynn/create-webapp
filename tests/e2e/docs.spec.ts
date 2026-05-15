import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("docs index exposes AI-native docs surfaces", async ({ page }) => {
  await page.goto("/docs");

  await expect(
    page.getByRole("heading", {
      name: /Notes app documentation/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open llms.txt" })).toBeVisible();
  await expect(page.getByRole("link", { name: /openapi\.json/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Overview" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "CLI" }).first()).toBeVisible();

  const apiCard = page.getByRole("link", {
    name: /REST API Structured OpenAPI-backed reference/i,
  });
  await expect(apiCard).toBeVisible();
  await apiCard.click({ position: { x: 24, y: 52 } });
  await expect(page).toHaveURL(/\/docs\/api$/);
});

test("api docs render structured endpoint reference", async ({ page, request }) => {
  await page.goto("/docs/api");

  await expect(
    page.getByRole("heading", { name: "REST API" }).first(),
  ).toBeVisible();
  const docsNav = page.getByRole("navigation", { name: "Docs" });
  await expect(
    docsNav.getByRole("link", { name: "GET /api/v1/notes" }).first(),
  ).toBeVisible();
  await expect(page.getByText("GET", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("/api/v1/notes").first()).toBeVisible();
  await expect(page.getByText("POST", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("/api/v1/tags").first()).toBeVisible();
  await expect(page.getByText("notes:read").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared schemas" })).toBeVisible();
  await expect(page.getByText("Default", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("updated", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Responses").first()).toBeVisible();
  await expect(page.getByText("Schema: NotesListResponse")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "NotesListResponse" }).first(),
  ).toHaveAttribute("href", /#schema-NotesListResponse$/);

  const createNote = page.locator("details#createNote");
  await expect(createNote).not.toHaveAttribute("open", "");
  await createNote.locator("summary").click();
  await expect(createNote).toHaveAttribute("open", "");

  const markdown = await request.get("/docs/api.md");
  expect(markdown.status()).toBe(200);
  const markdownText = await markdown.text();
  expect(markdownText).toContain("GET /api/v1/notes");
  expect(markdownText).toContain("POST /api/v1/notes");
  expect(markdownText).toContain("GET /api/v1/tags");
});

test("docs page can be opened as markdown", async ({ page, request }) => {
  await page.goto("/docs/mcp");

  await expect(page.getByRole("heading", { name: "MCP" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open .md" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy .md" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open in Codex" }),
  ).toBeVisible();

  const markdown = await request.get("/docs/mcp.md");
  expect(markdown.status()).toBe(200);
  expect(markdown.headers()["content-type"]).toContain("text/markdown");
  await expect(markdown.text()).resolves.toMatch(/# MCP/);
});

test("llm manifest routes are public", async ({ request }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  await expect(llms.text()).resolves.toMatch(/Notes workspace/);

  const manifest = await request.get("/docs.json");
  expect(manifest.status()).toBe(200);
  const body = await manifest.json();
  expect(body.pages.map((page: { slug: string }) => page.slug)).toContain(
    "mcp",
  );
});

test("openapi route exposes the REST contract", async ({ request }) => {
  const response = await request.get("/openapi.json");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");

  const body = await response.json();
  expect(body.openapi).toBe("3.1.0");
  expect(body.paths["/api/v1/notes"]).toBeTruthy();
  expect(body.components.securitySchemes.bearerAuth).toBeTruthy();
});
