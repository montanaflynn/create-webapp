import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { eq, sql } from "drizzle-orm";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { user, note, noteTag, tag } from "../src/lib/db/schema";

const SEED_EMAIL = "user@example.com";
const SEED_PASSWORD = "password@123";
const SEED_NAME = "Demo User";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "password@123";
const ADMIN_NAME = "Admin User";

type SeedNote = {
  title: string;
  content: string;
  tags: string[];
  /** Days before `now` that the row's createdAt should be set to. */
  createdDaysAgo: number;
  /** Days before `now` for updatedAt. Defaults to `createdDaysAgo`. */
  updatedDaysAgo?: number;
};

const SEED_NOTES: Array<SeedNote> = [
  {
    title: "Welcome to create-webapp",
    content:
      "This note was seeded into a fresh PGlite database. Sign in with user@example.com / password@123 to land here.",
    tags: ["welcome", "starter", "intro"],
    createdDaysAgo: 90,
    updatedDaysAgo: 0.1,
  },
  {
    title: "Notes have tags now",
    content:
      "Tags live on a separate `tag` table joined via `note_tag`. Open the editor and try the autocomplete — type a new word to create a tag inline.",
    tags: ["tags", "schema", "drizzle", "ux", "demo"],
    createdDaysAgo: 78,
  },
  {
    title: "Try the dark theme",
    content:
      "Open the user dropdown in the header and switch theme. next-themes injects a sync script before paint, so there's no flash.",
    tags: ["ui", "theming", "design"],
    createdDaysAgo: 62,
    updatedDaysAgo: 14,
  },
  {
    title: "Edits stay on the page",
    content:
      "Save here and you'll see a toast — no redirect. Compare with creating a new note, which redirects to the list. Stripe/Linear pattern.",
    tags: ["ux"],
    createdDaysAgo: 45,
    updatedDaysAgo: 4,
  },
  {
    title: "Idempotent seed",
    content:
      "Running db:seed wipes this user's notes and re-inserts. Tag rows persist — your autocomplete vocabulary survives a reseed.",
    tags: ["starter"],
    createdDaysAgo: 40,
  },
  {
    title: "PGlite persists to disk",
    content:
      "Restart Node, restart your laptop — ./pgdata is real Postgres data files. To reset: rm -rf pgdata && db:migrate && db:seed.",
    tags: ["pglite", "starter", "db", "performance"],
    createdDaysAgo: 35,
    updatedDaysAgo: 7,
  },
  {
    title: "Server-side sort lives in the URL — click a column header to refetch with new ?sort and ?dir params",
    content:
      "No client-side sorting state. The page reads sort and dir from search params, validates them, and translates to a Drizzle orderBy.",
    tags: ["ux", "tables", "sort", "pagination"],
    createdDaysAgo: 28,
    updatedDaysAgo: 0.5,
  },
  {
    title: "Server-side pagination via ?page= with COUNT(*) plus offset and a clamp to a valid range",
    content:
      "Page size is 10. Visiting ?page=99 on a 2-page set redirects you to the last real page rather than rendering empty.",
    tags: ["pagination", "tables", "performance"],
    createdDaysAgo: 21,
  },
  {
    title: "Tag chips are clickable",
    content:
      "Every chip is a Link to /dashboard?tag=… The card uses the stretched-link pattern so the title link still covers the rest of the card.",
    tags: ["ux", "tags", "navigation", "design", "polish"],
    createdDaysAgo: 14,
    updatedDaysAgo: 2,
  },
  {
    title: "Filter by tag in the URL",
    content:
      "?tag=foo on /dashboard runs a join-by-id query so sort + pagination keep working. Click a chip; clear with the × on the filter pill.",
    tags: ["tags", "filter", "ux"],
    createdDaysAgo: 7,
  },
  {
    title: "Forms across the app use React Hook Form + Zod resolver + shadcn's Field wrapper",
    content:
      "Same Zod schema runs client-side via zodResolver and server-side via safeParse. One source of truth, one set of error messages.",
    tags: ["forms", "validation"],
    createdDaysAgo: 4,
  },
  {
    title: "Drone log idea",
    content:
      "When swapping the schema for the take-home, the note table maps cleanly to a flight log: title → flight name, content → notes, tags → conditions.",
    tags: ["drone", "interview", "idea"],
    createdDaysAgo: 1,
  },
  {
    title: "Architecture cheat-sheet for the take-home",
    content: `Stack the interviewer will likely care about:

- Next.js App Router with server actions for writes. Keep the action right next to the page that uses it; don't reach for tRPC or a separate API route unless the action is shared by multiple clients.
- Drizzle's relational query API for reads when the shape involves joins (\`db.query.note.findMany({ with: { ... } })\`). Drop to \`db.select(...)\` when you need GROUP BY, window functions, or anything the relational API can't express.
- Server-side state in URL params for list controls. Sort, filter, pagination, view mode — all read from the URL on the server, all updated by navigating to a new URL. No useEffect, no client list state.
- Forms via React Hook Form + Zod resolver. The same Zod schema validates client-side and server-side. One source of truth, one set of error messages.

Things that look small but interviewers notice:

- Auth boundaries on every write (\`eq(table.userId, userId)\` in the WHERE, not just in business logic).
- Validation at the server boundary even when the client also validates (\`safeParse\` in actions).
- Cancel buttons that go somewhere sensible (read view if there's one; list page otherwise).
- Disabled buttons with the right cursor (\`cursor-not-allowed\`, not \`pointer-events-none\`).
- Save behavior matched to the route shape: settings forms stay on the page, edit forms with read counterparts redirect.

Things that bite you under time pressure:

- Forgetting that \`params\` and \`searchParams\` are now Promises in Next 16.
- Thinking \`onConflictDoNothing\` returns the existing row — it doesn't; use \`onConflictDoUpdate\` with a no-op set.
- Letting the table column widths sum to exactly 100% with table-fixed and getting horizontal scroll.
- Validating only on the client and forgetting the server.

Plan B if the take-home prompt has no obvious data shape: pick the noun that maps cleanest to "row with a few fields and a scoped many-to-many". The notes/tags pattern in this template ports directly to flights/conditions, recipes/ingredients, workouts/exercises, etc.`,
    tags: ["interview", "architecture", "drone", "notes-to-self", "idea"],
    createdDaysAgo: 0.5,
  },
];

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

