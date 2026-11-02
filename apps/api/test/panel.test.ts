import { appointments, appointmentTypes, createTenantDb, encounterEvents, encounters, locations, nextAppointmentCode, nextCode, nextEncounterCode, patients } from '@clinic/db';
import type { ArrivalResult, PanelSnapshot, VisitStatus } from '@clinic/shared';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, membershipIdOf, newOrganization, NORTE, readAudit, signedInWithContext, startApp, type Client, type TestApp } from './support.ts';

// T-019: Panel en vivo (S-REC-01 a 05).
//  - Métricas calculadas en el servidor con el día de la sede y el reloj
//    fijado; «En espera» incluye abiertas de días anteriores.
//  - Filas: abiertas de cualquier día y completadas hoy por su hora de cierre
//    (decisión del 2026-11-01); ni Se retiró ni Cancelada.
//  - «Alerta» y «Crítico» (ADR 0039) desde el estado actual, justo antes y
//    después de 5 y de 10 minutos, con los minutos de la organización.
//  - Cambio de día: 11:59 p. m. y 12:01 a. m. de la sede, también el día del
//    cambio de horario (1 nov 2026 en Chicago dura 25 horas).
// Una organización nueva para que las visitas de otras pruebas no cuenten.

/** 4 nov 2026, 11:00 a. m. en Chicago (CST, UTC−6). */
const NOW = '2026-11-04T17:00:00Z';

type Event = { to: VisitStatus; at: string };

