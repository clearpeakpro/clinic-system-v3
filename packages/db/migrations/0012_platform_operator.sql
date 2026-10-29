-- T-007: operador de la plataforma (ADR 0024, P-11). Escrita a mano.
--
-- clinic_operator (lo crea sql/bootstrap.sql) da de alta organizaciones con
-- su primera sede y la invitación de su Propietario (pnpm org:create), y es el
-- único que lee los eventos de auditoría sin organización (pnpm
-- audit:platform). No recibe ningún permiso sobre pacientes ni tablas clínicas.
-- Sus escrituras pasan por las mismas políticas RLS que clinic_app: el script
-- fija app.org_id con withTenant sobre la organización nueva.
GRANT USAGE ON SCHEMA "app" TO clinic_operator;--> statement-breakpoint
GRANT SELECT, INSERT ON "app"."organizations" TO clinic_operator;--> statement-breakpoint
GRANT SELECT, INSERT ON "app"."locations" TO clinic_operator;--> statement-breakpoint
GRANT SELECT, INSERT ON "app"."invitations" TO clinic_operator;--> statement-breakpoint
GRANT SELECT, INSERT ON "app"."invitation_roles" TO clinic_operator;--> statement-breakpoint
GRANT INSERT ON "app"."audit_log" TO clinic_operator;--> statement-breakpoint

-- Lectura de los eventos sin organización. El operador no tiene SELECT sobre
-- audit_log: lee solo con esta función, que registra cada lectura
-- (platform.audit_read, con los filtros) en la misma transacción en que
-- devuelve las filas. Corre como su dueño (clinic_owner), con una política de
-- solo lectura limitada a los eventos sin organización.
CREATE POLICY "platform_audit_read" ON "app"."audit_log" FOR SELECT TO clinic_owner
  USING ("organization_id" IS NULL);--> statement-breakpoint
CREATE FUNCTION "app"."read_platform_audit"(
  p_since timestamptz,
  p_until timestamptz DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
  RETURNS TABLE (
    "id" uuid,
    "created_at" timestamptz,
    "actor_type" text,
    "actor_id" uuid,
    "action" text,
    "entity_type" text,
    "entity_id" uuid,
    "ip" text,
    "request_id" text,
    "reason" text,
    "metadata" jsonb
  )
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit fuera de rango (1 a 5000)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO "app"."audit_log" ("id", "organization_id", "actor_type", "action", "metadata")
  VALUES (
    gen_random_uuid(),
    NULL,
    'operator',
    'platform.audit_read',
    jsonb_strip_nulls(jsonb_build_object(
      'dbUser', session_user::text,
      'since', p_since,
      'until', p_until,
      'action', p_action,
      'limit', p_limit
    ))
  );
  RETURN QUERY
    SELECT a."id", a."created_at", a."actor_type", a."actor_id", a."action", a."entity_type",
           a."entity_id", a."ip", a."request_id", a."reason", a."metadata"
      FROM "app"."audit_log" a
     WHERE a."organization_id" IS NULL
       AND a."created_at" >= p_since
       AND (p_until IS NULL OR a."created_at" < p_until)
       AND (p_action IS NULL OR a."action" = p_action)
     ORDER BY a."created_at", a."id"
     LIMIT p_limit;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."read_platform_audit"(timestamptz, timestamptz, text, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."read_platform_audit"(timestamptz, timestamptz, text, integer) TO clinic_operator;
