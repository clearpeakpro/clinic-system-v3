-- T-011. Generada por drizzle-kit.
CREATE TABLE "app"."appointment_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"default_duration_minutes" integer,
	"suggested_route" text,
	"color" text DEFAULT 'teal' NOT NULL,
	CONSTRAINT "appointment_types_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "appointment_types_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "appointment_types_code_format" CHECK ("app"."appointment_types"."code" ~ '^[A-Z][A-Z0-9_-]{1,40}$'),
	CONSTRAINT "appointment_types_name_length" CHECK (char_length("app"."appointment_types"."name") between 1 and 120),
	CONSTRAINT "appointment_types_sort_order_range" CHECK ("app"."appointment_types"."sort_order" between 0 and 100000),
	CONSTRAINT "appointment_types_duration_range" CHECK ("app"."appointment_types"."default_duration_minutes" between 5 and 480),
	CONSTRAINT "appointment_types_route_check" CHECK ("app"."appointment_types"."suggested_route" in ('STANDARD', 'INJECTION_ONLY', 'LAB_ONLY', 'PROCEDURE_ONLY')),
	CONSTRAINT "appointment_types_color_check" CHECK ("app"."appointment_types"."color" in ('teal', 'cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'slate', 'stone'))
);
--> statement-breakpoint
CREATE TABLE "app"."lab_tests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_tests_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "lab_tests_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "lab_tests_code_format" CHECK ("app"."lab_tests"."code" ~ '^[A-Z][A-Z0-9_-]{1,40}$'),
	CONSTRAINT "lab_tests_name_length" CHECK (char_length("app"."lab_tests"."name") between 1 and 120),
	CONSTRAINT "lab_tests_sort_order_range" CHECK ("app"."lab_tests"."sort_order" between 0 and 100000)
);
--> statement-breakpoint
CREATE TABLE "app"."prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"procedure_id" uuid,
	"lab_test_id" uuid,
	"amount_cents" integer,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prices_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "prices_amount_check" CHECK ("app"."prices"."amount_cents" >= 0),
	CONSTRAINT "prices_general_amount_check" CHECK ("app"."prices"."location_id" is not null or "app"."prices"."amount_cents" is not null),
	CONSTRAINT "prices_one_item_check" CHECK (num_nonnulls("app"."prices"."procedure_id", "app"."prices"."lab_test_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "app"."procedures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "procedures_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "procedures_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "procedures_code_format" CHECK ("app"."procedures"."code" ~ '^[A-Z][A-Z0-9_-]{1,40}$'),
	CONSTRAINT "procedures_name_length" CHECK (char_length("app"."procedures"."name") between 1 and 120),
	CONSTRAINT "procedures_sort_order_range" CHECK ("app"."procedures"."sort_order" between 0 and 100000),
	CONSTRAINT "procedures_kind_check" CHECK ("app"."procedures"."kind" in ('procedure', 'injection'))
);
--> statement-breakpoint
CREATE TABLE "app"."referral_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_sources_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "referral_sources_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "referral_sources_code_format" CHECK ("app"."referral_sources"."code" ~ '^[A-Z][A-Z0-9_-]{1,40}$'),
	CONSTRAINT "referral_sources_name_length" CHECK (char_length("app"."referral_sources"."name") between 1 and 120),
	CONSTRAINT "referral_sources_sort_order_range" CHECK ("app"."referral_sources"."sort_order" between 0 and 100000)
);
--> statement-breakpoint
ALTER TABLE "app"."appointment_types" ADD CONSTRAINT "appointment_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lab_tests" ADD CONSTRAINT "lab_tests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prices" ADD CONSTRAINT "prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prices" ADD CONSTRAINT "prices_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prices" ADD CONSTRAINT "prices_procedure_fk" FOREIGN KEY ("organization_id","procedure_id") REFERENCES "app"."procedures"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."prices" ADD CONSTRAINT "prices_lab_test_fk" FOREIGN KEY ("organization_id","lab_test_id") REFERENCES "app"."lab_tests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."procedures" ADD CONSTRAINT "procedures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."referral_sources" ADD CONSTRAINT "referral_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prices_procedure_idx" ON "app"."prices" USING btree ("organization_id","location_id","procedure_id","effective_from");--> statement-breakpoint
CREATE INDEX "prices_lab_test_idx" ON "app"."prices" USING btree ("organization_id","location_id","lab_test_id","effective_from");