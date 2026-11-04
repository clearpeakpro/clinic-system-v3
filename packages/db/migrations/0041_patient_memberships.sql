-- T-026b parte B. Generada por drizzle-kit y editada a mano (tipo de cupo de los incluidos existentes).
CREATE TABLE "app"."membership_fees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"due_date" date NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "membership_fees_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "membership_fees_membership_due_key" UNIQUE("organization_id","membership_id","kind","due_date"),
	CONSTRAINT "membership_fees_kind_check" CHECK ("app"."membership_fees"."kind" in ('initial', 'monthly')),
	CONSTRAINT "membership_fees_status_check" CHECK ("app"."membership_fees"."status" in ('pending', 'paid', 'voided')),
	CONSTRAINT "membership_fees_amount_range" CHECK ("app"."membership_fees"."amount_cents" between 0 and 10000000),
	CONSTRAINT "membership_fees_period_check" CHECK ("app"."membership_fees"."period_end" >= "app"."membership_fees"."period_start"),
	CONSTRAINT "membership_fees_paid_check" CHECK (("app"."membership_fees"."status" = 'paid') = ("app"."membership_fees"."paid_at" is not null)),
	CONSTRAINT "membership_fees_voided_check" CHECK (("app"."membership_fees"."status" = 'voided') = ("app"."membership_fees"."voided_at" is not null)),
	CONSTRAINT "membership_fees_version_check" CHECK ("app"."membership_fees"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."patient_membership_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_membership_id" uuid,
	"patient_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "patient_membership_events_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "patient_membership_events_action_check" CHECK ("app"."patient_membership_events"."action" in ('enrolled', 'activated', 'suspended', 'reactivated', 'cancel_notice', 'cancelled', 'member_added', 'member_removed')),
	CONSTRAINT "patient_membership_events_from_check" CHECK ("app"."patient_membership_events"."from_status" in ('pending_payment', 'active', 'suspended', 'cancelled')),
	CONSTRAINT "patient_membership_events_to_check" CHECK ("app"."patient_membership_events"."to_status" in ('pending_payment', 'active', 'suspended', 'cancelled')),
	CONSTRAINT "patient_membership_events_actor_type_check" CHECK ("app"."patient_membership_events"."actor_type" in ('user', 'system')),
	CONSTRAINT "patient_membership_events_actor_check" CHECK (("app"."patient_membership_events"."actor_type" = 'user') = ("app"."patient_membership_events"."actor_membership_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "app"."patient_membership_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"role" text NOT NULL,
	"added_by_membership_id" uuid NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_membership_id" uuid,
	CONSTRAINT "patient_membership_members_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "patient_membership_members_role_check" CHECK ("app"."patient_membership_members"."role" in ('holder', 'affiliate'))
);
--> statement-breakpoint
CREATE TABLE "app"."patient_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"holder_patient_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"enrolled_on" date NOT NULL,
	"start_date" date NOT NULL,
	"billing_day" integer NOT NULL,
	"initial_fee_cents" integer NOT NULL,
	"monthly_fee_cents" integer NOT NULL,
	"enrolled_by_membership_id" uuid NOT NULL,
	"identity_verified_by_membership_id" uuid NOT NULL,
	"identity_verified_at" timestamp with time zone NOT NULL,
	"cancel_notice_on" date,
	"cancel_notice_by_membership_id" uuid,
	"benefits_end_date" date,
	"cancelled_on" date,
	"cancellation" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "patient_memberships_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "patient_memberships_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "patient_memberships_code_format" CHECK ("app"."patient_memberships"."code" ~ '^[A-Z][A-Z0-9]{1,7}-M-[0-9]{6,}$'),
	CONSTRAINT "patient_memberships_status_check" CHECK ("app"."patient_memberships"."status" in ('pending_payment', 'active', 'suspended', 'cancelled')),
	CONSTRAINT "patient_memberships_cancellation_check" CHECK ("app"."patient_memberships"."cancellation" in ('notice', 'non_payment', 'initial_unpaid')),
	CONSTRAINT "patient_memberships_billing_day_range" CHECK ("app"."patient_memberships"."billing_day" between 1 and 31),
	CONSTRAINT "patient_memberships_fees_range" CHECK ("app"."patient_memberships"."initial_fee_cents" between 0 and 10000000 and "app"."patient_memberships"."monthly_fee_cents" between 0 and 10000000),
	CONSTRAINT "patient_memberships_start_check" CHECK ("app"."patient_memberships"."start_date" >= "app"."patient_memberships"."enrolled_on"),
	CONSTRAINT "patient_memberships_cancelled_check" CHECK (("app"."patient_memberships"."status" = 'cancelled') = ("app"."patient_memberships"."cancelled_on" is not null and "app"."patient_memberships"."cancellation" is not null)),
	CONSTRAINT "patient_memberships_notice_check" CHECK (("app"."patient_memberships"."cancel_notice_on" is null) = ("app"."patient_memberships"."cancel_notice_by_membership_id" is null) and ("app"."patient_memberships"."cancel_notice_on" is null) = ("app"."patient_memberships"."benefits_end_date" is null)),
	CONSTRAINT "patient_memberships_version_check" CHECK ("app"."patient_memberships"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."coverages" ADD COLUMN "patient_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "patient_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "benefit_year_start" date;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "included_benefit_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "membership_included_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "same_visit_labs_benefit_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "discount_benefit_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "membership_discount_bp" integer;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "membership_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."membership_benefits" ADD COLUMN "quota_mode" text;--> statement-breakpoint
-- Editada a mano: los incluidos que ya existen reciben su tipo de cupo:
-- «Paquete» si tienen más de un servicio (como el chequeo) y «Cupo
-- compartido» si no. Con FORCE la RLS también filtra al dueño, así que se
-- quita mientras dura.
ALTER TABLE "app"."membership_benefits" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_benefit_items" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "app"."membership_benefits" b
   SET "quota_mode" = CASE WHEN (SELECT count(*) FROM "app"."membership_benefit_items" i WHERE i."benefit_id" = b."id") > 1 THEN 'package' ELSE 'shared' END
 WHERE b."type" = 'included';--> statement-breakpoint
ALTER TABLE "app"."membership_benefit_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_benefits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_fees" ADD CONSTRAINT "membership_fees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_fees" ADD CONSTRAINT "membership_fees_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "app"."patient_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_events" ADD CONSTRAINT "patient_membership_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_events" ADD CONSTRAINT "patient_membership_events_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "app"."patient_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_events" ADD CONSTRAINT "patient_membership_events_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_events" ADD CONSTRAINT "patient_membership_events_actor_fk" FOREIGN KEY ("organization_id","actor_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_members" ADD CONSTRAINT "patient_membership_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_members" ADD CONSTRAINT "patient_membership_members_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "app"."patient_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_members" ADD CONSTRAINT "patient_membership_members_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_members" ADD CONSTRAINT "patient_membership_members_added_by_fk" FOREIGN KEY ("organization_id","added_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_members" ADD CONSTRAINT "patient_membership_members_removed_by_fk" FOREIGN KEY ("organization_id","removed_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_memberships" ADD CONSTRAINT "patient_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_memberships" ADD CONSTRAINT "patient_memberships_plan_fk" FOREIGN KEY ("organization_id","plan_id") REFERENCES "app"."membership_plans"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_memberships" ADD CONSTRAINT "patient_memberships_holder_fk" FOREIGN KEY ("organization_id","holder_patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_memberships" ADD CONSTRAINT "patient_memberships_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_memberships" ADD CONSTRAINT "patient_memberships_enrolled_by_fk" FOREIGN KEY ("organization_id","enrolled_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_memberships" ADD CONSTRAINT "patient_memberships_identity_by_fk" FOREIGN KEY ("organization_id","identity_verified_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_memberships" ADD CONSTRAINT "patient_memberships_notice_by_fk" FOREIGN KEY ("organization_id","cancel_notice_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_fees_initial_key" ON "app"."membership_fees" USING btree ("organization_id","membership_id") WHERE "app"."membership_fees"."kind" = 'initial';--> statement-breakpoint
CREATE INDEX "patient_membership_events_membership_idx" ON "app"."patient_membership_events" USING btree ("organization_id","membership_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_membership_members_current_key" ON "app"."patient_membership_members" USING btree ("organization_id","patient_id") WHERE "app"."patient_membership_members"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_membership_members_holder_key" ON "app"."patient_membership_members" USING btree ("organization_id","membership_id") WHERE "app"."patient_membership_members"."role" = 'holder';--> statement-breakpoint
CREATE INDEX "patient_membership_members_membership_idx" ON "app"."patient_membership_members" USING btree ("organization_id","membership_id");--> statement-breakpoint
CREATE INDEX "patient_memberships_holder_idx" ON "app"."patient_memberships" USING btree ("organization_id","holder_patient_id");--> statement-breakpoint
CREATE INDEX "patient_memberships_status_idx" ON "app"."patient_memberships" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "app"."coverages" ADD CONSTRAINT "coverages_patient_membership_fk" FOREIGN KEY ("organization_id","patient_membership_id") REFERENCES "app"."patient_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_patient_membership_fk" FOREIGN KEY ("organization_id","patient_membership_id") REFERENCES "app"."patient_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_included_benefit_fk" FOREIGN KEY ("organization_id","included_benefit_id") REFERENCES "app"."membership_benefits"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_same_visit_labs_benefit_fk" FOREIGN KEY ("organization_id","same_visit_labs_benefit_id") REFERENCES "app"."membership_benefits"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_discount_benefit_fk" FOREIGN KEY ("organization_id","discount_benefit_id") REFERENCES "app"."membership_benefits"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charges_included_benefit_idx" ON "app"."charges" USING btree ("organization_id","patient_membership_id","included_benefit_id","benefit_year_start");--> statement-breakpoint
ALTER TABLE "app"."coverages" ADD CONSTRAINT "coverages_membership_check" CHECK (("app"."coverages"."type" = 'membership') = ("app"."coverages"."patient_membership_id" is not null));--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_membership_check" CHECK (case when "app"."charges"."patient_membership_id" is null then
            "app"."charges"."benefit_year_start" is null and "app"."charges"."included_benefit_id" is null and "app"."charges"."membership_included_quantity" = 0
            and "app"."charges"."same_visit_labs_benefit_id" is null and "app"."charges"."discount_benefit_id" is null and "app"."charges"."membership_discount_cents" = 0
          else "app"."charges"."benefit_year_start" is not null end);--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_included_check" CHECK ("app"."charges"."membership_included_quantity" between 0 and "app"."charges"."quantity" and ("app"."charges"."included_benefit_id" is null) = ("app"."charges"."membership_included_quantity" = 0));--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_discount_bp_check" CHECK (("app"."charges"."discount_benefit_id" is null) = ("app"."charges"."membership_discount_bp" is null) and "app"."charges"."membership_discount_bp" between 1 and 10000);--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_membership_discount_check" CHECK ("app"."charges"."membership_discount_cents" between 0 and "app"."charges"."amount_cents");--> statement-breakpoint
ALTER TABLE "app"."membership_benefits" ADD CONSTRAINT "membership_benefits_quota_mode_check" CHECK (("app"."membership_benefits"."type" = 'included') = ("app"."membership_benefits"."quota_mode" is not null) and "app"."membership_benefits"."quota_mode" in ('package', 'shared'));