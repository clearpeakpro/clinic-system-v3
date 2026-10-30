import { REALTIME_CHANNEL } from '@clinic/db';
import type { CatalogItem, CatalogList } from '@clinic/shared';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type TestApp } from './support.ts';

// T-011b (ADR 0028): proveedores de laboratorio (S-ADM-17) y «Laboratorios
// que la realizan» en el formulario de la prueba (S-ADM-16). Los costos solo
// los ven y editan Propietario y Administrador; nunca en el catálogo del
// personal, en los logs ni en los eventos en vivo. Datos ficticios.

/** Un costo fácil de buscar en logs y eventos: no aparece en la semilla. */
const MARKER_CENTS = 98_765;

function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe('T-011b laboratorios y costos', () => {
  let app: TestApp;
  let admin: Client;
  let propietario: Client;
  let surAdmin: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let recepcion: Client;
  let listener: pg.Client;
  const events: string[] = [];

  beforeAll(async () => {
    app = await startApp();
    admin = await signedInWithContext(app, await createStaff(app, 'lab-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    propietario = await signedInWithContext(app, await createStaff(app, 'lab-prop', [{ org: NORTE, location: null, role: 'propietario' }]), NORTE, 0, {
      mfa: true,
    });
    surAdmin = await signedInWithContext(app, await createStaff(app, 'lab-sur', [{ org: SUR, location: null, role: 'administrador' }]), SUR, 0, { mfa: true });
    enfermeria = await signedInWithContext(app, await createStaff(app, 'lab-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'lab-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    recepcion = await signedInWithContext(app, await createStaff(app, 'lab-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    listener = new pg.Client({ connectionString: inject('appUrl') });
    await listener.connect();
    listener.on('notification', (n) => events.push(n.payload ?? ''));
    await listener.query(`LISTEN ${REALTIME_CHANNEL}`);
  });
  afterAll(async () => {
    await listener.end();
    await app.close();
  });

  const list = async (client: Client = admin) => {
    const response = await client.get('/api/admin/catalog');
    expect(response.statusCode, response.body).toBe(200);
    return response.json<CatalogList>();
  };
  const test = (catalog: CatalogList, code: string): CatalogItem | undefined => catalog.items['lab-tests'].find((i) => i.code === code);
  const providerId = (catalog: CatalogList, name: string) => catalog.labProviders?.find((p) => p.name === name)?.id ?? '';
  const codeOf = () => `LAB-T${String(Math.random()).slice(2, 8)}`;
  /** Crea una prueba propia de cada caso (las de la semilla las usan otras pruebas). */
  const createTest = async (labCosts: unknown[] = []) => {
    const { generalToday } = await list();
    const code = codeOf();
    const response = await admin.post('/api/admin/catalog/lab-tests', {
      code,
      name: 'Prueba ficticia de laboratorio',
      sortOrder: null,
      generalPrice: { amountCents: 3000, effectiveFrom: generalToday },
      labCosts,
    });
    expect(response.statusCode, response.body).toBe(201);
    return { id: response.json<{ id: string }>().id, code };
  };
  const save = async (code: string, labCosts: unknown[]) => {
    const item = test(await list(), code);
    return admin.post(`/api/admin/catalog/lab-tests/${item?.id ?? ''}`, {
      name: item?.name,
      sortOrder: item?.sortOrder ?? null,
      expectedVersion: item?.version,
      labCosts,
    });
  };

  it('la semilla: LabCorp, Quest y CPL por preferencia; A1c con sus tres costos; estreptococo sin laboratorio', async () => {
    const catalog = await list();
    expect(catalog.labProviders?.map((p) => [p.name, p.preference, p.active])).toEqual(
      expect.arrayContaining([
        ['LabCorp', 1, true],
        ['Quest Diagnostics', 2, true],
        ['CPL', 3, true],
      ]),
    );
    const a1c = test(catalog, 'LAB-A1C')?.labs ?? [];
    const cost = (name: string) => a1c.find((l) => l.labProviderId === providerId(catalog, name))?.current;
    expect(cost('LabCorp')).toEqual({ amountCents: 1200, effectiveFrom: '2026-01-01' });
    expect(cost('CPL')).toEqual({ amountCents: 900, effectiveFrom: '2026-01-01' });
    expect(cost('Quest Diagnostics')).toEqual({ amountCents: 1100, effectiveFrom: '2026-01-01' });
    expect(test(catalog, 'LAB-PSA')?.labs?.some((l) => l.labProviderId === providerId(catalog, 'Quest Diagnostics'))).toBe(false);
    expect(test(catalog, 'LAB-STREP')?.labs).toEqual([]);
    // Los demás catálogos no llevan laboratorios.
    expect(catalog.items.procedures[0]).not.toHaveProperty('labs');
  });

  it('alta, edición, desactivación y reactivación de un laboratorio, con auditoría', async () => {
    const created = await admin.post('/api/admin/lab-providers', { name: 'Laboratorio Ficticio Uno', preference: 4 });
    expect(created.statusCode, created.body).toBe(201);
    const { id } = created.json<{ id: string }>();
    // El nombre es único sin distinguir mayúsculas.
    expect((await admin.post('/api/admin/lab-providers', { name: 'laboratorio ficticio uno', preference: 5 })).json()).toEqual({ code: 'lab_provider_name_taken' });
    expect((await admin.post('/api/admin/lab-providers', { name: 'Otro', preference: 0 })).statusCode).toBe(400);
    expect((await admin.post(`/api/admin/lab-providers/${id}`, { name: 'Laboratorio Ficticio Uno', preference: 2, expectedVersion: 1 })).statusCode).toBe(204);
    expect((await admin.post(`/api/admin/lab-providers/${id}`, { name: 'X', preference: 2, expectedVersion: 1 })).json()).toEqual({ code: 'version_conflict' });
    expect((await admin.post(`/api/admin/lab-providers/${id}/deactivate`, { expectedVersion: 2 })).statusCode).toBe(400);
    expect((await propietario.post(`/api/admin/lab-providers/${id}/deactivate`, { reason: 'Ya no trabajamos con él', expectedVersion: 2 })).statusCode).toBe(204);
    expect((await list()).labProviders?.find((p) => p.id === id)).toMatchObject({ preference: 2, active: false, version: 3 });
    expect((await admin.post(`/api/admin/lab-providers/${id}/reactivate`, { expectedVersion: 3 })).statusCode).toBe(204);
    const audit = await readAudit(`entity_id = $1`, [id]);
    expect(audit.map((a) => [a.action, a.reason, a.metadata])).toEqual([
      ['lab_provider.created', null, { preference: 4 }],
      ['lab_provider.updated', null, { fields: 'preference' }],
      ['lab_provider.deactivated', 'Ya no trabajamos con él', null],
      ['lab_provider.reactivated', null, null],
    ]);
  });

  it('marcar, cambiar el costo desde mañana y desmarcar: el historial se conserva y queda auditado', async () => {
    const catalog = await list();
    const labcorp = providerId(catalog, 'LabCorp');
    const cpl = providerId(catalog, 'CPL');
    const { generalToday } = catalog;
    const { id, code } = await createTest([
      { labProviderId: labcorp, amountCents: 1500, effectiveFrom: generalToday },
      { labProviderId: cpl, amountCents: 1300, effectiveFrom: generalToday },
    ]);
    const tomorrow = nextDay(generalToday);
    expect((await save(code, [{ labProviderId: labcorp, amountCents: 1700, effectiveFrom: tomorrow }])).statusCode).toBe(204);
    expect((await save(code, [{ labProviderId: cpl, amountCents: null, effectiveFrom: generalToday }])).statusCode).toBe(204);
    const labs = test(await list(), code)?.labs;
    expect(labs).toEqual(
      expect.arrayContaining([
        { labProviderId: labcorp, current: { amountCents: 1500, effectiveFrom: generalToday }, next: { amountCents: 1700, effectiveFrom: tomorrow } },
        // Desmarcado: «No la realiza desde» hoy.
        { labProviderId: cpl, current: { amountCents: null, effectiveFrom: generalToday }, next: null },
      ]),
    );
    expect(labs).toHaveLength(2);
    // Nada se borró: las cuatro filas siguen ahí (sin contexto no se ven).
    const { rows } = await app.pool.query('select * from app.lab_test_costs where lab_test_id = $1', [id]);
    expect(rows).toEqual([]);
    const audit = await readAudit(`entity_id = $1 and action like 'catalog.lab_%'`, [id]);
    expect(audit.map((a) => [a.action, a.metadata])).toEqual([
      ['catalog.lab_assigned', { labProviderId: labcorp, effectiveFrom: generalToday, previousCents: 'none', newCents: 1500 }],
      ['catalog.lab_assigned', { labProviderId: cpl, effectiveFrom: generalToday, previousCents: 'none', newCents: 1300 }],
      ['catalog.lab_cost_set', { labProviderId: labcorp, effectiveFrom: tomorrow, previousCents: 1500, newCents: 1700 }],
      ['catalog.lab_unassigned', { labProviderId: cpl, effectiveFrom: generalToday, previousCents: 1300, newCents: 'none' }],
    ]);
    // Se puede volver a marcar.
    expect((await save(code, [{ labProviderId: cpl, amountCents: 1250, effectiveFrom: tomorrow }])).statusCode).toBe(204);
    expect(test(await list(), code)?.labs?.find((l) => l.labProviderId === cpl)?.next).toEqual({ amountCents: 1250, effectiveFrom: tomorrow });
  });

  it('una prueba sin laboratorios se guarda; reglas de los cambios de costo', async () => {
    const { code } = await createTest();
    expect(test(await list(), code)?.labs).toEqual([]);
    const catalog = await list();
    const labcorp = providerId(catalog, 'LabCorp');
    const past = '2026-01-01';
    expect((await save(code, [{ labProviderId: labcorp, amountCents: 100, effectiveFrom: past }])).json()).toEqual({ code: 'effective_from_past' });
    // Desmarcar un laboratorio que nunca la hizo.
    expect((await save(code, [{ labProviderId: labcorp, amountCents: null, effectiveFrom: catalog.generalToday }])).json()).toEqual({ code: 'lab_not_assigned' });
    // Un laboratorio de otra organización no existe aquí.
    const surLab = providerId(await list(surAdmin), 'LabCorp');
    expect((await save(code, [{ labProviderId: surLab, amountCents: 100, effectiveFrom: catalog.generalToday }])).json()).toEqual({ code: 'invalid_lab_provider' });
    // Un laboratorio inactivo no se puede marcar.
    const created = await admin.post('/api/admin/lab-providers', { name: `Inactivo ${codeOf()}`, preference: 9 });
    const inactive = created.json<{ id: string }>().id;
    await admin.post(`/api/admin/lab-providers/${inactive}/deactivate`, { reason: 'Prueba', expectedVersion: 1 });
    expect((await save(code, [{ labProviderId: inactive, amountCents: 100, effectiveFrom: catalog.generalToday }])).json()).toEqual({ code: 'lab_provider_inactive' });
    // Dos cambios del mismo laboratorio en un guardado.
    expect(
      (
        await save(code, [
          { labProviderId: labcorp, amountCents: 100, effectiveFrom: catalog.generalToday },
          { labProviderId: labcorp, amountCents: 200, effectiveFrom: catalog.generalToday },
        ])
      ).statusCode,
    ).toBe(400);
    // Si un cambio falla, no se guarda nada de ese guardado (misma transacción).
    expect(test(await list(), code)?.labs).toEqual([]);
  });

  it('Enfermería, Proveedor y Recepción no leen ni editan costos, en ninguna respuesta', async () => {
    const catalog = await list();
    const labcorp = providerId(catalog, 'LabCorp');
    const a1c = test(catalog, 'LAB-A1C');
    for (const client of [enfermeria, proveedor, recepcion]) {
      expect((await client.get('/api/admin/catalog')).statusCode).toBe(403);
      expect((await client.post('/api/admin/lab-providers', { name: 'Intruso', preference: 1 })).statusCode).toBe(403);
      expect((await client.post(`/api/admin/lab-providers/${labcorp}/deactivate`, { reason: 'x', expectedVersion: 1 })).statusCode).toBe(403);
      expect(
        (
          await client.post(`/api/admin/catalog/lab-tests/${a1c?.id ?? ''}`, {
            name: a1c?.name,
            sortOrder: null,
            expectedVersion: a1c?.version,
            labCosts: [{ labProviderId: labcorp, amountCents: 1, effectiveFrom: catalog.generalToday }],
          })
        ).statusCode,
      ).toBe(403);
      const staff = await client.get('/api/catalog');
      expect(staff.statusCode).toBe(200);
      expect(staff.body).not.toMatch(/labProviders|"labs"|LabCorp|Quest|CPL/);
      // Ninguno de los costos de la semilla aparece.
      for (const cents of [1200, 1500, 1800, 900, 1900, 2100, 1100, 1400]) expect(staff.body).not.toContain(`"amountCents":${String(cents)}`);
    }
  });

  it('los costos no aparecen en los logs ni en los eventos en vivo', async () => {
    const catalog = await list();
    const { code } = await createTest([{ labProviderId: providerId(catalog, 'Quest Diagnostics'), amountCents: MARKER_CENTS, effectiveFrom: catalog.generalToday }]);
    expect((await save(code, [{ labProviderId: providerId(catalog, 'Quest Diagnostics'), amountCents: MARKER_CENTS + 1, effectiveFrom: catalog.generalToday }])).statusCode).toBe(204);
    expect(test(await list(), code)?.labs?.[0]?.current?.amountCents).toBe(MARKER_CENTS + 1);
    await listener.query('select 1'); // recibe los avisos pendientes
    for (const text of [app.logs.text(), events.join('\n')]) {
      expect(text).not.toContain(String(MARKER_CENTS));
      expect(text).not.toContain(String(MARKER_CENTS + 1));
    }
  });

  it('Sur no ve los laboratorios ni los costos de Norte, ni puede cambiarlos', async () => {
    const norte = await list();
    const sur = await list(surAdmin);
    const norteIds = new Set(norte.labProviders?.map((p) => p.id));
    expect(sur.labProviders?.some((p) => norteIds.has(p.id))).toBe(false);
    // Los mismos nombres, otros costos.
    const labcorp = (c: CatalogList) => test(c, 'LAB-A1C')?.labs?.find((l) => l.labProviderId === providerId(c, 'LabCorp'))?.current?.amountCents;
    expect(labcorp(norte)).toBe(1200);
    expect(labcorp(sur)).toBe(1300);
    const id = providerId(norte, 'CPL');
    expect((await surAdmin.post(`/api/admin/lab-providers/${id}`, { name: 'Intruso', preference: 1, expectedVersion: 1 })).statusCode).toBe(404);
    expect((await surAdmin.post(`/api/admin/lab-providers/${id}/deactivate`, { reason: 'x', expectedVersion: 1 })).statusCode).toBe(404);
  });
});
