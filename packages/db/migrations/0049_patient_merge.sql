-- T-030: fusionar pacientes (ADR 0032). Generada por drizzle-kit.
-- La versión combinada de la historia (source = 'merge') es la única sin visita.
ALTER TABLE "app"."patient_histories" ALTER COLUMN "encounter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."patient_histories" ADD COLUMN "source" text DEFAULT 'assessment' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."patient_histories" ADD CONSTRAINT "patient_histories_source_check" CHECK ("app"."patient_histories"."source" in ('assessment', 'merge'));--> statement-breakpoint
ALTER TABLE "app"."patient_histories" ADD CONSTRAINT "patient_histories_encounter_check" CHECK (("app"."patient_histories"."source" = 'merge') = ("app"."patient_histories"."encounter_id" is null));