import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALLOWED_FILE, checkSource, checkTree } from '../scripts/check-rls-context.ts';

// ADR 0023, condición 2. Los ejemplos se arman por partes para que este mismo
// archivo no contenga las llamadas que el script prohíbe.
const SC = 'set_' + 'config';
const ORG = `${SC}('app.org_id'`;
const USER = `${SC}('app.user_id'`;
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const withTenantSource = readFileSync(new URL('../src/with-tenant.ts', import.meta.url), 'utf8');

describe('comprobación del contexto RLS', () => {
  it('el repositorio actual pasa', () => {
    expect(checkTree(repoRoot)).toEqual([]);
  });

  it('with-tenant.ts actual pasa', () => {
    expect(checkSource(ALLOWED_FILE, withTenantSource)).toEqual([]);
  });

  it('falla fuera de with-tenant.ts', () => {
    const code = `await pool.query("select ${ORG}, $1, true)");`;
    const violations = checkSource('apps/api/src/x.ts', code);
    expect(violations.map((v) => v.line)).toEqual([1]);
    expect(violations[0]?.message).toContain('fuera de');
    expect(checkSource('apps/api/src/x.ts', `sql\`select ${USER}, \${id}, true)\``)).toHaveLength(1);
  });

  it('falla con un tercer argumento distinto de true', () => {
    for (const third of ['false', '1', 'local', '']) {
      const broken = withTenantSource.replace(`${ORG}, \${orgId}, true)`, `${ORG}, \${orgId}, ${third})`);
      expect(broken).not.toBe(withTenantSource);
      const messages = checkSource(ALLOWED_FILE, broken).map((v) => v.message);
      expect(messages, third).toHaveLength(1);
      expect(messages[0], third).toContain('tercer argumento');
    }
  });

  it('falla si app.org_id se fija dentro de withUser (o al revés)', () => {
    const swapped = withTenantSource
      .replace(`${ORG}, \${orgId}, true)`, '__ORG__')
      .replace(`${USER}, \${userId}, true)`, `${ORG}, \${userId}, true)`)
      .replace('__ORG__', `${USER}, \${orgId}, true)`);
    const messages = checkSource(ALLOWED_FILE, swapped).map((v) => v.message);
    expect(messages).toEqual([
      expect.stringContaining("'app.user_id') fuera de withUser"),
      expect.stringContaining("'app.org_id') fuera de withTenant"),
    ]);
  });

  it('falla con un nombre que no es literal', () => {
    expect(checkSource('packages/db/src/otro.ts', `sql\`select ${SC}(\${name}, \${v}, true)\``)).toHaveLength(1);
  });

  it('falla con SET / SET LOCAL / SET SESSION en cualquier archivo, también SQL', () => {
    const S = 'SE' + 'T';
    for (const stmt of [`${S} app.org_id = 1`, `${S.toLowerCase()} local app.user_id to 1`, `${S} SESSION app.org_id = 1`]) {
      expect(checkSource('packages/db/migrations/x.sql', stmt), stmt).toHaveLength(1);
    }
  });

  it('otros parámetros de set_config no son contexto RLS', () => {
    expect(checkSource('apps/api/src/x.ts', `select ${SC}('statement_timeout', '5s', true)`)).toEqual([]);
  });
});
