ALTER TABLE "two_factor" ADD COLUMN "verified" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN "failed_verification_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
UPDATE "two_factor" AS tf
SET "verified" = u."two_factor_enabled"
FROM "user" AS u
WHERE tf."user_id" = u."id" AND NOT u."two_factor_enabled";
