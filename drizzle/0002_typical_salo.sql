CREATE TABLE "note_tag" (
	"note_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "note_tag_note_id_tag_id_pk" PRIMARY KEY("note_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_tag" ADD CONSTRAINT "note_tag_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tag" ADD CONSTRAINT "note_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_user_name_uniq" ON "tag" USING btree ("user_id","name");--> statement-breakpoint
-- Backfill: preserve any existing tag values from the array column.
INSERT INTO "tag" ("id", "user_id", "name", "created_at")
SELECT gen_random_uuid()::text, n."user_id", t.name, NOW()
FROM "note" n
CROSS JOIN LATERAL unnest(n.tags) AS t(name)
ON CONFLICT ("user_id", "name") DO NOTHING;--> statement-breakpoint
INSERT INTO "note_tag" ("note_id", "tag_id")
SELECT n."id", tg."id"
FROM "note" n
CROSS JOIN LATERAL unnest(n.tags) AS t(name)
JOIN "tag" tg ON tg."user_id" = n."user_id" AND tg."name" = t.name
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "tags";