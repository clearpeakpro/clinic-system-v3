-- T-008: cadena de hash de la auditoría, outbox e idempotencia. Escrita a mano.

-- 1. Cadena de hash (ADR 0018) ------------------------------------------------
--
-- Una cadena por organización y una de plataforma ('platform') para los
-- eventos sin organización. La calcula un trigger en la base de datos, así
-- que todos los que escriben (API, worker, Better Auth y el operador, también
-- con read_platform_audit) quedan encadenados y ninguno puede elegir su hash.
-- clinic_app sigue sin leer audit_log ni la tabla de cabezas: todo pasa por
-- funciones SECURITY DEFINER de clinic_owner con search_path vacío.

-- Hash de una fila: sha256 del hash anterior y de todos sus campos, en un
-- orden fijo y separados por el carácter 0x1F.
CREATE FUNCTION "app"."audit_row_hash"(p_prev text, p_chain text, p_seq bigint, r "app"."audit_log")
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path = ''
AS $$
  SELECT encode(sha256(convert_to(concat_ws(chr(31),
    coalesce(p_prev, ''),
    p_chain,
    p_seq::text,
    r."id"::text,
    coalesce(r."organization_id"::text, ''),
    coalesce(r."location_id"::text, ''),
    r."actor_type",
    coalesce(r."actor_id"::text, ''),
    r."action",
    coalesce(r."entity_type", ''),
    coalesce(r."entity_id"::text, ''),
    coalesce(r."ip", ''),
    coalesce(r."request_id", ''),
    coalesce(r."reason", ''),
    coalesce(r."metadata"::text, ''),
    to_char(r."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'UTF8')), 'hex')
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."audit_row_hash"(text, text, bigint, "app"."audit_log") FROM PUBLIC;--> statement-breakpoint

-- La tabla de cabezas solo la usan las funciones de esta migración.
ALTER TABLE "app"."audit_chain_heads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."audit_chain_heads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "chain_owner" ON "app"."audit_chain_heads" TO clinic_owner USING (true) WITH CHECK (true);--> statement-breakpoint

-- clinic_owner lee toda la auditoría, solo desde las funciones SECURITY
-- DEFINER (nadie inicia sesión con él). Cubre las políticas de solo lectura
-- anteriores (account_sharing_probe no es de esta tabla).
CREATE POLICY "audit_owner_read" ON "app"."audit_log" FOR SELECT TO clinic_owner USING (true);--> statement-breakpoint

-- Encadena las filas que ya existen, una vez, en orden de creación.
CREATE POLICY "chain_backfill" ON "app"."audit_log" FOR UPDATE TO clinic_owner USING (true) WITH CHECK (true);--> statement-breakpoint
DO $$
DECLARE
  r "app"."audit_log";
  v_chain text;
  v_current text := NULL;
  v_prev text;
  v_seq bigint;
  v_hash text;
BEGIN
  FOR r IN SELECT * FROM "app"."audit_log" a ORDER BY coalesce(a."organization_id"::text, 'platform'), a."created_at", a."id" LOOP
    v_chain := coalesce(r."organization_id"::text, 'platform');
    IF v_current IS DISTINCT FROM v_chain THEN
      v_current := v_chain;
      v_seq := 0;
      v_prev := NULL;
    END IF;
    v_seq := v_seq + 1;
    v_hash := "app"."audit_row_hash"(v_prev, v_chain, v_seq, r);
    UPDATE "app"."audit_log" SET "chain" = v_chain, "seq" = v_seq, "prev_hash" = v_prev, "hash" = v_hash WHERE "id" = r."id";
    v_prev := v_hash;
  END LOOP;
  INSERT INTO "app"."audit_chain_heads" ("chain", "seq", "hash")
    SELECT DISTINCT ON (a."chain") a."chain", a."seq", a."hash" FROM "app"."audit_log" a ORDER BY a."chain", a."seq" DESC;
END
$$;--> statement-breakpoint
DROP POLICY "chain_backfill" ON "app"."audit_log";--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_chain_seq_key" UNIQUE ("chain", "seq");--> statement-breakpoint

-- Cada INSERT: bloqueo por cadena, siguiente número, hash y nueva cabeza. Si
-- la transacción se deshace, la cabeza también.
CREATE FUNCTION "app"."audit_log_chain"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_seq bigint;
  v_hash text;
BEGIN
  NEW."chain" := coalesce(NEW."organization_id"::text, 'platform');
  NEW."created_at" := coalesce(NEW."created_at", now());
  PERFORM pg_advisory_xact_lock(hashtextextended('app.audit_chain:' || NEW."chain", 0));
  SELECT h."seq", h."hash" INTO v_seq, v_hash FROM "app"."audit_chain_heads" h WHERE h."chain" = NEW."chain";
  IF NOT FOUND THEN
    v_seq := 0;
    v_hash := NULL;
  END IF;
  NEW."seq" := v_seq + 1;
  NEW."prev_hash" := v_hash;
  NEW."hash" := "app"."audit_row_hash"(v_hash, NEW."chain", NEW."seq", NEW);
  INSERT INTO "app"."audit_chain_heads" ("chain", "seq", "hash") VALUES (NEW."chain", NEW."seq", NEW."hash")
    ON CONFLICT ("chain") DO UPDATE SET "seq" = EXCLUDED."seq", "hash" = EXCLUDED."hash";
  RETURN NEW;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."audit_log_chain"() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "audit_log_chain" BEFORE INSERT ON "app"."audit_log" FOR EACH ROW EXECUTE FUNCTION "app"."audit_log_chain"();--> statement-breakpoint

-- Cadenas que existen (ids de organización y 'platform'). Para el trabajo
-- diario de verificación del worker.
CREATE FUNCTION "app"."audit_chains"()
  RETURNS TABLE ("chain_id" text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT h."chain" FROM "app"."audit_chain_heads" h
  UNION
  SELECT DISTINCT a."chain" FROM "app"."audit_log" a
  ORDER BY 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."audit_chains"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."audit_chains"() TO clinic_app;--> statement-breakpoint

-- Recalcula una cadena. Devuelve solo si está bien, cuántas filas tiene, su
-- cabeza y el primer número roto: ningún dato de las filas. Toma el bloqueo
-- de la cadena para leer filas y cabeza en el mismo estado.
CREATE FUNCTION "app"."verify_audit_chain"(p_chain text)
  RETURNS TABLE ("ok" boolean, "row_count" bigint, "head_seq" bigint, "head_hash" text, "first_broken_seq" bigint)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  r "app"."audit_log";
  v_expected bigint := 1;
  v_prev text := NULL;
  v_broken bigint := NULL;
  v_count bigint := 0;
  v_head_seq bigint;
  v_head_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('app.audit_chain:' || p_chain, 0));
  FOR r IN SELECT * FROM "app"."audit_log" a WHERE a."chain" = p_chain ORDER BY a."seq" LOOP
    v_count := v_count + 1;
    IF v_broken IS NULL AND (
      r."seq" <> v_expected
      OR r."prev_hash" IS DISTINCT FROM v_prev
      OR r."hash" <> "app"."audit_row_hash"(v_prev, r."chain", r."seq", r)
    ) THEN
      v_broken := v_expected;
    END IF;
    v_prev := r."hash";
    v_expected := v_expected + 1;
  END LOOP;
  SELECT h."seq", h."hash" INTO v_head_seq, v_head_hash FROM "app"."audit_chain_heads" h WHERE h."chain" = p_chain;
  -- Filas borradas al final, o una cabeza que no coincide con la última fila.
  IF v_broken IS NULL AND (v_head_seq IS DISTINCT FROM v_count OR v_head_hash IS DISTINCT FROM v_prev) THEN
    v_broken := v_count + 1;
  END IF;
  RETURN QUERY SELECT v_broken IS NULL, v_count, v_head_seq, v_head_hash, v_broken;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."verify_audit_chain"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."verify_audit_chain"(text) TO clinic_app;--> statement-breakpoint

-- La lectura del operador devuelve también la posición en la cadena.
DROP FUNCTION "app"."read_platform_audit"(timestamptz, timestamptz, text, integer);--> statement-breakpoint
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
    "metadata" jsonb,
    "seq" bigint,
    "hash" text
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
           a."entity_id", a."ip", a."request_id", a."reason", a."metadata", a."seq", a."hash"
      FROM "app"."audit_log" a
     WHERE a."organization_id" IS NULL
       AND a."created_at" >= p_since
       AND (p_until IS NULL OR a."created_at" < p_until)
       AND (p_action IS NULL OR a."action" = p_action)
     ORDER BY a."seq"
     LIMIT p_limit;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."read_platform_audit"(timestamptz, timestamptz, text, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."read_platform_audit"(timestamptz, timestamptz, text, integer) TO clinic_operator;--> statement-breakpoint

-- 2. Outbox (ADR 0019) -------------------------------------------------------
ALTER TABLE "app"."outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."outbox"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "app"."outbox" ("next_attempt_at") WHERE "status" = 'pending';--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "app"."outbox" TO clinic_app;--> statement-breakpoint
-- org:create escribe la invitación del Propietario en el outbox (ADR 0024).
GRANT INSERT ON "app"."outbox" TO clinic_operator;--> statement-breakpoint

-- Eventos pendientes de todas las organizaciones, sin su contenido: el worker
-- los entrega después, uno a uno, dentro de withTenant.
CREATE POLICY "outbox_dispatch_probe" ON "app"."outbox" FOR SELECT TO clinic_owner USING (true);--> statement-breakpoint
CREATE FUNCTION "app"."outbox_due"(p_limit integer DEFAULT 100)
  RETURNS TABLE ("organization_id" uuid, "id" uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT o."organization_id", o."id"
    FROM "app"."outbox" o
   WHERE o."status" = 'pending' AND o."next_attempt_at" <= now()
   ORDER BY o."next_attempt_at", o."id"
   LIMIT least(greatest(coalesce(p_limit, 100), 1), 1000)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."outbox_due"(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."outbox_due"(integer) TO clinic_app;--> statement-breakpoint

-- 3. Idempotencia (ADR 0019) -------------------------------------------------
ALTER TABLE "app"."idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."idempotency_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."idempotency_keys"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- UPDATE: la reserva se completa con el estado y los ids en la misma transacción.
GRANT SELECT, INSERT, UPDATE ON "app"."idempotency_keys" TO clinic_app;--> statement-breakpoint

-- Purga diaria de las claves vencidas (24 h), de todas las organizaciones.
-- clinic_app no recibe DELETE: solo puede purgar con esta función.
CREATE POLICY "idempotency_purge_read" ON "app"."idempotency_keys" FOR SELECT TO clinic_owner USING (true);--> statement-breakpoint
CREATE POLICY "idempotency_purge" ON "app"."idempotency_keys" FOR DELETE TO clinic_owner USING ("expires_at" <= now());--> statement-breakpoint
CREATE FUNCTION "app"."purge_idempotency_keys"()
  RETURNS integer
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM "app"."idempotency_keys" k WHERE k."expires_at" <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."purge_idempotency_keys"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."purge_idempotency_keys"() TO clinic_app;
