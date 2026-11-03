ALTER TABLE "app"."orders" ADD COLUMN "started_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "completed_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_started_by_fk" FOREIGN KEY ("organization_id","started_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_completed_by_fk" FOREIGN KEY ("organization_id","completed_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_location_completed_idx" ON "app"."orders" USING btree ("organization_id","location_id","completed_at");--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_started_pair_check" CHECK (("app"."orders"."started_by_membership_id" is null) = ("app"."orders"."started_at" is null));--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_started_check" CHECK (("app"."orders"."status" <> 'PENDING' or "app"."orders"."started_at" is null) and ("app"."orders"."status" not in ('IN_PROGRESS', 'COMPLETED') or "app"."orders"."started_at" is not null));--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_completed_check" CHECK (("app"."orders"."status" = 'COMPLETED') = ("app"."orders"."completed_by_membership_id" is not null and "app"."orders"."completed_at" is not null));--> statement-breakpoint
-- T-026: ejecutar órdenes. Escrito a mano: clinic_app cambia también quién la
-- inició y la completó, y las notas cifradas (la nota de finalización se añade
-- a las existentes, S-CLI-20). El código, el tipo y la visita siguen sin cambiar.
GRANT UPDATE ("started_by_membership_id", "started_at", "completed_by_membership_id", "completed_at", "notes_enc") ON "app"."orders" TO clinic_app;
