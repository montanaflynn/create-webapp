import { APP_NAME, SOCIALS } from "@/lib/branding";
import { generateOpenApiMarkdown } from "@/lib/docs/openapi";

export type DocsPage = {
  slug: string;
  title: string;
  description: string;
  category: "Start" | "Use" | "Integrate" | "Operate";
  order: number;
  markdown: string;
};

export const repoUrl =
  SOCIALS.github || "https://github.com/montanaflynn/create-webapp";

export const docsPages = [
  {
    slug: "overview",
    title: "Overview",
    description:
      "What the notes app does and the surfaces available to people and agents.",
    category: "Start",
    order: 10,
    markdown: `# Overview

${APP_NAME} is a notes workspace with a web UI, REST API, CLI, and MCP server.

Use it to keep personal notes organized by tag, then let scripts or coding agents read and update the same data through scoped credentials.

## What you can do

- Create, edit, read, and delete notes
- Organize notes with reusable tags
- Browse notes as cards or a table
- Filter the dashboard by tag
- Manage profile, password, passkeys, API keys, connected MCP clients, and activity
- Connect Claude Code, Codex, OpenCode, or other MCP clients
- Use the REST API or CLI for automation
- Administer users and inspect app-captured emails from admin routes

## Main routes

- \`/\` - public home page
- \`/sign-up\` and \`/sign-in\` - account access
- \`/dashboard\` - notes list with filters, sorting, pagination, and view mode
- \`/dashboard/notes/new\` - create a note
- \`/dashboard/notes/:id\` - read a note
- \`/dashboard/notes/:id/edit\` - edit a note
- \`/tags\` - tag index with note counts
- \`/settings\` - account, API keys, connected clients, security, and activity
- \`/admin/users\` - admin-only user management
- \`/api/v1/*\` - REST API
- \`/api/mcp\` - MCP server

## Data model

Each note belongs to one user. Tags also belong to one user and are reused across that user's notes. Deleting a note removes its note-tag links, but the tag vocabulary stays available for autocomplete and future notes.
`,
  },
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Run the notes app locally and sign in with seeded accounts.",
    category: "Start",
    order: 20,
    markdown: `# Getting Started

## Run locally

\`\`\`bash
git clone ${repoUrl}
cd create-webapp
cp .env.example .env.local
openssl rand -base64 32
\`\`\`

Paste the generated value into \`BETTER_AUTH_SECRET\` in \`.env.local\`, then:

\`\`\`bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
\`\`\`

Open \`http://localhost:3000\`.

## Seeded accounts

- \`user@example.com\` / \`password@123\` - regular notes user
- \`admin@example.com\` / \`password@123\` - admin user

The seed adds sample notes with varied tags so the dashboard, table view, tag filters, and tag index have useful data immediately.

## First checks

1. Sign in as \`user@example.com\`.
2. Open \`/dashboard\`.
3. Create a note from \`/dashboard/notes/new\`.
4. Add tags like \`idea\`, \`work\`, or \`follow-up\`.
5. Visit \`/tags\` and open one tag filter.
6. Open \`/settings/api-keys\` and create a read-only key.

## Local email

Password reset and verification emails are captured by the app in local development. Open \`/dev/inbox\` to inspect them.
`,
  },
  {
    slug: "notes-and-tags",
    title: "Notes and Tags",
    description:
      "How to create notes, use tags, filter the dashboard, and preserve vocabulary.",
    category: "Use",
    order: 30,
    markdown: `# Notes and Tags

The main workspace is \`/dashboard\`. It shows your notes and keeps view state in the URL so filters and pages are shareable.

## Create a note

1. Open \`/dashboard/notes/new\`.
2. Enter a title.
3. Add optional content.
4. Add zero or more tags.
5. Save.

New tags are normalized, deduplicated, and added to your vocabulary.

## Read and edit

Opening a note goes to a read view first. Use Edit when you want to change the title, content, or tags. Saving an edit returns to the read view.

## Dashboard controls

The dashboard supports:

- Card or table view
- Sort by title, created date, or updated date
- Ascending or descending direction
- Pagination
- Tag filtering

The URL carries this state with params like \`view\`, \`sort\`, \`dir\`, \`page\`, and \`tag\`.

## Tags page

\`/tags\` lists every tag you have used with a count of current notes. Tags with zero notes can still appear because the app intentionally preserves your tag vocabulary after deleting notes.

## Delete behavior

Deleting a note removes the note and its tag links. It does not delete the tag rows themselves.
`,
  },
  {
    slug: "account-and-security",
    title: "Account and Security",
    description:
      "Manage profile details, password, passkeys, API keys, connected clients, and activity.",
    category: "Use",
    order: 40,
    markdown: `# Account and Security

\`/settings\` is the account hub.

## Profile

Use Settings -> Profile to update your display name. This name appears in the header and account menu.

## Password

Use Settings -> Security to change your password. Password reset emails go through the app mailer. In local development, reset emails appear in \`/dev/inbox\`.

## Passkeys

Passkeys let you sign in with your device's biometric or platform authenticator. You can add or remove passkeys from the security settings.

## API keys

API keys are long-lived Bearer tokens for scripts, CI, and MCP clients that cannot use OAuth.

Scopes:

- \`notes:read\` - list and read notes
- \`notes:write\` - create, update, and delete notes
- \`tags:read\` - list tags

The full key secret is shown once. After that, only the prefix is visible.

## Connected clients

OAuth-connected MCP clients appear in Settings -> MCP clients. Revoke a client when you no longer want it to access your notes.

## Activity

Settings -> Activity shows state-changing actions such as note changes, key creation, and key revocation.
`,
  },
  {
    slug: "api",
    title: "REST API",
    description:
      "Structured OpenAPI-backed reference for notes and tags over HTTP.",
    category: "Integrate",
    order: 50,
    markdown: generateOpenApiMarkdown(),
  },
  {
    slug: "cli",
    title: "CLI",
    description:
      "Use the command-line client to script notes and tags through the REST API.",
    category: "Integrate",
    order: 55,
    markdown: `# CLI

The app includes a command-line client for notes and tags. It talks to the REST API, so it uses the same API keys, scopes, validation, rate limits, and error shape as any other HTTP client.

## Configure

Create an API key from Settings -> API keys, then export it:

\`\`\`bash
export CWA_API_KEY=cwa_...
export CWA_BASE_URL=http://localhost:3000
\`\`\`

\`CWA_BASE_URL\` is optional and defaults to \`http://localhost:3000\`.

## Run

Inside the repo:

\`\`\`bash
npm run cli -- notes list
npm run cli -- notes get note_...
npm run cli -- notes create --title "Idea" --content "Ship the docs" --tag launch
npm run cli -- notes update note_... --title "Updated" --content "New body" --tag launch
npm run cli -- notes delete note_...
npm run cli -- tags list
\`\`\`

Use \`--json\` on read commands for piping:

\`\`\`bash
npm run cli -- notes list --json
npm run cli -- tags list --json
\`\`\`

## Common workflows

Quick capture:

\`\`\`bash
npm run cli -- notes create \\
  --title "Follow up" \\
  --content "Send launch notes to the team" \\
  --tag work \\
  --tag launch
\`\`\`

List notes with a tag:

\`\`\`bash
npm run cli -- notes list --tag launch
\`\`\`

Pipe notes into another tool:

\`\`\`bash
npm run cli -- notes list --json | jq '.notes[].title'
\`\`\`

## Installability

The package declares a \`cwa\` bin, but the app is currently private. For now, treat the CLI as a repo-local tool. If this becomes a public package, the same command surface can become an installable \`cwa\` executable.

See \`docs/CLI.md\` for the full command reference.
`,
  },
  {
    slug: "mcp",
    title: "MCP",
    description:
      "Connect coding agents to your notes through the built-in MCP server.",
    category: "Integrate",
    order: 60,
    markdown: `# MCP

The app exposes your notes to MCP clients at \`/api/mcp\`.

MCP clients can list notes, read notes, create notes, update notes, delete notes, and list tags. They use the same service layer and permissions as the web app and REST API.

## OAuth setup

OAuth is the preferred path for interactive clients because you do not have to paste long-lived API keys into config files.

### Claude Code

\`\`\`bash
claude mcp add --transport http create-webapp http://localhost:3000/api/mcp
\`\`\`

### Codex

\`\`\`bash
codex mcp add create-webapp --url http://localhost:3000/api/mcp
\`\`\`

### OpenCode

\`\`\`bash
opencode mcp add
opencode mcp auth create-webapp
\`\`\`

## Bearer key fallback

Create an API key from Settings -> API keys, then configure your client with:

\`\`\`json
{
  "mcpServers": {
    "create-webapp": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer cwa_..." }
    }
  }
}
\`\`\`

## Available tools

- \`notes_list\`
- \`notes_get\`
- \`notes_create\`
- \`notes_update\`
- \`notes_delete\`
- \`tags_list\`

Example agent prompts:

- List my notes tagged \`idea\`
- Create a note titled \`Release checklist\` tagged \`launch\`
- Summarize my newest notes
- Delete the note titled \`temporary scratch\`

See \`docs/MCP.md\` and \`docs/OAUTH.md\` for protocol details.
`,
  },
  {
    slug: "admin",
    title: "Admin",
    description:
      "Use admin routes to manage users without exposing private note content.",
    category: "Operate",
    order: 70,
    markdown: `# Admin

Admin users can manage accounts without reading user note content.

## Bootstrap an admin

\`\`\`bash
npm run admin:promote you@example.com
\`\`\`

You can also set \`ADMIN_USER_IDS\` to force specific user IDs into the admin role.

## User management

\`/admin/users\` lists users with account metadata and counts.

\`/admin/users/:id\` supports:

- Send password reset email
- Resend verification email
- Promote or demote role
- Ban or unban
- Delete user

Admin actions are guarded in the route layout and again inside server actions.

## Inbox

\`/admin/inbox\` shows app-captured emails in staging-style environments. It uses the same data as \`/dev/inbox\`, but is protected by admin auth.

## Privacy boundary

Admin pages intentionally do not expose note content, tag names, or session IPs.
`,
  },
  {
    slug: "deployment",
    title: "Deployment",
    description:
      "Deploy the notes app with Postgres, auth secrets, email, and migrations.",
    category: "Operate",
    order: 80,
    markdown: `# Deployment

The intended production shape is Vercel plus Postgres, usually Neon.

## Environment variables

Required:

- \`DATABASE_URL\` - production Postgres URL
- \`BETTER_AUTH_SECRET\` - fresh secret for auth
- \`BETTER_AUTH_URL\` - deployed app origin

Optional:

- \`RESEND_API_KEY\` - production email delivery
- \`EMAIL_FROM\` - sender address
- \`FORCE_TO_OVERRIDE\` - staging safety override for outgoing email
- \`ADMIN_USER_IDS\` - comma-separated admin user IDs

## Vercel and Neon

1. Push the repo to GitHub.
2. Import it into Vercel.
3. Create Neon Postgres from Vercel Storage.
4. Confirm Vercel has injected \`DATABASE_URL\`.
5. Set auth and email environment variables.
6. Run migrations against production.

\`\`\`bash
DATABASE_URL="postgres://..." npm run db:migrate
\`\`\`

## Email

Local development uses the DB inbox by default. Production should use Resend:

\`\`\`bash
RESEND_API_KEY=re_...
EMAIL_FROM="Notes <onboarding@yourdomain.com>"
\`\`\`

For staging, set \`FORCE_TO_OVERRIDE=you@example.com\` so test emails cannot reach real users.
`,
  },
] satisfies DocsPage[];

