import { AGENDA_COLOR_VALUES, CATALOG_CODE_PATTERN, PROCEDURE_KIND_VALUES, VISIT_ROUTE_VALUES } from '@clinic/db';
import { AGENDA_COLORS, CATALOG_CODE_REGEX, PROCEDURE_KINDS, VISIT_ROUTES, type CatalogItem, type CatalogList } from '@clinic/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type TestApp } from './support.ts';

// T-011: catálogo mínimo y precios por sede (S-ADM-13 a 20). El precio
// vigente lo calcula el servidor para una sede y un día; un cambio «desde
// mañana» no altera el de hoy; nada se borra; Sur no ve el catálogo de Norte.

const NOR1 = NORTE.locations[0].id;
const NOR2 = NORTE.locations[1].id;

/** El día siguiente a `AAAA-MM-DD`. */
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
    expect(find(nor1, 'INJ-B12')?.price).toEqual({ current: { amountCents: 2000, effectiveFrom: '2026-01-01' }, next: null });
    expect(find(await list(admin, NOR2), 'INJ-B12')?.price?.current?.amountCents).toBe(2200);
    expect(nor1.items['referral-sources'][0]).not.toHaveProperty('price');
  });

  it('crea un procedimiento con precio en NOR1 y NOR2; el cambio de NOR1 «desde mañana» no altera el de hoy', async () => {
    const { today } = await list(admin);
    const created = await admin.post('/api/admin/catalog/procedures', {
      code: 'PROC-CURA',
      name: 'Curación ficticia',
      sortOrder: null,
      kind: 'procedure',
      price: { locationId: NOR1, amountCents: 4000, effectiveFrom: today },
    });
    expect(created.statusCode, created.body).toBe(201);
    const { id } = created.json<{ id: string }>();

    const item = () => list(admin).then((c) => find(c, 'PROC-CURA'));
    const version = (await item())?.version ?? 0;
    expect(
      (await admin.post(`/api/admin/catalog/procedures/${id}`, { name: 'Curación ficticia', sortOrder: null, kind: 'procedure', expectedVersion: version, price: { locationId: NOR2, amountCents: 4500, effectiveFrom: today } }))
        .statusCode,
    ).toBe(204);
    const tomorrow = nextDay(today);
    expect(
      (await admin.post(`/api/admin/catalog/procedures/${id}`, { name: 'Curación ficticia', sortOrder: null, kind: 'procedure', expectedVersion: version, price: { locationId: NOR1, amountCents: 5000, effectiveFrom: tomorrow } }))
        .statusCode,
    ).toBe(204);

    // Hoy sigue el precio anterior; el nuevo aparece como programado.
    expect((await item())?.price).toEqual({ current: { amountCents: 4000, effectiveFrom: today }, next: { amountCents: 5000, effectiveFrom: tomorrow } });
    expect(find(await list(admin, NOR2), 'PROC-CURA')?.price?.current?.amountCents).toBe(4500);
    // Lo mismo para el resto del personal.
    const forStaff = (await recepcion.get('/api/catalog')).json<CatalogList>();
    expect(find(forStaff, 'PROC-CURA')?.price?.current?.amountCents).toBe(4000);

    // Sin contexto RLS, los precios no se ven.
    const { rows } = await app.pool.query<{ n: number }>('select count(*)::int as n from app.prices where procedure_id = $1', [id]);
    expect(rows[0]?.n).toBe(0);
    const audit = await readAudit(`action = 'catalog.price_set' and entity_id = $1`, [id]);
    expect(audit.map((a) => a.metadata)).toEqual([
      { priceLocationId: NOR1, effectiveFrom: today, previousCents: 'none', newCents: 4000 },
      { priceLocationId: NOR2, effectiveFrom: today, previousCents: 'none', newCents: 4500 },
      { priceLocationId: NOR1, effectiveFrom: tomorrow, previousCents: 4000, newCents: 5000 },
    ]);
  });

  it('con la misma fecha gana el último precio, y los dos se conservan', async () => {
    const before = await list(admin);
    const strep = find(before, 'LAB-STREP');
    expect(strep).toBeDefined();
    const save = (amountCents: number) =>
      admin.post(`/api/admin/catalog/lab-tests/${strep?.id ?? ''}`, { name: strep?.name, sortOrder: strep?.sortOrder ?? null, expectedVersion: strep?.version, price: { locationId: NOR1, amountCents, effectiveFrom: before.today } });
    expect((await save(2900)).statusCode).toBe(204);
    expect((await save(3100)).statusCode).toBe(204);
    expect(find(await list(admin), 'LAB-STREP')?.price?.current).toEqual({ amountCents: 3100, effectiveFrom: before.today });
  });

  it('rechaza una vigencia pasada, un código repetido, una versión vieja y desactivar sin motivo', async () => {
    const catalog = await list(admin);
    const b12 = find(catalog, 'INJ-B12');
    const base = { name: 'Inyección de vitamina B12', sortOrder: 10, kind: 'injection', expectedVersion: b12?.version };
    const past = await admin.post(`/api/admin/catalog/procedures/${b12?.id ?? ''}`, { ...base, price: { locationId: NOR1, amountCents: 100, effectiveFrom: '2026-01-01' } });
    expect(past.json()).toEqual({ code: 'effective_from_past' });
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
