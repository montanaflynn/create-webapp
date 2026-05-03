import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const KEYS_PATH = path.join(__dirname, ".api-keys.json");

let fullKey: string;
let readonlyKey: string;
let noScopeKey: string;

test.beforeAll(async () => {
  const raw = await readFile(KEYS_PATH, "utf8");
  const keys = JSON.parse(raw) as Record<string, string>;
  fullKey = keys["test-full"];
  readonlyKey = keys["test-readonly"];
  noScopeKey = keys["test-no-scope"];
});

test.describe("REST /api/v1 — auth", () => {
  test("rejects missing Authorization header (401)", async ({ request }) => {
    const r = await request.get("/api/v1/notes");
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body.error.code).toBe("unauthenticated");
  });

  test("rejects invalid bearer token (401)", async ({ request }) => {
    const r = await request.get("/api/v1/notes", {
      headers: { Authorization: "Bearer cwa_not_a_real_key" },
    });
    expect(r.status()).toBe(401);
    expect((await r.json()).error.code).toBe("unauthenticated");
  });

  test("rejects key without required scope (403)", async ({ request }) => {
    // noScopeKey only has tags:read; POST /notes needs notes:write.
    const r = await request.post("/api/v1/notes", {
      headers: { Authorization: `Bearer ${noScopeKey}` },
      data: { title: "x", content: "y", tags: [] },
    });
    expect(r.status()).toBe(403);
    expect((await r.json()).error.code).toBe("forbidden");
  });

  test("read-only key cannot write (403)", async ({ request }) => {
    const r = await request.post("/api/v1/notes", {
      headers: { Authorization: `Bearer ${readonlyKey}` },
      data: { title: "x", content: "y", tags: [] },
    });
    expect(r.status()).toBe(403);
  });
});

test.describe("REST /api/v1/notes — CRUD", () => {
  test("full lifecycle: create, list, get, update, delete", async ({
    request,
  }) => {
    const auth = { Authorization: `Bearer ${fullKey}` };

    // CREATE
    const create = await request.post("/api/v1/notes", {
      headers: auth,
      data: {
        title: "REST API test note",
        content: "Created via fetch.",
        tags: ["api", "test"],
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    expect(created.id).toMatch(/^[\w-]+$/);
    expect(created.title).toBe("REST API test note");
    expect(created.tags).toEqual(["api", "test"]);
    expect(typeof created.createdAt).toBe("string");

    const id = created.id as string;

    // GET single
    const get = await request.get(`/api/v1/notes/${id}`, { headers: auth });
    expect(get.status()).toBe(200);
    expect((await get.json()).title).toBe("REST API test note");

    // LIST contains it
    const list = await request.get("/api/v1/notes?pageSize=100", {
      headers: auth,
    });
    expect(list.status()).toBe(200);
    const listed = await list.json();
    expect(listed.notes.some((n: { id: string }) => n.id === id)).toBe(true);
    expect(typeof listed.total).toBe("number");

    // FILTER by tag
    const filtered = await request.get("/api/v1/notes?tag=api", {
      headers: auth,
    });
    expect(filtered.status()).toBe(200);
    const filteredBody = await filtered.json();
    expect(filteredBody.notes.every((n: { tags: string[] }) => n.tags.includes("api"))).toBe(true);

    // UPDATE
    const patch = await request.patch(`/api/v1/notes/${id}`, {
      headers: auth,
      data: {
        title: "REST API test note (edited)",
        content: "Edited via fetch.",
        tags: ["api"],
      },
    });
    expect(patch.status()).toBe(200);
    expect((await patch.json()).title).toBe("REST API test note (edited)");

    // DELETE
    const del = await request.delete(`/api/v1/notes/${id}`, { headers: auth });
    expect(del.status()).toBe(204);

    // 404 after delete
    const after = await request.get(`/api/v1/notes/${id}`, { headers: auth });
    expect(after.status()).toBe(404);
  });

  test("validation errors return 422 with issue details", async ({
    request,
  }) => {
    const r = await request.post("/api/v1/notes", {
      headers: { Authorization: `Bearer ${fullKey}` },
      data: { title: "", content: "x", tags: [] },
    });
    expect(r.status()).toBe(422);
    const body = await r.json();
    expect(body.error.code).toBe("validation_failed");
    expect(Array.isArray(body.error.details.issues)).toBe(true);
  });

});

test.describe("REST /api/v1/tags", () => {
  test("returns tags with counts", async ({ request }) => {
    const r = await request.get("/api/v1/tags", {
      headers: { Authorization: `Bearer ${readonlyKey}` },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.tags)).toBe(true);
    if (body.tags.length > 0) {
      expect(typeof body.tags[0].name).toBe("string");
      expect(typeof body.tags[0].count).toBe("number");
    }
  });
});
