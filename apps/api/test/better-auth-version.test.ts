import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// ADR 0023, condición 1: Better Auth fijado en 1.7.7 (publicada el 2026-09-30),
// sin rango. Cambiar de versión exige repetir la suite de la prueba T-002 y
// actualizar esta prueba y el ADR (apps/api/README.md, «Al actualizar Better Auth»).

const PINNED = '1.7.7';

const readJson = async (path: URL) => JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

describe('condición 1 del ADR 0023: versión de Better Auth', () => {
  it('apps/api/package.json la fija exactamente, sin ^ ni ~', async () => {
    const pkg = (await readJson(new URL('../package.json', import.meta.url))) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['better-auth']).toBe(PINNED);
  });

  it('la versión instalada es la fijada', async () => {
    const installed = (await readJson(new URL('../node_modules/better-auth/package.json', import.meta.url))) as { version: string };
    expect(installed.version).toBe(PINNED);
  });
});
