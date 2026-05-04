import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const KEYS_PATH = path.join(__dirname, ".api-keys.json");

let noScopeKey: string;

test.beforeAll(async () => {
  const raw = await readFile(KEYS_PATH, "utf8");
  const keys = JSON.parse(raw) as Record<string, string>;
  // Uses the no-scope key so we don't drain the full key's bucket. Auth
  // verification + rate-limit consumption happen before the scope check, so
  // rate-limited responses still race ahead of the eventual 403.
  noScopeKey = keys["test-no-scope"];
});

test.describe("rate limit", () => {
  test("hammered endpoint returns 429 with Retry-After + rate_limited code", async ({
    request,
  }) => {
    const auth = { Authorization: `Bearer ${noScopeKey}` };
    const responses = await Promise.all(
      Array.from({ length: 120 }, () =>
        request.get("/api/v1/notes", { headers: auth }),
      ),
    );

    const limited = responses.filter((r) => r.status() === 429);
    expect(limited.length).toBeGreaterThan(0);

    const first = limited[0];
    expect(first.headers()["retry-after"]).toMatch(/^\d+$/);
    const body = await first.json();
    expect(body.error.code).toBe("rate_limited");
  });
});
