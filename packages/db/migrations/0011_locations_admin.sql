ALTER TABLE "app"."audit_log" DROP CONSTRAINT "audit_log_actor_type_check";--> statement-breakpoint
ALTER TABLE "app"."invitations" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."locations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "app"."locations" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."locations" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."locations" ADD CONSTRAINT "locations_code_format" CHECK ("app"."locations"."code" ~ '^[A-Z][A-Z0-9]{1,7}$');--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_actor_type_check" CHECK ("app"."audit_log"."actor_type" in ('user', 'kiosk', 'anonymous', 'operator'));