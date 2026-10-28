CREATE TABLE "auth"."sign_in_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sign_in_failures_key_hash_created_at_idx" ON "auth"."sign_in_failures" USING btree ("key_hash","created_at");