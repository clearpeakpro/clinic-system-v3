-- T-027: estado de cuenta de la visita y cargos de Caja (ADR 0041).
CREATE TABLE "app"."billing_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "billing_statements_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "billing_statements_organization_id_encounter_id_key" UNIQUE("organization_id","encounter_id"),
	CONSTRAINT "billing_statements_version_check" CHECK ("app"."billing_statements"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."charges" DROP CONSTRAINT "charges_source_check";--> statement-breakpoint
ALTER TABLE "app"."charges" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."charges" ALTER COLUMN "order_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "consultation_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "procedure_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "lab_test_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "item_code" text;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD COLUMN "item_name" text;--> statement-breakpoint
-- Editada a mano: los cargos de orden que ya existen reciben su servicio y la
-- copia del código y el nombre de su línea. Con FORCE la RLS también filtra
-- al dueño, así que se quita mientras dura.
ALTER TABLE "app"."charges" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."order_items" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "app"."charges" c
   SET "procedure_id" = i."procedure_id", "lab_test_id" = i."lab_test_id", "item_code" = i."item_code", "item_name" = i."item_name"
  FROM "app"."order_items" i
 WHERE i."id" = c."order_item_id" AND i."organization_id" = c."organization_id";--> statement-breakpoint
ALTER TABLE "app"."order_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."charges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."charges" ALTER COLUMN "item_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."charges" ALTER COLUMN "item_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."billing_statements" ADD CONSTRAINT "billing_statements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."billing_statements" ADD CONSTRAINT "billing_statements_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."billing_statements" ADD CONSTRAINT "billing_statements_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_consultation_fk" FOREIGN KEY ("organization_id","consultation_id") REFERENCES "app"."consultations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_procedure_fk" FOREIGN KEY ("organization_id","procedure_id") REFERENCES "app"."procedures"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_lab_test_fk" FOREIGN KEY ("organization_id","lab_test_id") REFERENCES "app"."lab_tests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_source_refs_check" CHECK (("app"."charges"."source" = 'order') = ("app"."charges"."order_id" is not null and "app"."charges"."order_item_id" is not null) and ("app"."charges"."order_id" is null) = ("app"."charges"."order_item_id" is null));--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_one_item_check" CHECK (num_nonnulls("app"."charges"."consultation_id", "app"."charges"."procedure_id", "app"."charges"."lab_test_id") = 1);--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_consultation_source_check" CHECK ("app"."charges"."consultation_id" is null or "app"."charges"."source" = 'cashier');--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_source_check" CHECK ("app"."charges"."source" in ('order', 'cashier'));