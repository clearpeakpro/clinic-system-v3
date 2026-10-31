-- T-012: búsqueda de pacientes (ADR 0007, 0026 y 0030) y RLS de code_counters. Escrita a mano.

-- pg_trgm y unaccent son extensiones «trusted»: las crea clinic_owner (CREATE
-- en la base). Van en su propio esquema, no en public.
CREATE SCHEMA IF NOT EXISTS "ext";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA "ext";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA "ext";--> statement-breakpoint
GRANT USAGE ON SCHEMA "ext" TO clinic_app;--> statement-breakpoint

-- Texto para buscar: minúsculas y sin tildes. IMMUTABLE (con el diccionario
-- explícito) para poder indexarlo.
CREATE FUNCTION "app"."search_text"(value text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = ''
  AS $$ SELECT lower(ext.unaccent('ext.unaccent'::regdictionary, value)) $$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."search_text"(text) TO clinic_app;--> statement-breakpoint

-- Nombre completo, parcial y sin tildes (LIKE '%…%' y similitud de trigramas).
CREATE INDEX "patients_search_name_idx" ON "app"."patients"
  USING gin ("app"."search_text"("first_name" || ' ' || "last_name") "ext"."gin_trgm_ops");--> statement-breakpoint
CREATE INDEX "patients_birth_date_idx" ON "app"."patients" ("organization_id", "birth_date");--> statement-breakpoint
CREATE INDEX "patients_phone_idx" ON "app"."patients" ("organization_id", "phone");--> statement-breakpoint

ALTER TABLE "app"."code_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."code_counters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."code_counters"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Contadores: se crean y se incrementan; nunca se borran.
GRANT SELECT, INSERT, UPDATE ON "app"."code_counters" TO clinic_app;
