-- T-029: recibos. Generada por drizzle-kit.
CREATE TABLE "app"."receipt_prints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"language" text NOT NULL,
	"printed_by_membership_id" uuid NOT NULL,
	"printed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "receipt_prints_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "receipt_prints_language_check" CHECK ("app"."receipt_prints"."language" in ('es', 'en'))
);
--> statement-breakpoint
CREATE TABLE "app"."receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"encounter_id" uuid,
	"membership_fee_id" uuid,
	"payment_id" uuid,
	"code" text NOT NULL,
	"year" integer NOT NULL,
	"snapshot_enc" text NOT NULL,
	"issued_by_membership_id" uuid NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	CONSTRAINT "receipts_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "receipts_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "receipts_target_check" CHECK (("app"."receipts"."encounter_id" is null) <> ("app"."receipts"."membership_fee_id" is null)),
	CONSTRAINT "receipts_fee_payment_check" CHECK ("app"."receipts"."membership_fee_id" is null or "app"."receipts"."payment_id" is not null),
	CONSTRAINT "receipts_code_format" CHECK ("app"."receipts"."code" ~ '^[A-Z][A-Z0-9]{1,7}-R-[0-9]{4}-[0-9]{6,}$'),
	CONSTRAINT "receipts_year_range" CHECK ("app"."receipts"."year" between 2000 and 9999)
);
--> statement-breakpoint
ALTER TABLE "app"."receipt_prints" ADD CONSTRAINT "receipt_prints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipt_prints" ADD CONSTRAINT "receipt_prints_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipt_prints" ADD CONSTRAINT "receipt_prints_receipt_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "app"."receipts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipt_prints" ADD CONSTRAINT "receipt_prints_printed_by_fk" FOREIGN KEY ("organization_id","printed_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_membership_fee_fk" FOREIGN KEY ("organization_id","membership_fee_id") REFERENCES "app"."membership_fees"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_payment_fk" FOREIGN KEY ("organization_id","payment_id") REFERENCES "app"."payments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."receipts" ADD CONSTRAINT "receipts_issued_by_fk" FOREIGN KEY ("organization_id","issued_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_prints_member_time_idx" ON "app"."receipt_prints" USING btree ("organization_id","printed_by_membership_id","printed_at");--> statement-breakpoint
CREATE INDEX "receipts_encounter_idx" ON "app"."receipts" USING btree ("organization_id","encounter_id");--> statement-breakpoint
CREATE INDEX "receipts_membership_fee_idx" ON "app"."receipts" USING btree ("organization_id","membership_fee_id");