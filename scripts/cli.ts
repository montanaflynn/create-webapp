#!/usr/bin/env -S npx tsx
import { parseArgs } from "node:util";

const HELP = `cwa — create-webapp CLI

Usage:
  cwa <resource> <verb> [options]

Resources:
  notes list   [--tag <tag>] [--sort title|created|updated] [--dir asc|desc]
               [--page N] [--page-size N] [--json]
  notes get    <id> [--json]
  notes create --title <t> --content <c> [--tag <tag>...] [--json]
  notes update <id> --title <t> --content <c> [--tag <tag>...] [--json]
  notes delete <id>
  tags  list   [--json]

Environment:
  CWA_API_KEY    required, full key secret (cwa_...)
  CWA_BASE_URL   optional, default http://localhost:3000

Use --json to emit raw JSON for piping (e.g. into jq).
`;

type ApiResult = unknown;

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const key = process.env.CWA_API_KEY;
  if (!key) {
    process.stderr.write("error: CWA_API_KEY is not set.\n");
    process.exit(2);
  }
  const base = (process.env.CWA_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string } })
      ?.error;
    const msg = err?.message ?? `HTTP ${res.status}`;
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
  }
  return json;
}

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  notes: Note[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type Tag = { name: string; count: number };

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function renderTable(rows: string[][], headers: string[]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  const out: string[] = [];
  out.push(line(headers));
  out.push(line(widths.map((w) => "-".repeat(w))));
  for (const r of rows) out.push(line(r));
  return out.join("\n");
}

function formatNotesTable(list: ListResponse): string {
  if (list.notes.length === 0) {
    return `No notes. (page ${list.page}/${list.totalPages || 1}, total ${list.total})`;
  }
  const rows = list.notes.map((n) => [
    n.id,
    truncate(n.title, 40),
    n.tags.join(", "),
    n.updatedAt.slice(0, 19).replace("T", " "),
  ]);
  const table = renderTable(rows, ["id", "title", "tags", "updated"]);
  return `${table}\n\npage ${list.page}/${list.totalPages || 1}  total ${list.total}`;
}

function formatTagsTable(tags: Tag[]): string {
  if (tags.length === 0) return "No tags.";
  const rows = tags.map((t) => [t.name, String(t.count)]);
  return renderTable(rows, ["name", "count"]);
}

function emit(value: unknown, asJson: boolean, formatter?: () => string): void {
  if (asJson || !formatter) {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  } else {
    process.stdout.write(formatter() + "\n");
  }
}

async function notesList(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    strict: true,
    options: {
      tag: { type: "string" },
      sort: { type: "string" },
      dir: { type: "string" },
      page: { type: "string" },
      "page-size": { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  const qs = new URLSearchParams();
  if (values.tag) qs.set("tag", values.tag);
  if (values.sort) qs.set("sort", values.sort);
  if (values.dir) qs.set("dir", values.dir);
  if (values.page) qs.set("page", values.page);
  if (values["page-size"]) qs.set("pageSize", values["page-size"]);
  const path = qs.toString() ? `/api/v1/notes?${qs}` : "/api/v1/notes";
  const list = (await api("GET", path)) as ListResponse;
  emit(list, values.json ?? false, () => formatNotesTable(list));
}

async function notesGet(rest: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: rest,
    strict: true,
    allowPositionals: true,
    options: { json: { type: "boolean", default: false } },
  });
  const id = positionals[0];
  if (!id) {
    process.stderr.write("error: notes get requires <id>.\n");
    process.exit(2);
  }
  const note = (await api("GET", `/api/v1/notes/${encodeURIComponent(id)}`)) as Note;
  emit(note, values.json ?? false);
}

async function notesCreate(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    strict: true,
    options: {
      title: { type: "string" },
      content: { type: "string" },
      tag: { type: "string", multiple: true },
      json: { type: "boolean", default: false },
    },
  });
  if (!values.title || !values.content) {
    process.stderr.write(
      "error: notes create requires --title and --content.\n",
    );
    process.exit(2);
  }
  const note = (await api("POST", "/api/v1/notes", {
    title: values.title,
    content: values.content,
    tags: values.tag ?? [],
  })) as Note;
  emit(note, values.json ?? false);
}

async function notesUpdate(rest: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: rest,
    strict: true,
    allowPositionals: true,
    options: {
      title: { type: "string" },
      content: { type: "string" },
      tag: { type: "string", multiple: true },
      json: { type: "boolean", default: false },
    },
  });
  const id = positionals[0];
  if (!id) {
    process.stderr.write("error: notes update requires <id>.\n");
    process.exit(2);
  }
  if (!values.title || !values.content) {
    process.stderr.write(
      "error: notes update requires --title and --content (PATCH replaces all editable fields).\n",
    );
    process.exit(2);
  }
  const note = (await api("PATCH", `/api/v1/notes/${encodeURIComponent(id)}`, {
    title: values.title,
    content: values.content,
    tags: values.tag ?? [],
  })) as Note;
  emit(note, values.json ?? false);
}

async function notesDelete(rest: string[]): Promise<void> {
  const { positionals } = parseArgs({
    args: rest,
    strict: true,
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id) {
    process.stderr.write("error: notes delete requires <id>.\n");
    process.exit(2);
  }
  await api("DELETE", `/api/v1/notes/${encodeURIComponent(id)}`);
  process.stdout.write(`deleted ${id}\n`);
}

async function tagsList(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    strict: true,
    options: { json: { type: "boolean", default: false } },
  });
  const body = (await api("GET", "/api/v1/tags")) as { tags: Tag[] };
  emit(body, values.json ?? false, () => formatTagsTable(body.tags));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    return;
  }
  const [resource, verb, ...rest] = argv;
  const dispatch: Record<string, (rest: string[]) => Promise<void>> = {
    "notes.list": notesList,
    "notes.get": notesGet,
    "notes.create": notesCreate,
    "notes.update": notesUpdate,
    "notes.delete": notesDelete,
    "tags.list": tagsList,
  };
  const handler = dispatch[`${resource}.${verb}`];
  if (!handler) {
    process.stderr.write(`error: unknown command "${resource} ${verb}".\n\n`);
    process.stdout.write(HELP);
    process.exit(2);
  }
  await handler(rest);
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
