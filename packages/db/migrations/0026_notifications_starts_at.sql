-- T-015: inicio de la cita en sus avisos («Cita NOR1-A-000045 · 3 nov, 9:00 a. m.»). Generada por drizzle-kit.
ALTER TABLE "app"."notifications" ADD COLUMN "starts_at" timestamp with time zone;