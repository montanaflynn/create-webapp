CREATE TABLE "oauth_auth_code" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"refresh_expires_at" timestamp,
	"revoked_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_principal_consistent";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "oauth_token_id" text;--> statement-breakpoint
ALTER TABLE "oauth_auth_code" ADD CONSTRAINT "oauth_auth_code_client_id_oauth_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_code" ADD CONSTRAINT "oauth_auth_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_client_id_oauth_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_token_access_hash_uniq" ON "oauth_token" USING btree ("access_token_hash");--> statement-breakpoint
CREATE INDEX "oauth_token_user_id_idx" ON "oauth_token" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_oauth_token_id_oauth_token_id_fk" FOREIGN KEY ("oauth_token_id") REFERENCES "public"."oauth_token"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_principal_consistent" CHECK (
        (principal_kind = 'session'     AND api_key_id IS NULL     AND oauth_token_id IS NULL) OR
        (principal_kind = 'api_key'     AND api_key_id IS NOT NULL AND oauth_token_id IS NULL) OR
        (principal_kind = 'oauth_token' AND oauth_token_id IS NOT NULL AND api_key_id IS NULL)
      );