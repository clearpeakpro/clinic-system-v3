-- T-030: fusionar pacientes (ADR 0032, decisión 1). Escrita a mano.
--
-- Pagos, recibos, el titular de una membresía, sus personas y su historial no
-- se pueden cambiar desde la aplicación (solo SELECT e INSERT, o UPDATE por
-- columnas). Al fusionar, esta función cambia SOLO la columna del paciente
-- en esas tablas, del duplicado al principal:
--  - SECURITY DEFINER, sin search_path, y solo la ejecuta clinic_app;
--  - trabaja en la organización del contexto RLS (app.org_id), que además
--    sigue aplicándose: las tablas tienen FORCE ROW LEVEL SECURITY;
--  - solo mueve filas de un duplicado que YA está fusionado con ese principal
--    (patients.merged_into = p_to): no sirve para pasar filas entre dos
--    pacientes cualesquiera.
-- Devuelve cuántas filas movió de cada tabla.

CREATE FUNCTION "app"."merge_patient_rows"(p_from uuid, p_to uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_org uuid := NULLIF(current_setting('app.org_id', true), '')::uuid;
  v_payments integer;
  v_receipts integer;
  v_holders integer;
  v_members integer;
  v_events integer;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'merge_patient_rows: sin organización en el contexto' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "app"."patients" d
    JOIN "app"."patients" p ON p."organization_id" = d."organization_id" AND p."id" = p_to
    WHERE d."organization_id" = v_org AND d."id" = p_from AND d."merged_into" = p_to AND p."merged_into" IS NULL
  ) THEN
    RAISE EXCEPTION 'merge_patient_rows: el duplicado no está fusionado con ese principal' USING ERRCODE = '42501';
  END IF;

  UPDATE "app"."payments" SET "patient_id" = p_to WHERE "organization_id" = v_org AND "patient_id" = p_from;
  GET DIAGNOSTICS v_payments = ROW_COUNT;
  UPDATE "app"."receipts" SET "patient_id" = p_to WHERE "organization_id" = v_org AND "patient_id" = p_from;
  GET DIAGNOSTICS v_receipts = ROW_COUNT;
  UPDATE "app"."patient_memberships" SET "holder_patient_id" = p_to WHERE "organization_id" = v_org AND "holder_patient_id" = p_from;
  GET DIAGNOSTICS v_holders = ROW_COUNT;
  UPDATE "app"."patient_membership_members" SET "patient_id" = p_to WHERE "organization_id" = v_org AND "patient_id" = p_from;
  GET DIAGNOSTICS v_members = ROW_COUNT;
  UPDATE "app"."patient_membership_events" SET "patient_id" = p_to WHERE "organization_id" = v_org AND "patient_id" = p_from;
  GET DIAGNOSTICS v_events = ROW_COUNT;

  RETURN jsonb_build_object(
    'payments', v_payments,
    'receipts', v_receipts,
    'membershipHolders', v_holders,
    'membershipMembers', v_members,
    'membershipEvents', v_events
  );
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."merge_patient_rows"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."merge_patient_rows"(uuid, uuid) TO clinic_app;
