import { appointments, appointmentTypes, createTenantDb, encounters, kioskCheckins, nextCode, patients } from '@clinic/db';
import type { ArrivalResult, EncounterDetail, KioskArrivalDetail, KioskArrivals, KioskPairing } from '@clinic/shared';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { Client, createStaff, NORTE, readAudit, signedInWithContext, startApp, SUR, type TestApp } from './support.ts';

// T-021: llegadas del kiosco en Recepción (S-REC-28), con el reloj fijado.
//  - La bandeja: pendientes de la sede, sin vencer, auditada sin datos; solo Recepción.
//  - Coincidencias por nombre, fecha de nacimiento y teléfono.
//  - Confirmar con la llegada (con y sin cita): la visita guarda el motivo
//    declarado; el contenido del registro se borra; confirmar dos veces no
//    crea dos visitas.
//  - Descartar con motivo; un registro vencido no se confirma.
// Datos ficticios.

/** 5 nov 2026, 10:00 a. m. en Chicago (NOR1). */
const NOW = '2026-11-05T16:00:00Z';

describe('T-021 llegadas del kiosco en Recepción', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let admin: Client;
  let recepcion: Client;
  let enfermeria: Client;
  let surRecepcion: Client;
  let tablet: Client;
  let consulta = '';
  let counter = 0;
  const db = () => createTenantDb(app.pool);
  const key = () => `ka-${String(Date.now())}-${String((counter += 1))}`;
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;

  beforeAll(async () => {
    app = await startApp({}, { clock });
    admin = await signedInWithContext(app, await createStaff(app, 'ka-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    recepcion = await signedInWithContext(app, await createStaff(app, 'ka-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'ka-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    surRecepcion = await signedInWithContext(app, await createStaff(app, 'ka-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    const pairing = (await admin.post(`/api/locations/${NORTE.locations[0].id}/kiosks`, { name: 'Tableta ficticia' })).json<KioskPairing>();
    tablet = new Client(app);
    expect((await tablet.post('/api/kiosk/link', { locationCode: 'NOR1', code: pairing.code })).statusCode).toBe(200);
    const types = await db().withTenant(NORTE.id, (tx) => tx.select({ id: appointmentTypes.id, code: appointmentTypes.code }).from(appointmentTypes));
    consulta = types.find((t) => t.code === 'CONSULTA')?.id ?? '';
  });
  afterAll(async () => {
    await app.close();
  });

  /** Un envío del kiosco con datos ficticios únicos; devuelve su id (el más reciente de la tableta). */
  async function submit(extra: Record<string, unknown> = {}): Promise<{ id: string; body: Record<string, unknown> }> {
    counter += 1;
    const body = {
      firstName: 'Quirina',
      lastName: `Kioscal Prueba${String.fromCharCode(65 + (counter % 26))}${String.fromCharCode(65 + Math.floor(counter / 26))}`,
      birthDate: '1984-07-09',
      phone: `21455${String(10000 + counter).slice(-5)}`,
      firstVisit: false,
      reason: 'sick',
      symptoms: 'Síntoma ficticio de la bandeja',
      ...extra,
    };
    const response = await tablet.post('/api/kiosk/checkins', body, { 'idempotency-key': key() });
    expect(response.statusCode, response.body).toBe(201);
    const list = (await recepcion.get('/api/kiosk-arrivals')).json<KioskArrivals>();
    const row = list.rows.find((r) => r.lastName === body.lastName);
    if (!row) throw new Error('el registro no aparece en la bandeja');
    return { id: row.id, body };
  }

  async function newPatient(extra: Partial<typeof patients.$inferInsert> = {}): Promise<string> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: NORTE.id,
        registeredLocationId: NORTE.locations[0].id,
        code: await nextCode(tx, NORTE.id, 'patient'),
        firstName: 'Otra',
        lastName: `Persona ${String((counter += 1))}`,
        birthDate: '1970-01-01',
        ...extra,
      });
      return id;
    });
  }

  const checkin = async (id: string) => (await db().withTenant(NORTE.id, (tx) => tx.select().from(kioskCheckins).where(eq(kioskCheckins.id, id))))[0];
  const walkIn = (patientId: string, kioskCheckinId: string, k = key()) =>
    recepcion.post('/api/encounters', { source: 'walk_in', patientId, appointmentTypeId: null, route: 'STANDARD', coverage: { type: 'self_pay' }, kioskCheckinId }, { 'idempotency-key': k });

  it('la bandeja muestra los pendientes de la sede, auditada sin datos; solo Recepción', async () => {
    clock.set(NOW);
    const { id, body } = await submit({ firstVisit: true, reason: 'results' });
    const list = await recepcion.get('/api/kiosk-arrivals');
    expect(list.statusCode).toBe(200);
    const data = list.json<KioskArrivals>();
    expect(data).toMatchObject({ serverNow: new Date(NOW).toISOString(), timeZone: 'America/Chicago', today: '2026-11-05' });
    expect(data.rows.find((r) => r.id === id)).toMatchObject({
      firstName: 'Quirina',
      lastName: body.lastName,
      birthDate: '1984-07-09',
      phone: body.phone,
      firstVisit: true,
      reason: 'results',
      symptoms: 'Síntoma ficticio de la bandeja',
      createdAt: new Date(NOW).toISOString(),
    });
    expect((await enfermeria.get('/api/kiosk-arrivals')).statusCode).toBe(403);
    expect((await admin.get('/api/kiosk-arrivals')).statusCode).toBe(403);
    expect((await surRecepcion.get('/api/kiosk-arrivals')).json<KioskArrivals>().rows.some((r) => r.id === id)).toBe(false);
    expect((await surRecepcion.get(`/api/kiosk-arrivals/${id}`)).statusCode).toBe(404);
    const audit = await readAudit(`action = 'kiosk.arrivals_list' and organization_id = $1`, [NORTE.id]);
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain('Quirina');
  });

  it('coincidencias: nombre, fecha de nacimiento y teléfono; las de más datos primero', async () => {
    clock.set(NOW);
    const { id, body } = await submit();
    const same = await newPatient({ firstName: 'Quirina', lastName: String(body.lastName), birthDate: '1984-07-09', phone: String(body.phone) });
    const phoneOnly = await newPatient({ phone: String(body.phone) });
    const detail = await recepcion.get(`/api/kiosk-arrivals/${id}`);
    expect(detail.statusCode, detail.body).toBe(200);
    const data = detail.json<KioskArrivalDetail>();
    expect(data.arrival).toMatchObject({ id, lastName: body.lastName });
    expect(data.candidates[0]).toMatchObject({ patient: { id: same }, matches: { name: true, birthDate: true, phone: true } });
    expect(data.candidates.find((c) => c.patient.id === phoneOnly)?.matches).toEqual({ name: false, birthDate: false, phone: true });
    expect(await readAudit(`action = 'kiosk.arrival_view' and entity_id = $1`, [id])).toHaveLength(1);
  });

  it('confirmar sin cita: visita «kiosk» con el motivo declarado; el contenido se borra; dos veces no crea dos visitas', async () => {
    clock.set(NOW);
    const { id } = await submit({ reason: 'injection', symptoms: 'Vengo por la segunda dosis (ficticia)' });
    const patientId = await newPatient();
    const k = key();
    const first = await walkIn(patientId, id, k);
    expect(first.statusCode, first.body).toBe(201);
    const encounterId = first.json<ArrivalResult>().encounter.id;
    // La misma clave: la misma visita.
    const again = await walkIn(patientId, id, k);
    expect(again.statusCode).toBe(201);
    expect(again.json<ArrivalResult>().encounter.id).toBe(encounterId);
    // Otra clave: el registro ya está resuelto.
    const other = await walkIn(patientId, id);
    expect(other.statusCode).toBe(409);
    expect(code(other)).toBe('kiosk_checkin_resolved');
    const opened = await db().withTenant(NORTE.id, (tx) => tx.select().from(encounters).where(eq(encounters.patientId, patientId)));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ source: 'kiosk', status: 'CHECKED_IN', route: 'STANDARD' });
    expect(opened[0]?.declaredReasonEnc).not.toContain('segunda dosis');
    const detail = (await recepcion.get(`/api/encounters/${encounterId}`)).json<EncounterDetail>();
    expect(detail.declaredReason).toEqual({ reason: 'injection', symptoms: 'Vengo por la segunda dosis (ficticia)' });
    expect((await enfermeria.get(`/api/encounters/${encounterId}`)).json<EncounterDetail>().declaredReason?.reason).toBe('injection');
    // Tras confirmar, el contenido ya no existe: solo los metadatos.
    expect(await checkin(id)).toMatchObject({
      status: 'confirmed',
      contentEnc: null,
      contentPurgedAt: new Date(NOW),
      patientId,
      encounterId,
      resolvedAt: new Date(NOW),
    });
    expect((await recepcion.get('/api/kiosk-arrivals')).json<KioskArrivals>().rows.some((r) => r.id === id)).toBe(false);
    const audit = await readAudit(`action = 'kiosk.checkin_confirmed' and entity_id = $1`, [id]);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(await readAudit(`organization_id = $1`, [NORTE.id]))).not.toContain('segunda dosis');
  });

  it('confirmar con la cita de hoy: la cita pasa a «Llegó» y la visita es de la cita', async () => {
    clock.set(NOW);
    const { id } = await submit();
    const patientId = await newPatient();
    const appointmentId = uuidv7();
    await db().withTenant(NORTE.id, (tx) =>
      tx.insert(appointments).values({
        id: appointmentId,
        organizationId: NORTE.id,
        locationId: NORTE.locations[0].id,
        patientId,
        appointmentTypeId: consulta,
        code: `NOR1-A-7${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
        startsAt: new Date('2026-11-05T21:00:00Z'),
        durationMinutes: 20,
      }),
    );
    expect((await recepcion.get(`/api/kiosk-arrivals/today-appointment/${patientId}`)).json()).toEqual({ appointmentId });
    expect((await recepcion.get(`/api/kiosk-arrivals/today-appointment/${await newPatient()}`)).json()).toEqual({ appointmentId: null });
    const response = await recepcion.post(
      '/api/encounters',
      { source: 'appointment', appointmentId, expectedVersion: 1, route: 'LAB_ONLY', coverage: { type: 'self_pay' }, kioskCheckinId: id },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<ArrivalResult>();
    expect(result.appointment).toMatchObject({ id: appointmentId, status: 'ARRIVED' });
    expect(result.encounter.route).toBe('LAB_ONLY');
    const [visit] = await db().withTenant(NORTE.id, (tx) => tx.select().from(encounters).where(eq(encounters.id, result.encounter.id)));
    expect(visit).toMatchObject({ source: 'appointment', appointmentId });
    expect(await checkin(id)).toMatchObject({ status: 'confirmed', contentEnc: null, encounterId: result.encounter.id });
  });

  it('descartar con motivo borra el contenido; sin motivo, 400; después ya no se confirma', async () => {
    clock.set(NOW);
    const { id } = await submit();
    expect((await recepcion.post(`/api/kiosk-arrivals/${id}/discard`, {})).statusCode).toBe(400);
    expect((await enfermeria.post(`/api/kiosk-arrivals/${id}/discard`, { reason: 'Prueba' })).statusCode).toBe(403);
    const discarded = await recepcion.post(`/api/kiosk-arrivals/${id}/discard`, { reason: 'Envío de prueba (ficticio)' });
    expect(discarded.statusCode, discarded.body).toBe(200);
    expect(await checkin(id)).toMatchObject({ status: 'discarded', contentEnc: null, patientId: null, encounterId: null });
    const audit = await readAudit(`action = 'kiosk.checkin_discarded' and entity_id = $1`, [id]);
    expect(audit[0]?.reason).toBe('Envío de prueba (ficticio)');
    expect(code(await recepcion.post(`/api/kiosk-arrivals/${id}/discard`, { reason: 'Otra vez' }))).toBe('kiosk_checkin_resolved');
    expect(code(await walkIn(await newPatient(), id))).toBe('kiosk_checkin_resolved');
    expect((await recepcion.get(`/api/kiosk-arrivals/${id}`)).statusCode).toBe(409);
  });

  it('al cierre del día de la sede vence: sale de la bandeja y ya no se confirma', async () => {
    clock.set(NOW);
    const { id } = await submit();
    // 11:59 p. m. de la sede: sigue.
    clock.set('2026-11-06T05:59:00Z');
    expect((await recepcion.get('/api/kiosk-arrivals')).json<KioskArrivals>().rows.some((r) => r.id === id)).toBe(true);
    // 12:01 a. m.: vencido aunque el worker aún no haya pasado.
    clock.set('2026-11-06T06:01:00Z');
    expect((await recepcion.get('/api/kiosk-arrivals')).json<KioskArrivals>().rows.some((r) => r.id === id)).toBe(false);
    expect(code(await walkIn(await newPatient(), id))).toBe('kiosk_checkin_expired');
    expect((await checkin(id))?.status).toBe('pending');
    clock.set(NOW);
  });
});