async function ensureUser(email: string, password: string, name: string) {
  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  if (existing) {
    console.log(`✓ user ${email} already exists`);
    return existing.id;
  }
  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });
  console.log(`✓ created user ${email} (password: ${password})`);
  return result.user.id;
}

async function main() {
  const userId = await ensureUser(SEED_EMAIL, SEED_PASSWORD, SEED_NAME);
  const adminId = await ensureUser(ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME);

  // Promote admin if not already.
  await db
    .update(user)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(user.id, adminId));
  console.log(`✓ ${ADMIN_EMAIL} has admin role`);

  // Idempotent: wipe this user's existing notes and re-seed. Tag rows persist
  // (matches the production behaviour — autocomplete vocabulary survives).
  await db.delete(note).where(eq(note.userId, userId));

  for (const n of SEED_NOTES) {
    const noteId = crypto.randomUUID();
    const createdAt = daysAgo(n.createdDaysAgo);
    const updatedAt = daysAgo(n.updatedDaysAgo ?? n.createdDaysAgo);
    await db.transaction(async (tx) => {
      await tx.insert(note).values({
        id: noteId,
        userId,
        title: n.title,
        content: n.content,
        createdAt,
        updatedAt,
      });
      if (n.tags.length === 0) return;

      const upserted = await tx
        .insert(tag)
        .values(
          n.tags.map((name) => ({ id: crypto.randomUUID(), userId, name })),
        )
        .onConflictDoUpdate({
          target: [tag.userId, tag.name],
          set: { name: sql`EXCLUDED.name` },
        })
        .returning({ id: tag.id });

      await tx
        .insert(noteTag)
        .values(upserted.map(({ id }) => ({ noteId, tagId: id })));
    });
  }

  console.log(`✓ seeded ${SEED_NOTES.length} notes`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
