-- T-020: kiosco de autorregistro (ADR 0014 y 0031): tabletas y registros enviados.
CREATE TABLE "app"."kiosk_checkins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"content_enc" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"service_date" date NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"purge_at" timestamp with time zone NOT NULL,
	"content_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "kiosk_checkins_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "kiosk_checkins_status_check" CHECK ("app"."kiosk_checkins"."status" in ('pending', 'expired', 'confirmed', 'discarded')),
	CONSTRAINT "kiosk_checkins_content" CHECK (("app"."kiosk_checkins"."content_enc" is null) = ("app"."kiosk_checkins"."content_purged_at" is not null)),
	CONSTRAINT "kiosk_checkins_expiry_order" CHECK ("app"."kiosk_checkins"."expires_at" > "app"."kiosk_checkins"."created_at" and "app"."kiosk_checkins"."purge_at" > "app"."kiosk_checkins"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."kiosk_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"pairing_code_hash" text,
	"pairing_expires_at" timestamp with time zone,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"linked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_membership_id" uuid,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "kiosk_devices_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "kiosk_devices_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "kiosk_devices_pairing_code_hash_key" UNIQUE("pairing_code_hash"),
	CONSTRAINT "kiosk_devices_status_check" CHECK ("app"."kiosk_devices"."status" in ('pending', 'active', 'revoked')),
	CONSTRAINT "kiosk_devices_name_length" CHECK (char_length("app"."kiosk_devices"."name") between 1 and 60),
	CONSTRAINT "kiosk_devices_active_token" CHECK ("app"."kiosk_devices"."status" <> 'active' or ("app"."kiosk_devices"."token_hash" is not null and "app"."kiosk_devices"."token_expires_at" is not null and "app"."kiosk_devices"."linked_at" is not null)),
	CONSTRAINT "kiosk_devices_pending_code" CHECK ("app"."kiosk_devices"."status" <> 'pending' or "app"."kiosk_devices"."token_hash" is null),
	CONSTRAINT "kiosk_devices_revoked" CHECK (("app"."kiosk_devices"."status" = 'revoked') = ("app"."kiosk_devices"."revoked_at" is not null)),
	CONSTRAINT "kiosk_devices_revoked_clean" CHECK ("app"."kiosk_devices"."status" <> 'revoked' or ("app"."kiosk_devices"."token_hash" is null and "app"."kiosk_devices"."pairing_code_hash" is null))
);
--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_device_fk" FOREIGN KEY ("organization_id","device_id") REFERENCES "app"."kiosk_devices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_devices" ADD CONSTRAINT "kiosk_devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_devices" ADD CONSTRAINT "kiosk_devices_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_devices" ADD CONSTRAINT "kiosk_devices_created_by_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_devices" ADD CONSTRAINT "kiosk_devices_revoked_by_fk" FOREIGN KEY ("organization_id","revoked_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kiosk_checkins_location_status_idx" ON "app"."kiosk_checkins" USING btree ("organization_id","location_id","status","created_at");--> statement-breakpoint
CREATE INDEX "kiosk_checkins_device_created_idx" ON "app"."kiosk_checkins" USING btree ("organization_id","device_id","created_at");--> statement-breakpoint
CREATE INDEX "kiosk_devices_location_idx" ON "app"."kiosk_devices" USING btree ("organization_id","location_id");