import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

const KEYS_PATH = path.join(__dirname, ".api-keys.json");

let fullKey: string;
let readonlyKey: string;

test.beforeAll(async () => {
  const raw = await readFile(KEYS_PATH, "utf8");
  const keys = JSON.parse(raw) as Record<string, string>;
  fullKey = keys["test-full"];
  readonlyKey = keys["test-readonly"];
});

let nextId = 1;

async function rpc(
  request: APIRequestContext,
  bearer: string,
  method: string,
  params?: unknown,
) {
  const r = await request.post("/api/mcp", {
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: nextId++, method, params },
  });
  expect(r.status()).toBe(200);
  return r.json();
}

async function initialize(request: APIRequestContext, bearer: string) {
  return rpc(request, bearer, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "playwright", version: "1.0.0" },
  });
}

test.describe("MCP /api/mcp — auth", () => {
  test("rejects missing Authorization (401)", async ({ request }) => {
    const r = await request.post("/api/mcp", {
      headers: { "Content-Type": "application/json" },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(r.status()).toBe(401);
  });

  test("rejects invalid bearer (401)", async ({ request }) => {
    const r = await request.post("/api/mcp", {
      headers: {
        Authorization: "Bearer cwa_nope",
        "Content-Type": "application/json",
      },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(r.status()).toBe(401);
  });
});

test.describe("MCP /api/mcp — tools", () => {
  test("initialize → tools/list returns the expected toolset", async ({
    request,
  }) => {
    const init = await initialize(request, fullKey);
    expect(init.result.serverInfo.name).toBe("create-webapp");

    const listed = await rpc(request, fullKey, "tools/list");
    const names = (listed.result.tools as { name: string }[]).map((t) => t.name).sort();
    expect(names).toEqual([
      "notes_create",
      "notes_delete",
      "notes_get",
      "notes_list",
      "notes_update",
      "tags_list",
    ]);
  });

  test("notes_list returns the user's notes", async ({ request }) => {
    await initialize(request, fullKey);
    const r = await rpc(request, fullKey, "tools/call", {
      name: "notes_list",
      arguments: { pageSize: 100 },
    });
    expect(r.result.isError).toBeFalsy();
    const structured = r.result.structuredContent;
    expect(typeof structured.total).toBe("number");
    expect(Array.isArray(structured.notes)).toBe(true);
  });

  test("notes_create then notes_get → notes_delete", async ({ request }) => {
    await initialize(request, fullKey);

    const created = await rpc(request, fullKey, "tools/call", {
      name: "notes_create",
      arguments: {
        title: "MCP test note",
        content: "Created via MCP.",
        tags: ["mcp", "test"],
      },
    });
    expect(created.result.isError).toBeFalsy();
    const id = created.result.structuredContent.id as string;
    expect(typeof id).toBe("string");

    const got = await rpc(request, fullKey, "tools/call", {
      name: "notes_get",
      arguments: { id },
    });
    expect(got.result.structuredContent.title).toBe("MCP test note");
    expect(got.result.structuredContent.tags).toEqual(["mcp", "test"]);

    const del = await rpc(request, fullKey, "tools/call", {
      name: "notes_delete",
      arguments: { id },
    });
    expect(del.result.structuredContent.deleted).toBe(true);

    // Get after delete → tool returns isError + not_found
    const after = await rpc(request, fullKey, "tools/call", {
      name: "notes_get",
      arguments: { id },
    });
    expect(after.result.isError).toBe(true);
    const errBody = JSON.parse(after.result.content[0].text);
    expect(errBody.error.code).toBe("not_found");
  });

  test("readonly key cannot create (forbidden)", async ({ request }) => {
    await initialize(request, readonlyKey);
    const r = await rpc(request, readonlyKey, "tools/call", {
      name: "notes_create",
      arguments: { title: "x", content: "y", tags: [] },
    });
    expect(r.result.isError).toBe(true);
    const body = JSON.parse(r.result.content[0].text);
    expect(body.error.code).toBe("forbidden");
  });

  test("validation errors surface as tool errors", async ({ request }) => {
    await initialize(request, fullKey);
    // Empty title fails the SDK's input schema (z.string().trim().min(1)).
    // The SDK enforces this at the protocol boundary before our tool runs —
    // exactly the right place for it. The result is still a tool error;
    // only the error format differs from a service-level ValidationError.
    const r = await rpc(request, fullKey, "tools/call", {
      name: "notes_create",
      arguments: { title: "", content: "x", tags: [] },
    });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/title|invalid/i);
  });

  test("tags_list returns tag/count entries", async ({ request }) => {
    await initialize(request, fullKey);
    const r = await rpc(request, fullKey, "tools/call", {
      name: "tags_list",
      arguments: {},
    });
    expect(r.result.isError).toBeFalsy();
    expect(Array.isArray(r.result.structuredContent.tags)).toBe(true);
  });
});
