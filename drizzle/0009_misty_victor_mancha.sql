ALTER TABLE "audit_log" ADD COLUMN "principal_kind" text;--> statement-breakpoint
UPDATE "audit_log" SET "principal_kind" = CASE WHEN "api_key_id" IS NULL THEN 'session' ELSE 'api_key' END;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "principal_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_principal_consistent" CHECK (
        (principal_kind = 'session' AND api_key_id IS NULL) OR
        (principal_kind = 'api_key' AND api_key_id IS NOT NULL)
      );