export const sortedDocsPages = [...docsPages].sort((a, b) => a.order - b.order);

export function getDocsPage(slug: string) {
  return docsPages.find((page) => page.slug === slug) ?? null;
}

export function docsPageHref(page: Pick<DocsPage, "slug">) {
  return `/docs/${page.slug}`;
}

export function docsMarkdownHref(page: Pick<DocsPage, "slug">) {
  return `/docs/${page.slug}.md`;
}

export function buildAgentPrompt(page: DocsPage) {
  return `You are working with ${APP_NAME}, a notes app with a web UI, REST API, CLI, and MCP server.

Repository: ${repoUrl}
Relevant docs page: /docs/${page.slug}
Markdown source: /docs/${page.slug}.md

First read AGENTS.md and follow the repository instructions. Then use the docs page "${page.title}" as the task context. Preserve the notes product behavior, verify changes with relevant tests, and update docs when behavior or setup changes.`;
}

export function buildAgentCommand(
  agent: "codex" | "cursor" | "claude",
  page: DocsPage,
) {
  const openCommand =
    agent === "codex" ? "codex" : agent === "cursor" ? "cursor ." : "claude";

  return `git clone ${repoUrl}
cd create-webapp
${openCommand}

Prompt:
${buildAgentPrompt(page)}`;
}

export function buildLlmsTxt() {
  const lines = [
    `# ${APP_NAME}`,
    "",
    "Notes workspace with web UI, tags, settings, admin, REST API, CLI, MCP, OAuth, and API-key access.",
    "",
    "## Product Docs",
    ...sortedDocsPages.map(
      (page) => `- [${page.title}](/docs/${page.slug}.md): ${page.description}`,
    ),
    "",
    "## Deep References",
    "- [openapi.json](/openapi.json): OpenAPI 3.1 REST API contract",
    "- [README.md](/README.md): app runbook and implementation overview",
    "- [AUTHENTICATION.md](/AUTHENTICATION.md): auth internals",
    "- [docs/API.md](/docs/API.md): REST API reference",
    "- [docs/MCP.md](/docs/MCP.md): MCP reference",
    "- [docs/OAUTH.md](/docs/OAUTH.md): OAuth reference",
    "- [docs/CLI.md](/docs/CLI.md): CLI reference",
  ];

  return `${lines.join("\n")}\n`;
}

export function buildLlmsFullTxt() {
  return `${buildLlmsTxt()}\n${sortedDocsPages
    .map((page) => `---\n\n${page.markdown.trim()}\n`)
    .join("\n")}`;
}
