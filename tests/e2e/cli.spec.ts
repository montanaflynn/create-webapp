import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const ROOT = path.resolve(__dirname, "..", "..");
const KEYS_PATH = path.join(__dirname, ".api-keys.json");

let fullKey: string;

test.beforeAll(async () => {
  const raw = await readFile(KEYS_PATH, "utf8");
  const keys = JSON.parse(raw) as Record<string, string>;
  fullKey = keys["test-full"];
});

type RunResult = { code: number; stdout: string; stderr: string };

function runCli(
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const proc = spawn("npx", ["tsx", "scripts/cli.ts", ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        CWA_BASE_URL: "http://localhost:3001",
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

test.describe("CLI", () => {
  test("fails fast when CWA_API_KEY is missing", async () => {
    const r = await runCli(["notes", "list"], { CWA_API_KEY: undefined });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("CWA_API_KEY");
  });

  test("notes list --json returns parseable JSON with notes array", async () => {
    const r = await runCli(["notes", "list", "--json"], {
      CWA_API_KEY: fullKey,
    });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.notes)).toBe(true);
    expect(typeof parsed.total).toBe("number");
  });

  test("notes list (no --json) renders a table", async () => {
    const r = await runCli(["notes", "list"], { CWA_API_KEY: fullKey });
    expect(r.code).toBe(0);
    // Either has the header row, or "No notes." for an empty user.
    expect(r.stdout).toMatch(/^(id\s+title|No notes\.)/);
  });

  test("create → get → delete round-trip", async () => {
    const create = await runCli(
      [
        "notes",
        "create",
        "--title",
        "From CLI",
        "--content",
        "Created via cwa.",
        "--tag",
        "cli-test",
        "--json",
      ],
      { CWA_API_KEY: fullKey },
    );
    expect(create.code).toBe(0);
    const created = JSON.parse(create.stdout) as { id: string; title: string };
    expect(created.title).toBe("From CLI");

    const got = await runCli(["notes", "get", created.id, "--json"], {
      CWA_API_KEY: fullKey,
    });
    expect(got.code).toBe(0);
    expect(JSON.parse(got.stdout).id).toBe(created.id);

    const del = await runCli(["notes", "delete", created.id], {
      CWA_API_KEY: fullKey,
    });
    expect(del.code).toBe(0);
    expect(del.stdout).toContain(`deleted ${created.id}`);

    const after = await runCli(["notes", "get", created.id, "--json"], {
      CWA_API_KEY: fullKey,
    });
    expect(after.code).toBe(1);
    expect(after.stderr.toLowerCase()).toContain("not found");
  });

  test("tags list --json returns tags array", async () => {
    const r = await runCli(["tags", "list", "--json"], {
      CWA_API_KEY: fullKey,
    });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.tags)).toBe(true);
  });
});
