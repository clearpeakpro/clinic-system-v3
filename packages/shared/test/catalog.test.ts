import { describe, expect, it } from 'vitest';
import {
  AGENDA_COLOR_LABELS,
  AGENDA_COLORS,
  CATALOG_CODE_REGEX,
  CATALOG_KINDS,
  createCatalogItemSchema,
  updateCatalogItemSchema,
} from '../src/catalog.ts';
import { permissionsFor, ROLES } from '../src/permissions.ts';

// T-011: reglas del catálogo que comparten la web y la API.

const NORTE_SEDE = '019a2000-0000-7000-8000-000000000011';

describe('catálogo', () => {
  it('el código acepta guion y exige mayúsculas, empezar por letra y de 2 a 41 caracteres', () => {
    for (const ok of ['INJ-B12', 'PROC_ECG12', 'AB', `A${'B'.repeat(40)}`]) expect(CATALOG_CODE_REGEX.test(ok), ok).toBe(true);
    for (const bad of ['inj-b12', '1ABC', 'A', `A${'B'.repeat(41)}`, 'INJ B12']) expect(CATALOG_CODE_REGEX.test(bad), bad).toBe(false);
  });

  it('ocho colores de agenda, sin rojo, ámbar ni verde', () => {
    expect(AGENDA_COLORS).toHaveLength(8);
    for (const color of AGENDA_COLORS) expect(AGENDA_COLOR_LABELS[color]).toBeTruthy();
    expect(AGENDA_COLORS.some((c) => ['red', 'amber', 'yellow', 'orange', 'green', 'emerald', 'lime'].includes(c))).toBe(false);
  });

  it('duración de 5 a 480 minutos', () => {
    const schema = createCatalogItemSchema('appointment-types');
    const base = { code: 'CONSULTA', name: 'Consulta', sortOrder: null, suggestedRoute: null, color: 'teal' };
    expect(schema.safeParse({ ...base, defaultDurationMinutes: 5 }).success).toBe(true);
    expect(schema.safeParse({ ...base, defaultDurationMinutes: 480 }).success).toBe(true);
    expect(schema.safeParse({ ...base, defaultDurationMinutes: 4 }).success).toBe(false);
    expect(schema.safeParse({ ...base, defaultDurationMinutes: 481 }).success).toBe(false);
    expect(schema.safeParse({ ...base, defaultDurationMinutes: null, color: 'red' }).success).toBe(false);
  });

  it('procedimientos y pruebas exigen el precio general al crear; el de la sede es opcional; al editar, los dos', () => {
    const generalPrice = { amountCents: 2500, effectiveFrom: '2026-11-01' };
    const locationPrice = { locationId: NORTE_SEDE, amountCents: 2700, effectiveFrom: '2026-11-01' };
    const create = createCatalogItemSchema('procedures');
    const base = { code: 'P-1', name: 'P', sortOrder: null, kind: 'procedure' };
    expect(create.safeParse(base).success).toBe(false);
    expect(create.safeParse({ ...base, locationPrice }).success).toBe(false);
    expect(create.safeParse({ ...base, generalPrice }).success).toBe(true);
    expect(create.safeParse({ ...base, generalPrice, locationPrice }).success).toBe(true);
    expect(create.safeParse({ ...base, generalPrice: { ...generalPrice, amountCents: 12.5 } }).success).toBe(false);
    const update = updateCatalogItemSchema('lab-tests');
    expect(update.safeParse({ name: 'L', sortOrder: 3, expectedVersion: 1 }).success).toBe(true);
    expect(update.safeParse({ name: 'L', sortOrder: 3, expectedVersion: 1, locationPrice }).success).toBe(true);
    // Las fuentes de referido no tienen precio.
    expect(createCatalogItemSchema('referral-sources').safeParse({ code: 'R-1', name: 'R', sortOrder: null, generalPrice }).data).not.toHaveProperty('generalPrice');
    expect(CATALOG_KINDS).toHaveLength(4);
  });

  it('solo Propietario y Administrador gestionan el catálogo', () => {
    const managers = ROLES.filter((r) => permissionsFor([r]).has('catalog.manage'));
    expect(managers).toEqual(['propietario', 'administrador']);
  });
});
