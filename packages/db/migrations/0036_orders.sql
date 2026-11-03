-- T-025: órdenes, sus líneas y sus cargos.
CREATE TABLE "app"."charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"source" text DEFAULT 'order' NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"price_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"void_reason_enc" text,
	"voided_by_membership_id" uuid,
	"voided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "charges_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "charges_organization_id_order_item_id_key" UNIQUE("organization_id","order_item_id"),
	CONSTRAINT "charges_source_check" CHECK ("app"."charges"."source" in ('order')),
	CONSTRAINT "charges_status_check" CHECK ("app"."charges"."status" in ('active', 'voided')),
	CONSTRAINT "charges_unit_price_check" CHECK ("app"."charges"."unit_price_cents" >= 0),
	CONSTRAINT "charges_quantity_range" CHECK ("app"."charges"."quantity" between 1 and 1000),
	CONSTRAINT "charges_amount_check" CHECK ("app"."charges"."amount_cents" >= 0 and "app"."charges"."amount_cents"::bigint = "app"."charges"."unit_price_cents"::bigint * "app"."charges"."quantity"),
	CONSTRAINT "charges_voided_check" CHECK (("app"."charges"."status" = 'voided') = ("app"."charges"."void_reason_enc" is not null and "app"."charges"."voided_by_membership_id" is not null and "app"."charges"."voided_at" is not null)),
	CONSTRAINT "charges_version_check" CHECK ("app"."charges"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"procedure_id" uuid,
	"lab_test_id" uuid,
	"quantity" integer NOT NULL,
	"item_code" text NOT NULL,
	"item_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "order_items_one_item_check" CHECK (num_nonnulls("app"."order_items"."procedure_id", "app"."order_items"."lab_test_id") = 1),
	CONSTRAINT "order_items_quantity_range" CHECK ("app"."order_items"."quantity" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "app"."orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"ordered_by_membership_id" uuid NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"assigned_to_membership_id" uuid,
	"lab_provider_id" uuid,
	"suggested_lab_provider_id" uuid,
	"notes_enc" text,
	"cancel_reason_enc" text,
	"cancelled_by_membership_id" uuid,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "orders_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "orders_code_format" CHECK ("app"."orders"."code" ~ '^[A-Z][A-Z0-9]{1,7}-O-[0-9]{6,}$'),
	CONSTRAINT "orders_type_check" CHECK ("app"."orders"."type" in ('procedure', 'injection', 'lab')),
	CONSTRAINT "orders_status_check" CHECK ("app"."orders"."status" in ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "orders_lab_check" CHECK ("app"."orders"."type" = 'lab' or ("app"."orders"."lab_provider_id" is null and "app"."orders"."suggested_lab_provider_id" is null)),
	CONSTRAINT "orders_cancelled_check" CHECK (("app"."orders"."status" = 'CANCELLED') = ("app"."orders"."cancel_reason_enc" is not null and "app"."orders"."cancelled_by_membership_id" is not null and "app"."orders"."cancelled_at" is not null)),
	CONSTRAINT "orders_version_check" CHECK ("app"."orders"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_order_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "app"."orders"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_order_item_fk" FOREIGN KEY ("organization_id","order_item_id") REFERENCES "app"."order_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_created_by_fk" FOREIGN KEY ("organization_id","created_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."charges" ADD CONSTRAINT "charges_voided_by_fk" FOREIGN KEY ("organization_id","voided_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "app"."orders"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_procedure_fk" FOREIGN KEY ("organization_id","procedure_id") REFERENCES "app"."procedures"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_lab_test_fk" FOREIGN KEY ("organization_id","lab_test_id") REFERENCES "app"."lab_tests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_ordered_by_fk" FOREIGN KEY ("organization_id","ordered_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_assigned_to_fk" FOREIGN KEY ("organization_id","assigned_to_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_cancelled_by_fk" FOREIGN KEY ("organization_id","cancelled_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_lab_provider_fk" FOREIGN KEY ("organization_id","lab_provider_id") REFERENCES "app"."lab_providers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_suggested_lab_provider_fk" FOREIGN KEY ("organization_id","suggested_lab_provider_id") REFERENCES "app"."lab_providers"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charges_encounter_idx" ON "app"."charges" USING btree ("organization_id","encounter_id");--> statement-breakpoint
CREATE INDEX "charges_order_idx" ON "app"."charges" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "app"."order_items" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE INDEX "orders_encounter_idx" ON "app"."orders" USING btree ("organization_id","encounter_id","ordered_at");--> statement-breakpoint
CREATE INDEX "orders_location_status_idx" ON "app"."orders" USING btree ("organization_id","location_id","status","ordered_at");