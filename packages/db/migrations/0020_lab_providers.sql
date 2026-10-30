-- T-011b. Generada por drizzle-kit.
CREATE TABLE "app"."lab_providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"preference" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_providers_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "lab_providers_name_length" CHECK (char_length("app"."lab_providers"."name") between 1 and 120),
	CONSTRAINT "lab_providers_preference_range" CHECK ("app"."lab_providers"."preference" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "app"."lab_test_costs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"lab_test_id" uuid NOT NULL,
	"lab_provider_id" uuid NOT NULL,
	"amount_cents" integer,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_test_costs_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "lab_test_costs_amount_check" CHECK ("app"."lab_test_costs"."amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."lab_providers" ADD CONSTRAINT "lab_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lab_test_costs" ADD CONSTRAINT "lab_test_costs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lab_test_costs" ADD CONSTRAINT "lab_test_costs_lab_test_fk" FOREIGN KEY ("organization_id","lab_test_id") REFERENCES "app"."lab_tests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lab_test_costs" ADD CONSTRAINT "lab_test_costs_lab_provider_fk" FOREIGN KEY ("organization_id","lab_provider_id") REFERENCES "app"."lab_providers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_providers_organization_id_name_key" ON "app"."lab_providers" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "lab_test_costs_lab_test_idx" ON "app"."lab_test_costs" USING btree ("organization_id","lab_test_id","lab_provider_id","effective_from");