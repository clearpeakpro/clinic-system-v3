-- T-020: kiosco. Escrita a mano.
-- RLS por organización (ADR 0002) en las dos tablas nuevas y funciones
-- SECURITY DEFINER de clinic_owner, con search_path vacío:
--  - la tableta no tiene sesión ni organización: su organización sale del
--    hash del token (o del código de vinculación), y solo eso devuelven;
--  - el worker vence y vacía registros de todas las organizaciones, con la
--    hora que le pasa su reloj (Clock), y recibe solo conteos.

ALTER TABLE "app"."kiosk_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."kiosk_devices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."kiosk_devices"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Las tabletas no se borran: se revocan.
GRANT SELECT, INSERT, UPDATE ON "app"."kiosk_devices" TO clinic_app;--> statement-breakpoint

ALTER TABLE "app"."kiosk_checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."kiosk_checkins"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Los registros no se borran: vencen y su contenido se vacía (quedan los metadatos).
GRANT SELECT, INSERT, UPDATE ON "app"."kiosk_checkins" TO clinic_app;--> statement-breakpoint

-- Lectura de clinic_owner, solo desde las funciones de abajo.
CREATE POLICY "kiosk_lookup_owner" ON "app"."kiosk_devices" FOR SELECT TO clinic_owner USING (true);--> statement-breakpoint
CREATE POLICY "kiosk_maintenance_read" ON "app"."kiosk_checkins" FOR SELECT TO clinic_owner USING (true);--> statement-breakpoint
CREATE POLICY "kiosk_maintenance_update" ON "app"."kiosk_checkins" FOR UPDATE TO clinic_owner USING (true) WITH CHECK (true);--> statement-breakpoint

-- Tableta activa por el hash de su token. Sin datos: solo ids y vencimiento.
CREATE FUNCTION "app"."kiosk_device_by_token"(p_token_hash text)
  RETURNS TABLE (organization_id uuid, location_id uuid, device_id uuid, token_expires_at timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT d."organization_id", d."location_id", d."id", d."token_expires_at"
  FROM "app"."kiosk_devices" d
  WHERE d."token_hash" = p_token_hash AND d."status" = 'active'
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."kiosk_device_by_token"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."kiosk_device_by_token"(text) TO clinic_app;--> statement-breakpoint

-- Tableta por vincular, por el hash de su código de un solo uso.
CREATE FUNCTION "app"."kiosk_pairing_by_code"(p_code_hash text)
  RETURNS TABLE (organization_id uuid, location_id uuid, device_id uuid, pairing_expires_at timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT d."organization_id", d."location_id", d."id", d."pairing_expires_at"
  FROM "app"."kiosk_devices" d
  WHERE d."pairing_code_hash" = p_code_hash AND d."status" = 'pending'
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."kiosk_pairing_by_code"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."kiosk_pairing_by_code"(text) TO clinic_app;--> statement-breakpoint

-- Vence los registros sin confirmar cuyo día de la sede ya cerró.
CREATE FUNCTION "app"."expire_kiosk_checkins"(p_now timestamptz)
  RETURNS integer
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE "app"."kiosk_checkins" c
    SET "status" = 'expired', "updated_at" = p_now, "version" = c."version" + 1
    WHERE c."status" = 'pending' AND c."expires_at" <= p_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."expire_kiosk_checkins"(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."expire_kiosk_checkins"(timestamptz) TO clinic_app;--> statement-breakpoint

-- Vacía el contenido a las 24 h del envío, en cualquier estado.
CREATE FUNCTION "app"."purge_kiosk_checkins"(p_now timestamptz)
  RETURNS integer
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE "app"."kiosk_checkins" c
    SET "content_enc" = NULL, "content_purged_at" = p_now, "updated_at" = p_now, "version" = c."version" + 1
    WHERE c."content_enc" IS NOT NULL AND c."purge_at" <= p_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."purge_kiosk_checkins"(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."purge_kiosk_checkins"(timestamptz) TO clinic_app;
