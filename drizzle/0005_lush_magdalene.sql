CREATE TABLE "pending_email_change" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"new_email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pending_email_change_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "pending_email_change_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "pending_email_change" ADD CONSTRAINT "pending_email_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;