describe('T-019 Panel en vivo', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let org: typeof NORTE;
  let owner: Client;
  let otherLocationId: string;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let proveedorMembership: string;
  let proveedor2Membership: string;
  let recepcionMembership: string;
  let typeId: string;
  const db = () => createTenantDb(app.pool);
  let counter = 0;

  beforeAll(async () => {
    app = await startApp({}, { clock });
    ({ org, owner } = await newOrganization(app, 'PNL1'));
    otherLocationId = uuidv7();
    typeId = uuidv7();
    await db().withTenant(org.id, async (tx) => {
      await tx.insert(locations).values({ id: otherLocationId, organizationId: org.id, code: 'PNL2', name: 'Sede PNL2', timezone: 'America/Chicago' });
      await tx.insert(appointmentTypes).values({
        id: typeId,
        organizationId: org.id,
        code: 'CONSULTA',
        name: 'Consulta general',
        defaultDurationMinutes: 20,
        suggestedRoute: 'STANDARD',
        color: 'teal',
        sortOrder: 10,
      });
    });
    const recepcionStaff = await createStaff(app, 'pn-rec', [{ org, location: 0, role: 'recepcion' }]);
    recepcion = await signedInWithContext(app, recepcionStaff, org, 0);
    recepcionMembership = await membershipIdOf(app, org, recepcionStaff.userId);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'pn-enf', [{ org, location: 0, role: 'enfermeria' }]), org, 0);
    const proveedorStaff = await createStaff(app, 'pn-prov', [{ org, location: 0, role: 'proveedor' }]);
    proveedor = await signedInWithContext(app, proveedorStaff, org, 0);
    proveedorMembership = await membershipIdOf(app, org, proveedorStaff.userId);
    proveedor2Membership = await membershipIdOf(app, org, (await createStaff(app, 'pn-prov2', [{ org, location: 0, role: 'proveedor' }])).userId);
  });
  afterAll(async () => {
    await app.close();
  });

  async function newPatient(): Promise<string> {
    return db().withTenant(org.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: org.id,
        registeredLocationId: org.locations[0].id,
        code: await nextCode(tx, org.id, 'patient'),
        firstName: 'Prueba',
        lastName: `Panel ${String((counter += 1))}`,
        birthDate: '1990-11-04',
      });
      return id;
    });
  }

  /** Una visita con su historial: la apertura en `arrivedAt` y cada cambio de `events`. */
  async function visit(options: {
    arrivedAt: string;
    events?: Event[];
    patientId?: string;
    locationId?: string;
    providerMembershipId?: string;
    typed?: boolean;
  }): Promise<{ id: string; code: string; patientId: string }> {
    const patientId = options.patientId ?? (await newPatient());
    const events = options.events ?? [];
    const last = events.at(-1);
    const status: VisitStatus = last?.to ?? 'CHECKED_IN';
    const closed = ['COMPLETED', 'LEFT_EARLY', 'CANCELLED'].includes(status);
    const locationId = options.locationId ?? org.locations[0].id;
    return db().withTenant(org.id, async (tx) => {
      const id = uuidv7();
      const code = await nextEncounterCode(tx, org.id, { id: locationId, code: locationId === otherLocationId ? 'PNL2' : 'PNL1' });
      await tx.insert(encounters).values({
        id,
        organizationId: org.id,
        locationId,
        patientId,
        appointmentTypeId: options.typed ? typeId : null,
        providerMembershipId: options.providerMembershipId ?? null,
        code,
        source: 'walk_in',
        route: 'STANDARD',
        status,
        arrivedAt: new Date(options.arrivedAt),
        closedAt: closed && last ? new Date(last.at) : null,
        version: events.length + 1,
      });
      let from: VisitStatus | null = null;
      for (const [index, e] of [{ to: 'CHECKED_IN' as VisitStatus, at: options.arrivedAt }, ...events].entries()) {
        await tx.insert(encounterEvents).values({
          organizationId: org.id,
          encounterId: id,
          locationId,
          action: index === 0 ? 'check_in' : 'force',
          fromStatus: from,
          toStatus: e.to,
          actorType: 'user',
          actorMembershipId: recepcionMembership,
          encounterVersion: index + 1,
          occurredAt: new Date(e.at),
        });
        from = e.to;
      }
      return { id, code, patientId };
    });
  }

  async function appointment(startsAt: string, status = 'SCHEDULED'): Promise<void> {
    const patientId = await newPatient();
    await db().withTenant(org.id, async (tx) => {
      await tx.insert(appointments).values({
        organizationId: org.id,
        locationId: org.locations[0].id,
        patientId,
        appointmentTypeId: typeId,
        code: await nextAppointmentCode(tx, org.id, { id: org.locations[0].id, code: 'PNL1' }),
        startsAt: new Date(startsAt),
        durationMinutes: 20,
        status,
      });
    });
  }

  const panel = async (client: Client = recepcion): Promise<PanelSnapshot> => {
    const response = await client.get('/api/panel');
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PanelSnapshot>();
  };

  /** Borra las visitas y citas de la organización entre pruebas (como operador de pruebas). */
  async function reset(): Promise<void> {
    const operator = new pg.Client({ connectionString: inject('operatorUrl') });
    await operator.connect();
    try {
      await operator.query('delete from app.coverages where organization_id = $1', [org.id]);
      await operator.query('delete from app.encounter_events where organization_id = $1', [org.id]);
      await operator.query('delete from app.encounters where organization_id = $1', [org.id]);
      await operator.query('delete from app.appointments where organization_id = $1', [org.id]);
    } finally {
      await operator.end();
    }
  }

  it('métricas, filas y «N citas hoy» con el día de la sede; lectura auditada sin nombres', async () => {
    await reset();
    clock.set(NOW);
    const yesterday = '2026-11-03T20:00:00Z';
    const a = await visit({ arrivedAt: yesterday }); // Registrado desde ayer: «En espera», no «Pacientes hoy».
    const b = await visit({ arrivedAt: '2026-11-04T16:50:00Z', events: [{ to: 'WAITING_FOR_NURSE', at: '2026-11-04T16:52:00Z' }], typed: true });
    await visit({ arrivedAt: '2026-11-04T16:40:00Z', events: [{ to: 'WITH_NURSE', at: '2026-11-04T16:45:00Z' }] });
    const d = await visit({
      arrivedAt: '2026-11-04T16:30:00Z',
      events: [{ to: 'WAITING_FOR_PROVIDER', at: '2026-11-04T16:45:00Z' }],
      providerMembershipId: proveedorMembership,
    });
    await visit({ arrivedAt: '2026-11-04T16:20:00Z', events: [{ to: 'WITH_PROVIDER', at: '2026-11-04T16:50:00Z' }] });
    await visit({ arrivedAt: '2026-11-04T16:10:00Z', events: [{ to: 'PROCEDURE_PENDING', at: '2026-11-04T16:15:00Z' }] });
    await visit({ arrivedAt: '2026-11-04T16:05:00Z', events: [{ to: 'READY_FOR_CHECKOUT', at: '2026-11-04T16:30:00Z' }] });
    await visit({ arrivedAt: '2026-11-04T16:00:00Z', events: [{ to: 'CHECKOUT', at: '2026-11-04T16:55:00Z' }] });
    const i = await visit({ arrivedAt: yesterday, events: [{ to: 'COMPLETED', at: '2026-11-04T16:00:00Z' }] }); // Llegó ayer, terminó hoy.
    await visit({ arrivedAt: '2026-11-03T15:00:00Z', events: [{ to: 'COMPLETED', at: '2026-11-03T18:00:00Z' }] }); // Terminó ayer.
    await visit({ arrivedAt: '2026-11-04T15:00:00Z', events: [{ to: 'LEFT_EARLY', at: '2026-11-04T15:30:00Z' }] }); // Cuenta en «Pacientes hoy».
    await visit({ arrivedAt: '2026-11-04T14:00:00Z', events: [{ to: 'CANCELLED', at: '2026-11-04T14:10:00Z' }], patientId: b.patientId }); // Mismo paciente.
    await visit({ arrivedAt: '2026-11-04T16:00:00Z', locationId: otherLocationId }); // Otra sede.
    await appointment('2026-11-04T15:00:00Z');
    await appointment('2026-11-05T05:50:00Z'); // 11:50 p. m. de hoy en la sede.
    await appointment('2026-11-04T15:30:00Z', 'CANCELLED');
    await appointment('2026-11-04T15:40:00Z', 'NO_SHOW');
    await appointment('2026-11-04T15:50:00Z', 'ARRIVED');
    await appointment('2026-11-05T06:10:00Z'); // Mañana en la sede.
    await appointment('2026-11-04T05:50:00Z'); // Ayer en la sede.

    const p = await panel();
    expect(p).toMatchObject({
      serverNow: new Date(NOW).toISOString(),
      today: '2026-11-04',
      timeZone: 'America/Chicago',
      location: { code: 'PNL1' },
      appointmentsToday: 3,
      metrics: {
        patientsToday: 8,
        waiting: 2,
        withNurse: 1,
        waitingForProvider: 1,
        withProvider: 1,
        procedurePending: 1,
        readyForCheckout: 1,
        checkout: 1,
        completedToday: 1,
      },
      waitThresholds: { alertMinutes: 5, criticalMinutes: 10 },
    });
    // Abiertas de cualquier día y la completada hoy, de la llegada más antigua a la más reciente.
    expect(p.rows.map((r) => r.status)).toEqual([
      'CHECKED_IN',
      'COMPLETED',
      'CHECKOUT',
      'READY_FOR_CHECKOUT',
      'PROCEDURE_PENDING',
      'WITH_PROVIDER',
      'WAITING_FOR_PROVIDER',
      'WITH_NURSE',
      'WAITING_FOR_NURSE',
    ]);
    expect(p.rows.map((r) => r.id)).toContain(i.id);
    const rowA = p.rows.find((r) => r.id === a.id);
    expect(rowA).toMatchObject({ statusSince: new Date(yesterday).toISOString(), waitLevel: 'critical', appointmentType: null, provider: null });
    const rowB = p.rows.find((r) => r.id === b.id);
    expect(rowB).toMatchObject({
      code: b.code,
      statusSince: '2026-11-04T16:52:00.000Z',
      waitLevel: 'alert',
      appointmentType: 'Consulta general',
      patient: { id: b.patientId, firstName: 'Prueba' },
    });
    expect(Object.keys(rowB?.patient ?? {}).sort()).toEqual(['code', 'firstName', 'id', 'lastName']);
    expect(p.rows.find((r) => r.id === d.id)).toMatchObject({ waitLevel: 'critical', provider: { membershipId: proveedorMembership, name: 'Persona pn-prov' } });
    // Ni en atención ni en Caja ni cerradas llevan marca.
    for (const r of p.rows.filter((row) => !['CHECKED_IN', 'WAITING_FOR_NURSE', 'WAITING_FOR_PROVIDER'].includes(row.status))) expect(r.waitLevel).toBe('none');
    // Menú de proveedor: los de la sede, sin quien llama.
    expect(p.providers.map((x) => x.membershipId).sort()).toEqual([proveedorMembership, proveedor2Membership].sort());
    expect((await panel(proveedor)).providers.map((x) => x.membershipId)).toEqual([proveedor2Membership]);
    expect((await panel(proveedor)).myMembershipId).toBe(proveedorMembership);

    const [audit] = (await readAudit("action = 'encounter.queue_list' and organization_id = $1", [org.id])).slice(-1);
    expect(audit?.metadata).toEqual({ today: '2026-11-04', results: 9 });
    expect(JSON.stringify(audit)).not.toContain('Prueba');
  });

  it('«Alerta» y «Crítico» con reloj fijado justo antes y después de 5 y de 10 minutos, desde el estado actual', async () => {
    await reset();
    // Llegó hace una hora, pero está en «Esperando proveedor» desde las 17:00.
    const v = await visit({ arrivedAt: '2026-11-04T16:00:00Z', events: [{ to: 'WAITING_FOR_PROVIDER', at: '2026-11-04T17:00:00Z' }] });
    const levelAt = async (instant: string) => {
      clock.set(instant);
      return (await panel()).rows.find((r) => r.id === v.id)?.waitLevel;
    };
    expect(await levelAt('2026-11-04T17:04:59Z')).toBe('none');
    expect(await levelAt('2026-11-04T17:05:00Z')).toBe('alert');
    expect(await levelAt('2026-11-04T17:05:01Z')).toBe('alert');
    expect(await levelAt('2026-11-04T17:09:59Z')).toBe('alert');
    expect(await levelAt('2026-11-04T17:10:00Z')).toBe('critical');
    expect(await levelAt('2026-11-04T17:10:01Z')).toBe('critical');

    // Los minutos son de la organización (ADR 0039).
    const operator = new pg.Client({ connectionString: inject('operatorUrl') });
    await operator.connect();
    try {
      await operator.query('update app.organizations set wait_alert_minutes = 15, wait_critical_minutes = 30 where id = $1', [org.id]);
      expect(await levelAt('2026-11-04T17:14:59Z')).toBe('none');
      expect(await levelAt('2026-11-04T17:15:00Z')).toBe('alert');
      expect(await levelAt('2026-11-04T17:30:00Z')).toBe('critical');
      expect((await panel()).waitThresholds).toEqual({ alertMinutes: 15, criticalMinutes: 30 });
      await expect(operator.query('update app.organizations set wait_alert_minutes = 10, wait_critical_minutes = 10 where id = $1', [org.id])).rejects.toThrow(/organizations_wait_minutes_check/);
    } finally {
      await operator.query('update app.organizations set wait_alert_minutes = 5, wait_critical_minutes = 10 where id = $1', [org.id]);
      await operator.end();
    }
  });

  it('una llegada por la API aparece en la foto con su estado y su hora (reloj fijado)', async () => {
    await reset();
    clock.set(NOW);
    const before = await panel();
    const patientId = await newPatient();
    const arrived = await recepcion.post(
      '/api/encounters',
      { source: 'walk_in', patientId, appointmentTypeId: null, route: 'STANDARD', coverage: { type: 'self_pay' } },
      { 'idempotency-key': `pn-${String(Date.now())}` },
    );
    expect(arrived.statusCode, arrived.body).toBe(201);
    const after = await panel();
    expect(after.metrics.waiting - before.metrics.waiting).toBe(1);
    expect(after.metrics.patientsToday - before.metrics.patientsToday).toBe(1);
    expect(after.rows.find((r) => r.id === arrived.json<ArrivalResult>().encounter.id)).toMatchObject({
      status: 'CHECKED_IN',
      arrivedAt: new Date(NOW).toISOString(),
      statusSince: new Date(NOW).toISOString(),
      waitLevel: 'none',
    });
  });

  describe('cambio de día en la sede', () => {
    it('a las 11:59 p. m. cuentan las de hoy y a las 12:01 a. m. ya no', async () => {
      await reset();
      // 4 nov: llegada y cierre a las 11:30 p. m. (05:30Z del 5).
      await visit({ arrivedAt: '2026-11-05T05:00:00Z', events: [{ to: 'COMPLETED', at: '2026-11-05T05:30:00Z' }] });
      await appointment('2026-11-05T05:45:00Z');
      clock.set('2026-11-05T05:59:00Z'); // 11:59 p. m. del 4.
      const late = await panel();
      expect(late).toMatchObject({ today: '2026-11-04', appointmentsToday: 1, metrics: { patientsToday: 1, completedToday: 1 } });
      expect(late.rows).toHaveLength(1);
      clock.set('2026-11-05T06:01:00Z'); // 12:01 a. m. del 5.
      const early = await panel();
      expect(early).toMatchObject({ today: '2026-11-05', appointmentsToday: 0, metrics: { patientsToday: 0, completedToday: 0 } });
      expect(early.rows).toHaveLength(0);
    });

    it('el día del cambio de horario (1 nov 2026, 25 horas) cuenta desde las 12:00 a. m. CDT hasta las 11:59 p. m. CST', async () => {
      await reset();
      // 12:30 a. m. CDT del 1 (05:30Z) y 11:30 p. m. CST del 1 (05:30Z del 2).
      await visit({ arrivedAt: '2026-11-01T05:30:00Z', events: [{ to: 'COMPLETED', at: '2026-11-02T05:30:00Z' }] });
      await visit({ arrivedAt: '2026-11-01T04:30:00Z' }); // 11:30 p. m. CDT del 31 oct: abierta de ayer.
      clock.set('2026-11-02T05:59:00Z'); // 11:59 p. m. CST del 1.
      const late = await panel();
      expect(late).toMatchObject({ today: '2026-11-01', metrics: { patientsToday: 1, completedToday: 1, waiting: 1 } });
      clock.set('2026-11-02T06:01:00Z'); // 12:01 a. m. del 2.
      const early = await panel();
      expect(early).toMatchObject({ today: '2026-11-02', metrics: { patientsToday: 0, completedToday: 0, waiting: 1 } });
      expect(early.rows.map((r) => r.status)).toEqual(['CHECKED_IN']);
    });
  });

  it('permisos: Recepción, Enfermería y Proveedor sí; el Propietario sin rol clínico no (ADR 0027); otra organización no ve nada', async () => {
    await reset();
    clock.set(NOW);
    const mine = await visit({ arrivedAt: '2026-11-04T16:00:00Z' });
    expect((await panel(enfermeria)).rows.map((r) => r.id)).toEqual([mine.id]);
    expect((await panel(proveedor)).rows.map((r) => r.id)).toEqual([mine.id]);
    const ownerResponse = await owner.get('/api/panel');
    expect(ownerResponse.statusCode).toBe(403);
    const norte = await signedInWithContext(app, await createStaff(app, 'pn-norte', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    expect((await panel(norte)).rows.map((r) => r.id)).not.toContain(mine.id);
    // El total de hoy ya no tiene endpoint propio: va en el Panel.
    expect((await recepcion.get('/api/appointments/today-count')).statusCode).not.toBe(200);
  });
});
