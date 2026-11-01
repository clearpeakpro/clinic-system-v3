-- T-018: versión de la visita tras cada cambio del historial («v{versión}», S-CLI-24).
-- Hasta T-018 solo existían aperturas (check_in), que dejan la visita en la
-- versión 1: las filas anteriores reciben ese valor y después se quita el
-- valor por defecto (cada inserción indica su versión).
ALTER TABLE "app"."encounter_events" ADD COLUMN "encounter_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."encounter_events" ALTER COLUMN "encounter_version" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app"."encounter_events" ADD CONSTRAINT "encounter_events_version_check" CHECK ("app"."encounter_events"."encounter_version" >= 1);
