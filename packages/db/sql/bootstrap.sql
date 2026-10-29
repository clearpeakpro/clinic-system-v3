-- Arranque de la base de datos. Lo ejecuta un superusuario, conectado a la base
-- de datos de la aplicación, antes de la primera migración. Es idempotente.
-- Las contraseñas no van aquí: las fija src/bootstrap.ts con ALTER ROLE.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_owner') THEN
    CREATE ROLE clinic_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_migrator') THEN
    CREATE ROLE clinic_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_app') THEN
    CREATE ROLE clinic_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
  END IF;
  -- Operador de la plataforma (ADR 0024): altas de organizaciones y lectura
  -- auditada de los eventos sin organización. Nunca datos de pacientes.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_operator') THEN
    CREATE ROLE clinic_operator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
  END IF;
END
$$;

-- Por si los roles ya existían con otros atributos.
ALTER ROLE clinic_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
ALTER ROLE clinic_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
ALTER ROLE clinic_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
ALTER ROLE clinic_operator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;

-- clinic_migrator actúa como clinic_owner (SET ROLE) para que los objetos que
-- crea queden a nombre de clinic_owner. clinic_app y clinic_operator no son
-- miembros de nadie.
GRANT clinic_owner TO clinic_migrator;

DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO clinic_migrator, clinic_app, clinic_operator', current_database());
  EXECUTE format('GRANT CREATE ON DATABASE %I TO clinic_owner', current_database());
END
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
