-- T-026b parte A: catálogo «Consultas» (ADR 0041), categoría de membresía y
-- planes de membresía con sus cuotas y beneficios (ADR 0034). Generada por drizzle-kit.
CREATE TABLE "app"."consultations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultations_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "consultations_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "consultations_code_format" CHECK ("app"."consultations"."code" ~ '^[A-Z][A-Z0-9_-]{1,40}$'),
	CONSTRAINT "consultations_name_length" CHECK (char_length("app"."consultations"."name") between 1 and 120),
	CONSTRAINT "consultations_sort_order_range" CHECK ("app"."consultations"."sort_order" between 0 and 100000)
);
--> statement-breakpoint
CREATE TABLE "app"."membership_benefit_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"benefit_id" uuid NOT NULL,
	"consultation_id" uuid,
	"procedure_id" uuid,
	"lab_test_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_benefit_items_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "membership_benefit_items_one_item_check" CHECK (num_nonnulls("app"."membership_benefit_items"."consultation_id", "app"."membership_benefit_items"."procedure_id", "app"."membership_benefit_items"."lab_test_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "app"."membership_benefits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name_es" text,
	"name_en" text,
	"quantity_per_year" integer,
	"includes_same_visit_labs" boolean DEFAULT false NOT NULL,
	"category" text,
	"discount_bp" integer,
	"sort_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_benefits_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "membership_benefits_type_check" CHECK ("app"."membership_benefits"."type" in ('included', 'discount')),
	CONSTRAINT "membership_benefits_category_check" CHECK ("app"."membership_benefits"."category" in ('consultation', 'treatment', 'lab', 'minor_procedure')),
	CONSTRAINT "membership_benefits_name_es_length" CHECK (char_length("app"."membership_benefits"."name_es") between 1 and 120),
	CONSTRAINT "membership_benefits_name_en_length" CHECK (char_length("app"."membership_benefits"."name_en") between 1 and 120),
	CONSTRAINT "membership_benefits_quantity_range" CHECK ("app"."membership_benefits"."quantity_per_year" between 1 and 100000),
	CONSTRAINT "membership_benefits_discount_range" CHECK ("app"."membership_benefits"."discount_bp" between 0 and 10000),
	CONSTRAINT "membership_benefits_sort_order_range" CHECK ("app"."membership_benefits"."sort_order" between 0 and 100000),
	CONSTRAINT "membership_benefits_version_check" CHECK ("app"."membership_benefits"."version" >= 1),
	CONSTRAINT "membership_benefits_shape_check" CHECK (case when "app"."membership_benefits"."type" = 'included' then
            "app"."membership_benefits"."name_es" is not null and "app"."membership_benefits"."name_en" is not null and "app"."membership_benefits"."quantity_per_year" is not null
            and "app"."membership_benefits"."category" is null and "app"."membership_benefits"."discount_bp" is null
          else
            "app"."membership_benefits"."category" is not null and "app"."membership_benefits"."discount_bp" is not null
            and "app"."membership_benefits"."name_es" is null and "app"."membership_benefits"."name_en" is null and "app"."membership_benefits"."quantity_per_year" is null
            and not "app"."membership_benefits"."includes_same_visit_labs"
          end)
);
--> statement-breakpoint
CREATE TABLE "app"."membership_plan_fees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"initial_fee_cents" integer NOT NULL,
	"monthly_fee_cents" integer NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_plan_fees_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "membership_plan_fees_initial_range" CHECK ("app"."membership_plan_fees"."initial_fee_cents" between 0 and 10000000),
	CONSTRAINT "membership_plan_fees_monthly_range" CHECK ("app"."membership_plan_fees"."monthly_fee_cents" between 0 and 10000000)
);
--> statement-breakpoint
CREATE TABLE "app"."membership_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"description_es" text,
	"description_en" text,
	"max_members" integer NOT NULL,
	"sort_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_plans_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "membership_plans_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "membership_plans_code_format" CHECK ("app"."membership_plans"."code" ~ '^[A-Z][A-Z0-9_-]{1,40}$'),
	CONSTRAINT "membership_plans_name_es_length" CHECK (char_length("app"."membership_plans"."name_es") between 1 and 120),
	CONSTRAINT "membership_plans_name_en_length" CHECK (char_length("app"."membership_plans"."name_en") between 1 and 120),
	CONSTRAINT "membership_plans_description_es_length" CHECK (char_length("app"."membership_plans"."description_es") between 1 and 500),
	CONSTRAINT "membership_plans_description_en_length" CHECK (char_length("app"."membership_plans"."description_en") between 1 and 500),
	CONSTRAINT "membership_plans_max_members_range" CHECK ("app"."membership_plans"."max_members" between 1 and 1000),
	CONSTRAINT "membership_plans_sort_order_range" CHECK ("app"."membership_plans"."sort_order" between 0 and 100000),
	CONSTRAINT "membership_plans_version_check" CHECK ("app"."membership_plans"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."prices" DROP CONSTRAINT "prices_one_item_check";--> statement-breakpoint
ALTER TABLE "app"."lab_tests" ADD COLUMN "membership_category" text;--> statement-breakpoint
ALTER TABLE "app"."prices" ADD COLUMN "consultation_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."procedures" ADD COLUMN "membership_category" text;--> statement-breakpoint
ALTER TABLE "app"."consultations" ADD CONSTRAINT "consultations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_benefit_items" ADD CONSTRAINT "membership_benefit_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_benefit_items" ADD CONSTRAINT "membership_benefit_items_benefit_fk" FOREIGN KEY ("organization_id","benefit_id") REFERENCES "app"."membership_benefits"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_benefit_items" ADD CONSTRAINT "membership_benefit_items_consultation_fk" FOREIGN KEY ("organization_id","consultation_id") REFERENCES "app"."consultations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_benefit_items" ADD CONSTRAINT "membership_benefit_items_procedure_fk" FOREIGN KEY ("organization_id","procedure_id") REFERENCES "app"."procedures"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_benefit_items" ADD CONSTRAINT "membership_benefit_items_lab_test_fk" FOREIGN KEY ("organization_id","lab_test_id") REFERENCES "app"."lab_tests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_benefits" ADD CONSTRAINT "membership_benefits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_benefits" ADD CONSTRAINT "membership_benefits_plan_fk" FOREIGN KEY ("organization_id","plan_id") REFERENCES "app"."membership_plans"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_plan_fees" ADD CONSTRAINT "membership_plan_fees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_plan_fees" ADD CONSTRAINT "membership_plan_fees_plan_fk" FOREIGN KEY ("organization_id","plan_id") REFERENCES "app"."membership_plans"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."membership_plans" ADD CONSTRAINT "membership_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_benefit_items_item_key" ON "app"."membership_benefit_items" USING btree ("organization_id","benefit_id",coalesce("consultation_id", "procedure_id", "lab_test_id"));--> statement-breakpoint
CREATE UNIQUE INDEX "membership_benefits_active_discount_key" ON "app"."membership_benefits" USING btree ("organization_id","plan_id","category") WHERE "app"."membership_benefits"."type" = 'discount' and "app"."membership_benefits"."active";--> statement-breakpoint
CREATE INDEX "membership_benefits_plan_idx" ON "app"."membership_benefits" USING btree ("organization_id","plan_id");--> statement-breakpoint
CREATE INDEX "membership_plan_fees_plan_idx" ON "app"."membership_plan_fees" USING btree ("organization_id","plan_id","effective_from");--> statement-breakpoint
ALTER TABLE "app"."prices" ADD CONSTRAINT "prices_consultation_fk" FOREIGN KEY ("organization_id","consultation_id") REFERENCES "app"."consultations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prices_consultation_idx" ON "app"."prices" USING btree ("organization_id","location_id","consultation_id","effective_from");--> statement-breakpoint
ALTER TABLE "app"."lab_tests" ADD CONSTRAINT "lab_tests_membership_category_check" CHECK ("app"."lab_tests"."membership_category" in ('consultation', 'treatment', 'lab', 'minor_procedure'));--> statement-breakpoint
ALTER TABLE "app"."prices" ADD CONSTRAINT "prices_one_item_check" CHECK (num_nonnulls("app"."prices"."procedure_id", "app"."prices"."lab_test_id", "app"."prices"."consultation_id") = 1);--> statement-breakpoint
ALTER TABLE "app"."procedures" ADD CONSTRAINT "procedures_membership_category_check" CHECK ("app"."procedures"."membership_category" in ('consultation', 'treatment', 'lab', 'minor_procedure'));