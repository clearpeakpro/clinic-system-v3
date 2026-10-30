import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

// Un solo registro de MFA por persona (migración 0019): dos inscripciones a
// la vez creaban dos, con secretos distintos, y ningún código era válido.

const UNIQUE_VIOLATION = '23505';

describe('auth.two_factor', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 2 });
  });
  afterAll(async () => {
    await pool.end();
  });

  it('no admite un segundo registro para la misma persona', async () => {
    const userId = uuidv7();
    await pool.query(
      `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'Persona ficticia', $2, true, now(), now())`,
      [userId, `mfa.${randomUUID()}@example.test`],
    );
    const insert = () =>
      pool.query(`insert into auth.two_factor (id, secret, backup_codes, user_id, verified) values ($1, 'cifrado', 'cifrados', $2, false)`, [uuidv7(), userId]);
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});
