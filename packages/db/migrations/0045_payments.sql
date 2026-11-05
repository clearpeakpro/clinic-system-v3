-- T-028: pagos. Generada por drizzle-kit.
CREATE TABLE "app"."payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"encounter_id" uuid,
	"membership_fee_id" uuid,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference_last4_enc" text,
	"reverses_payment_id" uuid,
	"reason_enc" text,
	"recorded_by_membership_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payments_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "payments_kind_check" CHECK ("app"."payments"."kind" in ('payment', 'void')),
	CONSTRAINT "payments_method_check" CHECK ("app"."payments"."method" in ('cash', 'credit_card', 'debit_card', 'other')),
	CONSTRAINT "payments_target_check" CHECK (("app"."payments"."encounter_id" is null) <> ("app"."payments"."membership_fee_id" is null)),
	CONSTRAINT "payments_kind_fields_check" CHECK (("app"."payments"."kind" = 'payment' and "app"."payments"."amount_cents" > 0 and "app"."payments"."reverses_payment_id" is null and "app"."payments"."reason_enc" is null)
        or ("app"."payments"."kind" = 'void' and "app"."payments"."amount_cents" < 0 and "app"."payments"."reverses_payment_id" is not null and "app"."payments"."reason_enc" is not null)),
	CONSTRAINT "payments_amount_range" CHECK ("app"."payments"."amount_cents" between -100000000 and 100000000)
);
--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_membership_fee_fk" FOREIGN KEY ("organization_id","membership_fee_id") REFERENCES "app"."membership_fees"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_reverses_fk" FOREIGN KEY ("organization_id","reverses_payment_id") REFERENCES "app"."payments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_recorded_by_fk" FOREIGN KEY ("organization_id","recorded_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reverses_key" ON "app"."payments" USING btree ("organization_id","reverses_payment_id") WHERE "app"."payments"."reverses_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_encounter_idx" ON "app"."payments" USING btree ("organization_id","encounter_id");--> statement-breakpoint
CREATE INDEX "payments_membership_fee_idx" ON "app"."payments" USING btree ("organization_id","membership_fee_id");--> statement-breakpoint
CREATE INDEX "payments_patient_idx" ON "app"."payments" USING btree ("organization_id","patient_id");