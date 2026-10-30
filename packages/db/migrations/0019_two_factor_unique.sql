-- Un solo registro de MFA por persona. Generada por drizzle-kit, más el
-- borrado previo de los duplicados: dos inscripciones a la vez (React monta
-- dos veces la pantalla en desarrollo) creaban dos registros con secretos
-- distintos. Se conserva el verificado si lo hay y, si no, el más reciente
-- (los ids son UUID v7); la próxima inscripción lo reescribe.
DELETE FROM "auth"."two_factor" t
 USING (
   SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY coalesce("verified", false) DESC, "id" DESC) AS n
     FROM "auth"."two_factor"
 ) ranked
 WHERE t."id" = ranked."id" AND ranked.n > 1;--> statement-breakpoint
DROP INDEX "auth"."two_factor_user_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "two_factor_user_id_key" ON "auth"."two_factor" USING btree ("user_id");