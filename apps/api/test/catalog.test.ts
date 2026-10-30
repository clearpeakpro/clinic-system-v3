import { AGENDA_COLOR_VALUES, CATALOG_CODE_PATTERN, createTenantDb, prices, PROCEDURE_KIND_VALUES, VISIT_ROUTE_VALUES } from '@clinic/db';
import { AGENDA_COLORS, CATALOG_CODE_REGEX, PROCEDURE_KINDS, VISIT_ROUTES, type CatalogItem, type CatalogList } from '@clinic/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type TestApp } from './support.ts';

// T-011: catálogo mínimo y precios (S-ADM-13 a 20). Precio general de la
// organización con excepción opcional por sede; el vigente lo calcula el
// servidor para una sede y un día; un cambio «desde mañana» no altera el de
// hoy; nada se borra; Sur no ve el catálogo de Norte.

const NOR1 = NORTE.locations[0].id;
const NOR2 = NORTE.locations[1].id;

/** El día siguiente a `AAAA-MM-DD`. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe('T-011 catálogo y precios', () => {
  let app: TestApp;
  let admin: Client;
  let surAdmin: Client;
  let recepcion: Client;

  beforeAll(async () => {
    app = await startApp();
    admin = await signedInWithContext(app, await createStaff(app, 'cat-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    surAdmin = await signedInWithContext(app, await createStaff(app, 'cat-sur', [{ org: SUR, location: null, role: 'administrador' }]), SUR, 0, { mfa: true });
    recepcion = await signedInWithContext(app, await createStaff(app, 'cat-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
  });
  afterAll(async () => {
    await app.close();
  });

  const list = async (client: Client, locationId?: string) => {
    const response = await client.get(`/api/admin/catalog${locationId ? `?locationId=${locationId}` : ''}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<CatalogList>();
  };
  const find = (catalog: CatalogList, code: string): CatalogItem | undefined =>
    Object.values(catalog.items)
      .flat()
      .find((i) => i.code === code);

  it('los valores permitidos de la web y de la base de datos son los mismos', () => {
    expect(CATALOG_CODE_REGEX.source).toBe(CATALOG_CODE_PATTERN);
    expect([...AGENDA_COLORS]).toEqual([...AGENDA_COLOR_VALUES]);
    expect([...PROCEDURE_KINDS]).toEqual([...PROCEDURE_KIND_VALUES]);
    expect([...VISIT_ROUTES]).toEqual([...VISIT_ROUTE_VALUES]);
  });

  it('el Administrador ve los cuatro catálogos de la semilla con el precio de cada sede', async () => {
    const nor1 = await list(admin);
    expect(nor1.locationId).toBe(NOR1);
    expect(nor1.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(nor1.items['appointment-types'].map((t) => t.code)).toEqual(['CONSULTA', 'SEGUIMIENTO']);
    // NOR1 usa el precio general; NOR2 tiene su propio precio.
    const generalB12 = { amountCents: 2000, effectiveFrom: '2026-01-01' };
    expect(find(nor1, 'INJ-B12')?.price).toEqual({
      general: { current: generalB12, next: null },
      location: { current: null, next: null },
      effective: generalB12,
    });
    const nor2 = find(await list(admin, NOR2), 'INJ-B12')?.price;
    expect(nor2?.effective).toEqual({ amountCents: 2200, effectiveFrom: '2026-01-01' });
    expect(nor2?.general.current).toEqual(generalB12);
    expect(find(nor1, 'PROC-LAVOT')?.price?.effective?.amountCents).toBe(3000);
    expect(nor1.items['referral-sources'][0]).not.toHaveProperty('price');
  });

  it('crea un procedimiento con precio general y uno propio en NOR2; los cambios «desde mañana» no alteran el de hoy', async () => {
    const { today, generalToday } = await list(admin);
    const base = { name: 'Curación ficticia', sortOrder: null, kind: 'procedure' };
    const created = await admin.post('/api/admin/catalog/procedures', {
      ...base,
      code: 'PROC-CURA',
      generalPrice: { amountCents: 4000, effectiveFrom: generalToday },
    });
    expect(created.statusCode, created.body).toBe(201);
    const { id } = created.json<{ id: string }>();
    const item = async (sede: string) => find(await list(admin, sede), 'PROC-CURA');
    const version = (await item(NOR1))?.version ?? 0;
    const save = (extra: Record<string, unknown>) => admin.post(`/api/admin/catalog/procedures/${id}`, { ...base, expectedVersion: version, ...extra });

    // Sin precio propio, las dos sedes usan el general.
    expect((await item(NOR1))?.price?.effective?.amountCents).toBe(4000);
    expect((await item(NOR2))?.price?.effective?.amountCents).toBe(4000);
    // NOR2 tiene su propio precio desde hoy; NOR1 sigue con el general.
    expect((await save({ locationPrice: { locationId: NOR2, amountCents: 4500, effectiveFrom: today } })).statusCode).toBe(204);
    expect((await item(NOR2))?.price?.effective?.amountCents).toBe(4500);
    expect((await item(NOR1))?.price?.effective?.amountCents).toBe(4000);

    // Desde mañana: un general nuevo y un precio propio de NOR1. Hoy no cambia nada.
    const tomorrow = nextDay(generalToday);
    expect((await save({ generalPrice: { amountCents: 5000, effectiveFrom: tomorrow } })).statusCode).toBe(204);
    expect((await save({ locationPrice: { locationId: NOR1, amountCents: 5500, effectiveFrom: nextDay(today) } })).statusCode).toBe(204);
    const nor1 = (await item(NOR1))?.price;
    expect(nor1).toEqual({
      general: { current: { amountCents: 4000, effectiveFrom: generalToday }, next: { amountCents: 5000, effectiveFrom: tomorrow } },
      location: { current: null, next: { amountCents: 5500, effectiveFrom: nextDay(today) } },
      effective: { amountCents: 4000, effectiveFrom: generalToday },
    });
    // La excepción de NOR2 no depende del general.
    expect((await item(NOR2))?.price?.effective?.amountCents).toBe(4500);
    // Lo mismo para el resto del personal (sede activa NOR1).
    const forStaff = (await recepcion.get('/api/catalog')).json<CatalogList>();
    expect(find(forStaff, 'PROC-CURA')?.price?.effective?.amountCents).toBe(4000);

    // Sin contexto RLS, los precios no se ven.
    const { rows } = await app.pool.query<{ n: number }>('select count(*)::int as n from app.prices where procedure_id = $1', [id]);
    expect(rows[0]?.n).toBe(0);
    const audit = await readAudit(`action = 'catalog.price_set' and entity_id = $1`, [id]);
    expect(audit.map((a) => a.metadata)).toEqual([
      { priceLocationId: 'general', effectiveFrom: generalToday, previousCents: 'none', newCents: 4000 },
      // En NOR2, el anterior era el general.
      { priceLocationId: NOR2, effectiveFrom: today, previousCents: 4000, newCents: 4500 },
      { priceLocationId: 'general', effectiveFrom: tomorrow, previousCents: 4000, newCents: 5000 },
      { priceLocationId: NOR1, effectiveFrom: nextDay(today), previousCents: 5000, newCents: 5500 },
    ]);
  });

  it('con la misma fecha gana el último precio, y los dos se conservan', async () => {
    const before = await list(admin);
    const strep = find(before, 'LAB-STREP');
    expect(strep).toBeDefined();
    const save = (amountCents: number) =>
      admin.post(`/api/admin/catalog/lab-tests/${strep?.id ?? ''}`, {
        name: strep?.name,
        sortOrder: strep?.sortOrder ?? null,
        expectedVersion: strep?.version,
        generalPrice: { amountCents, effectiveFrom: before.generalToday },
      });
    expect((await save(2900)).statusCode).toBe(204);
    expect((await save(3100)).statusCode).toBe(204);
    expect(find(await list(admin), 'LAB-STREP')?.price?.general.current).toEqual({ amountCents: 3100, effectiveFrom: before.generalToday });
  });

  it('P-15: NOR2 vuelve al precio general desde mañana; hoy sigue su precio propio', async () => {
    const before = await list(admin, NOR2);
    const b12 = find(before, 'INJ-B12');
    expect(b12?.price?.effective?.amountCents).toBe(2200);
    const tomorrow = nextDay(before.today);
    const response = await admin.post(`/api/admin/catalog/procedures/${b12?.id ?? ''}/use-general`, { locationId: NOR2, effectiveFrom: tomorrow });
    expect(response.statusCode, response.body).toBe(204);
    const after = find(await list(admin, NOR2), 'INJ-B12')?.price;
    expect(after?.effective).toEqual({ amountCents: 2200, effectiveFrom: '2026-01-01' });
    expect(after?.location.next).toEqual({ amountCents: null, effectiveFrom: tomorrow });
    const audit = await readAudit(`action = 'catalog.price_use_general' and entity_id = $1`, [b12?.id]);
    expect(audit.map((a) => a.metadata)).toEqual([{ priceLocationId: NOR2, effectiveFrom: tomorrow, previousCents: 2200 }]);
  });

  it('P-15: propio → general → otra vez propio, sin borrar ni modificar nada', async () => {
    const { today, generalToday } = await list(admin, NOR2);
    const created = await admin.post('/api/admin/catalog/procedures', {
      code: 'PROC-VUELTA',
      name: 'Procedimiento ficticio de vuelta',
      sortOrder: null,
      kind: 'procedure',
      generalPrice: { amountCents: 4000, effectiveFrom: generalToday },
    });
    const { id } = created.json<{ id: string }>();
    // El pasado no se escribe por la API: se simula con filas de días anteriores.
    await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.insert(prices).values([
        { organizationId: NORTE.id, locationId: null, procedureId: id, amountCents: 3900, effectiveFrom: addDays(today, -5) },
        { organizationId: NORTE.id, locationId: NOR2, procedureId: id, amountCents: 4500, effectiveFrom: addDays(today, -3) },
        { organizationId: NORTE.id, locationId: NOR2, procedureId: id, amountCents: null, effectiveFrom: addDays(today, -1) },
      ]),
    );
    // «Mañana» ya llegó: desde ayer NOR2 usa el general.
    let price = find(await list(admin, NOR2), 'PROC-VUELTA')?.price;
    expect(price?.location.current).toEqual({ amountCents: null, effectiveFrom: addDays(today, -1) });
    expect(price?.effective?.amountCents).toBe(4000);
    // Otra vez precio propio, desde hoy.
    const version = find(await list(admin, NOR2), 'PROC-VUELTA')?.version;
    expect(
      (await admin.post(`/api/admin/catalog/procedures/${id}`, {
        name: 'Procedimiento ficticio de vuelta',
        sortOrder: null,
        kind: 'procedure',
        expectedVersion: version,
        locationPrice: { locationId: NOR2, amountCents: 4800, effectiveFrom: today },
      })).statusCode,
    ).toBe(204);
    price = find(await list(admin, NOR2), 'PROC-VUELTA')?.price;
    expect(price?.effective).toEqual({ amountCents: 4800, effectiveFrom: today });
    // NOR1 nunca tuvo precio propio: siempre el general.
    expect(find(await list(admin, NOR1), 'PROC-VUELTA')?.price?.effective?.amountCents).toBe(4000);
    // El historial de NOR2 se conserva completo.
    const rows = await createTenantDb(app.pool).withTenant(NORTE.id, (tx) => tx.select().from(prices));
    expect(rows.filter((r) => r.procedureId === id && r.locationId === NOR2).map((r) => r.amountCents)).toEqual([4500, null, 4800]);
  });

  it('P-15: «Volver al precio general» exige un precio propio, una fecha de hoy o después y un catálogo con precio', async () => {
    const catalog = await list(admin);
    const lavot = find(catalog, 'PROC-LAVOT');
    const noOwn = await admin.post(`/api/admin/catalog/procedures/${lavot?.id ?? ''}/use-general`, { locationId: NOR1, effectiveFrom: catalog.today });
    expect([noOwn.statusCode, noOwn.json<{ code: string }>().code]).toEqual([409, 'no_location_price']);
    const strep = find(await list(admin, NOR2), 'LAB-STREP');
    const past = await admin.post(`/api/admin/catalog/lab-tests/${strep?.id ?? ''}/use-general`, { locationId: NOR2, effectiveFrom: '2026-01-01' });
    expect(past.json()).toEqual({ code: 'effective_from_past' });
    const source = find(catalog, 'REDES');
    expect((await admin.post(`/api/admin/catalog/referral-sources/${source?.id ?? ''}/use-general`, { locationId: NOR2, effectiveFrom: catalog.today })).statusCode).toBe(404);
    expect((await recepcion.post(`/api/admin/catalog/lab-tests/${strep?.id ?? ''}/use-general`, { locationId: NOR2, effectiveFrom: catalog.today })).statusCode).toBe(403);
  });

  it('rechaza una vigencia pasada, un código repetido, una versión vieja y desactivar sin motivo', async () => {
    const catalog = await list(admin);
    const b12 = find(catalog, 'INJ-B12');
    const base = { name: 'Inyección de vitamina B12', sortOrder: 10, kind: 'injection', expectedVersion: b12?.version };
    const past = await admin.post(`/api/admin/catalog/procedures/${b12?.id ?? ''}`, { ...base, generalPrice: { amountCents: 100, effectiveFrom: '2026-01-01' } });
    expect(past.json()).toEqual({ code: 'effective_from_past' });
    const pastSite = await admin.post(`/api/admin/catalog/procedures/${b12?.id ?? ''}`, {
      ...base,
      locationPrice: { locationId: NOR1, amountCents: 100, effectiveFrom: '2026-01-01' },
    });
    expect(pastSite.json()).toEqual({ code: 'effective_from_past' });
    const taken = await admin.post('/api/admin/catalog/referral-sources', { code: 'REDES', name: 'Repetida', sortOrder: null });
    expect([taken.statusCode, taken.json<{ code: string }>().code]).toEqual([409, 'catalog_code_taken']);
    const stale = await admin.post(`/api/admin/catalog/procedures/${b12?.id ?? ''}`, { ...base, expectedVersion: 999 });
    expect([stale.statusCode, stale.json<{ code: string }>().code]).toEqual([409, 'version_conflict']);
    const noReason = await admin.post(`/api/admin/catalog/procedures/${b12?.id ?? ''}/deactivate`, { expectedVersion: b12?.version });
    expect(noReason.statusCode).toBe(400);
    expect((await admin.post('/api/admin/catalog/otros', {})).statusCode).toBe(404);
  });

  it('desactivar con motivo oculta el ítem al personal; reactivar lo devuelve; todo queda auditado', async () => {
    const source = find(await list(admin), 'LETRERO');
    const id = source?.id ?? '';
    expect((await admin.post(`/api/admin/catalog/referral-sources/${id}/deactivate`, { reason: 'Ya no se usa', expectedVersion: source?.version })).statusCode).toBe(204);
    const inactive = find(await list(admin), 'LETRERO');
    expect(inactive?.active).toBe(false);
    expect(find((await recepcion.get('/api/catalog')).json<CatalogList>(), 'LETRERO')).toBeUndefined();
    expect((await admin.post(`/api/admin/catalog/referral-sources/${id}/reactivate`, { expectedVersion: inactive?.version })).statusCode).toBe(204);
    expect(find((await recepcion.get('/api/catalog')).json<CatalogList>(), 'LETRERO')).toBeDefined();
    const audit = await readAudit(`entity_id = $1`, [id]);
    expect(audit.map((a) => [a.action, a.reason])).toEqual([
      ['catalog.deactivated', 'Ya no se usa'],
      ['catalog.reactivated', null],
    ]);
  });

  it('solo Propietario y Administrador gestionan; el resto solo lee lo activo', async () => {
    expect((await recepcion.get('/api/admin/catalog')).statusCode).toBe(403);
    expect((await recepcion.post('/api/admin/catalog/referral-sources', { code: 'X-1', name: 'X', sortOrder: null })).statusCode).toBe(403);
    const forStaff = (await recepcion.get('/api/catalog')).json<CatalogList>();
    expect(Object.values(forStaff.items).flat().every((i) => i.active)).toBe(true);
  });

  it('Sur no ve el catálogo de Norte ni puede pedir sus precios', async () => {
    const norte = find(await list(admin), 'PROC-CURA');
    const sur = await list(surAdmin);
    expect(find(sur, 'PROC-CURA')).toBeUndefined();
    expect(find(sur, 'INJ-B12')?.id).not.toBe(find(await list(admin), 'INJ-B12')?.id);
    expect((await surAdmin.get(`/api/admin/catalog?locationId=${NOR1}`)).json()).toEqual({ code: 'invalid_location' });
    expect((await surAdmin.post(`/api/admin/catalog/procedures/${norte?.id ?? ''}/deactivate`, { reason: 'x', expectedVersion: 1 })).statusCode).toBe(404);
  });
});
