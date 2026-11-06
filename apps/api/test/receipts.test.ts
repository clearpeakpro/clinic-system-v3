import { randomUUID } from 'node:crypto';
import { consultations, createTenantDb, membershipPlans, nextCode, patients, receiptPrints, receipts } from '@clinic/db';
import type { ArrivalResult, BillingStatement, ChargeAdded, EncounterDetail, MembershipSaved, PatientMembershipCard, PaymentRecorded, ReceiptDocument, ReceiptGenerated, ReceiptsPanel } from '@clinic/shared';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, NORTE, readAudit, signedInWithContext, SUR, type Client, type TestApp, startApp } from './support.ts';

// T-029: recibos (S-CAJ-14, 15 y 24; ADR 0037), con el reloj fijado
// (America/Chicago). Decisiones del dueño del 2026-11-05:
//  - código NOR1-R-2026-000045 por sede y año de la sede, sin huecos aunque
//    falle una transacción; el cambio de año, a las 11:59 p. m. del 31 de
//    diciembre de la sede;
//  - instantánea inmutable en español o en inglés; reimprimir muestra la
//    original; los recibos no se anulan;
//  - primero la auditoría y después la impresión: sin auditoría no hay
//    texto; 30 impresiones por persona y minuto;
//  - generan Recepción; ven y reimprimen también el Propietario y el
//    Administrador con un rol clínico; las cuotas de membresía llevan recibo.

/** 5 nov 2026, 10:00 a. m. en Chicago (NOR1). */
const NOW = '2026-11-05T16:00:00Z';
const REASON = 'Motivo ficticio de prueba';

describe('T-029 recibos', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let recepcionId: string;
  let enfermeria: Client;
  let proveedor: Client;
  let adminConRol: Client;
  let adminEnfermeria: Client;
  let adminSinRol: Client;
  let recepcionSur: Client;
  let counter = 0;
  const consult: Record<string, string> = {};
  const plan: Record<string, string> = {};
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    const rec = await createStaff(app, 'recibos-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    recepcionId = rec.userId;
    recepcion = await signedInWithContext(app, rec, NORTE, 0);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'recibos-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'recibos-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    adminConRol = await signedInWithContext(
      app,
      await createStaff(app, 'recibos-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    adminEnfermeria = await signedInWithContext(
      app,
      await createStaff(app, 'recibos-admin-enf', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'enfermeria' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'recibos-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    recepcionSur = await signedInWithContext(app, await createStaff(app, 'recibos-rec-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    await db().withTenant(NORTE.id, async (tx) => {
      for (const c of await tx.select({ id: consultations.id, code: consultations.code }).from(consultations)) consult[c.code] = c.id;
      for (const p of await tx.select({ id: membershipPlans.id, code: membershipPlans.code }).from(membershipPlans)) plan[p.code] = p.id;
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const key = () => `recibos-${randomUUID()}`;
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;
  const seq = (receiptCode: string) => Number(receiptCode.split('-').at(-1));

  async function newPatient(): Promise<string> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: NORTE.id,
        registeredLocationId: NORTE.locations[0].id,
        code: await nextCode(tx, NORTE.id, 'patient'),
        firstName: 'Recibo',
        lastName: `Ficticio ${String((counter += 1))}`,
        birthDate: '1980-11-05',
      });
      return id;
    });
  }

  /** Una visita sin cita en NOR1, ruta «Solo laboratorio». */
  async function arrive(coverage: Record<string, unknown> = { type: 'self_pay' }): Promise<string> {
    const response = await recepcion.post(
      '/api/encounters',
      { source: 'walk_in', patientId: await newPatient(), appointmentTypeId: null, route: 'LAB_ONLY', coverage },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ArrivalResult>().encounter.id;
  }
  const statement = async (encounterId: string) => {
    const response = await recepcion.get(`/api/encounters/${encounterId}/statement`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<BillingStatement>();
  };
  /** Consulta inicial: $60.00 en NOR1. */
  const addConsult = async (encounterId: string) => {
    const response = await recepcion.post(
      `/api/encounters/${encounterId}/charges`,
      { item: { kind: 'consultation', id: consult['CONS-INICIAL'] ?? '' }, quantity: 1, expectedVersion: (await statement(encounterId)).statementVersion },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ChargeAdded>();
  };
  const paid = async (encounterId: string, amountCents: number, extra: Record<string, unknown> = {}) => {
    const response = await recepcion.post(
      `/api/encounters/${encounterId}/payments`,
      { method: 'cash', amountCents, expectedVersion: (await statement(encounterId)).statementVersion, ...extra },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    return response.json<PaymentRecorded>();
  };
  const panel = async (encounterId: string, client = recepcion) => {
    const response = await client.get(`/api/encounters/${encounterId}/receipts`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<ReceiptsPanel>();
  };
  const generate = (encounterId: string, paymentId: string | null = null, client = recepcion, idempotencyKey = key()) =>
    client.post(`/api/encounters/${encounterId}/receipts`, { paymentId }, { 'idempotency-key': idempotencyKey });
  const generated = async (encounterId: string, paymentId: string | null = null) => {
    const response = await generate(encounterId, paymentId);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ReceiptGenerated>();
  };
  const print = (receiptId: string, language: 'es' | 'en' = 'es', client = recepcion) => client.post(`/api/receipts/${receiptId}/print`, { language });
  const view = async (receiptId: string, language: 'es' | 'en' = 'es', client = recepcion) => {
    const response = await client.get(`/api/receipts/${receiptId}?lang=${language}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<ReceiptDocument>();
  };
  const detail = async (encounterId: string) => (await recepcion.get(`/api/encounters/${encounterId}`)).json<EncounterDetail>();

  /** Hace fallar la auditoría de una acción, solo para esta persona (en la base desechable de la prueba). */
  async function withFailingAudit<T>(action: string, work: () => Promise<T>): Promise<T> {
    const operator = new pg.Client({ connectionString: inject('operatorUrl') });
    await operator.connect();
    const fn = `test_fail_${action.replace(/\W/g, '_')}`;
    try {
      await operator.query(`create or replace function app.${fn}() returns trigger language plpgsql as $$
        begin
          if new.action = '${action}' and new.actor_id = '${recepcionId}' then raise exception 'auditoría caída (prueba)'; end if;
          return new;
        end $$`);
      await operator.query(`create trigger ${fn} before insert on app.audit_log for each row execute function app.${fn}()`);
      return await work();
    } finally {
      await operator.query(`drop trigger if exists ${fn} on app.audit_log`);
      await operator.query(`drop function if exists app.${fn}()`);
      await operator.end();
    }
  }

  it('dos recibos seguidos tienen códigos consecutivos, sin huecos aunque falle una transacción', async () => {
    clock.set(NOW);
    const v = await arrive();
    await addConsult(v);
    const first = await generated(v);
    expect(first.code).toMatch(/^NOR1-R-2026-\d{6}$/);
    // Falla la auditoría a mitad de la transacción: no se crea el recibo ni se gasta el número.
    const failed = await withFailingAudit('receipt.generated', () => generate(v));
    expect(failed.statusCode).toBe(500);
    const second = await generated(v);
    expect(seq(second.code)).toBe(seq(first.code) + 1);
    expect(second.code.slice(0, 12)).toBe('NOR1-R-2026-');
    const list = await panel(v);
    expect(list.receipts.map((r) => r.code)).toEqual([second.code, first.code]);
    expect(list.receipts[0]).toMatchObject({ issuedBy: 'Usted', linkedPayment: null });
    expect(list).toMatchObject({ canGenerate: true, canPrint: true, blocked: null, latestPayment: null });
    const [audit] = await readAudit(`action = 'receipt.generated' and metadata->>'receiptCode' = $1`, [first.code]);
    expect(audit?.metadata).toMatchObject({ encounterCode: (await detail(v)).code, linkedPayment: false, totalDueCents: 6000, paidCents: 0, balanceCents: 6000 });
    expect(JSON.stringify(audit)).not.toContain('Ficticio');
  });

  it('el cambio de año de la sede: a las 11:59 p. m. del 31 de diciembre es 2026; a las 12:01 a. m. empieza 2027-000001', async () => {
    try {
      clock.set('2027-01-01T05:59:00Z'); // 31 dic 2026, 11:59 p. m. en Chicago (ya es 1 de enero en UTC)
      const v = await arrive();
      const late = await generated(v);
      expect(late.code).toMatch(/^NOR1-R-2026-\d{6}$/);
      expect((await view(late.id)).text).toMatch(/^Fecha +31 dic 2026, 11:59 p\. m\.$/m);
      clock.set('2027-01-01T06:01:00Z'); // 1 ene 2027, 12:01 a. m. en Chicago
      const early = await generated(v);
      expect(early.code).toBe('NOR1-R-2027-000001');
      expect((await generated(v)).code).toBe('NOR1-R-2027-000002');
      expect((await view(early.id, 'en')).text).toMatch(/^Date +Jan 1, 2027, 12:01 AM$/m);
    } finally {
      clock.set(NOW);
    }
  });

  it('sin auditoría no hay impresión: el texto solo sale después de registrar la impresión', async () => {
    clock.set(NOW);
    const v = await arrive();
    await addConsult(v);
    const r = await generated(v);
    const failed = await withFailingAudit('receipt.printed', () => print(r.id));
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toContain(r.code);
    expect(failed.body).not.toContain('Ficticio');
    const prints = () => db().withTenant(NORTE.id, (tx) => tx.select().from(receiptPrints).where(eq(receiptPrints.receiptId, r.id)));
    expect(await prints()).toEqual([]);
    const ok = await print(r.id, 'en');
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json<ReceiptDocument>()).toMatchObject({ id: r.id, code: r.code, language: 'en' });
    expect(ok.json<ReceiptDocument>().text).toContain('RECEIPT');
    expect(await prints()).toHaveLength(1);
    const audits = await readAudit(`action = 'receipt.printed' and entity_id = $1`, [r.id]);
    expect(audits.map((a) => a.metadata)).toEqual([expect.objectContaining({ receiptCode: r.code, language: 'en', reprint: false })]);
    expect(JSON.stringify(audits)).not.toContain('Ficticio');
    // Reimprimir queda auditado como tal.
    expect((await print(r.id)).statusCode).toBe(200);
    const again = await readAudit(`action = 'receipt.printed' and entity_id = $1 and metadata->>'reprint' = 'true'`, [r.id]);
    expect(again).toHaveLength(1);
  });

  it('reimprimir muestra la instantánea original, en el idioma elegido, aunque después haya pagos o anulaciones', async () => {
    clock.set(NOW);
    const v = await arrive();
    await addConsult(v);
    const { paymentId } = await paid(v, 2000, { method: 'credit_card', reference: 'AUTH-4321' });
    expect((await panel(v)).latestPayment).toEqual({ id: paymentId, method: 'credit_card', amountCents: 2000 });
    const r = await generated(v, paymentId);
    const original = (await print(r.id)).json<ReceiptDocument>().text;
    expect(original).toMatch(/^Pagado +\$20\.00$/m);
    expect(original).toMatch(/^Saldo +\$40\.00$/m);
    expect(original).toMatch(/^Tarjeta de crédito ••••4321 +\$20\.00$/m);
    expect(original).toMatch(/^Recibo del pago:$/m);
    expect(original).toContain('Recibo Ficticio');
    // Un pago más y la anulación del primero no cambian el recibo emitido.
    await paid(v, 1000);
    const voided = await adminConRol.post(`/api/payments/${paymentId}/void`, { reason: REASON, expectedVersion: (await statement(v)).statementVersion }, { 'idempotency-key': key() });
    expect(voided.statusCode, voided.body).toBe(200);
    expect((await print(r.id)).json<ReceiptDocument>().text).toBe(original);
    const english = (await print(r.id, 'en')).json<ReceiptDocument>().text;
    expect(english).toMatch(/^Paid +\$20\.00$/m);
    expect(english).toMatch(/^Balance +\$40\.00$/m);
    expect((await view(r.id, 'en')).text).toBe(english);
    // La lectura también se audita, con el idioma.
    expect(await readAudit(`action = 'receipt.view' and entity_id = $1 and metadata->>'language' = 'en'`, [r.id])).toHaveLength(1);
    // Vincular un pago ya anulado: 409. Uno de otra visita: 404.
    const relink = await generate(v, paymentId);
    expect([relink.statusCode, code(relink)]).toEqual([409, 'payment_voided']);
    const other = await arrive();
    await addConsult(other);
    const otherPayment = await paid(other, 500);
    const foreign = await generate(v, otherPayment.paymentId);
    expect([foreign.statusCode, code(foreign)]).toEqual([404, 'payment_not_found']);
    // La instantánea está cifrada en la base: ni el nombre ni los últimos 4 en claro.
    const [row] = await db().withTenant(NORTE.id, (tx) => tx.select().from(receipts).where(eq(receipts.id, r.id)));
    expect(row?.snapshotEnc).not.toContain('Ficticio');
    expect(row?.snapshotEnc).not.toContain('4321');
    expect(row?.paymentId).toBe(paymentId);
  });

  it('seguro: «A cargo del seguro», el tipo y la aseguradora, sin número de miembro', async () => {
    clock.set(NOW);
    const v = await arrive({ type: 'insurance', insurerName: 'Aseguradora Ficticia Uno', memberId: 'MBR-99887', term: 'copay', value: '15.00' });
    await addConsult(v);
    const text = (await view((await generated(v)).id)).text;
    expect(text).toContain('Cobertura: Seguro · copago');
    expect(text).toContain('Aseguradora: Aseguradora Ficticia Uno');
    expect(text).toMatch(/^A cargo del seguro +-\$45\.00$/m);
    expect(text).toMatch(/^Total a pagar +\$15\.00$/m);
    expect(text).not.toContain('MBR-99887');
  });

  it('crédito a favor y visitas cerradas: «Se retiró» sí; «Cancelada» no genera recibo', async () => {
    clock.set(NOW);
    const v = await arrive();
    const charge = await addConsult(v);
    await paid(v, 6000);
    const voided = await adminConRol.post(`/api/charges/${charge.chargeId}/void`, { reason: REASON, expectedVersion: (await statement(v)).statementVersion }, { 'idempotency-key': key() });
    expect(voided.statusCode, voided.body).toBe(200);
    const text = (await view((await generated(v)).id)).text;
    expect(text).toMatch(/^Crédito a favor +\$60\.00$/m);
    expect(text).not.toMatch(/^Saldo/m);
    const close = async (encounterId: string, outcome: 'LEFT_EARLY' | 'CANCELLED') =>
      recepcion.post(`/api/encounters/${encounterId}/close`, { outcome, reason: REASON, expectedVersion: (await detail(encounterId)).version });
    const left = await arrive();
    await addConsult(left);
    expect((await close(left, 'LEFT_EARLY')).statusCode).toBe(200);
    expect((await generate(left)).statusCode).toBe(201);
    const cancelled = await arrive();
    expect((await close(cancelled, 'CANCELLED')).statusCode).toBe(200);
    const rejected = await generate(cancelled);
    expect([rejected.statusCode, code(rejected)]).toEqual([409, 'statement_voided']);
    expect(await panel(cancelled)).toMatchObject({ canGenerate: false, blocked: 'statement_voided' });
  });

  it('idempotencia: dos toques con la misma clave crean un solo recibo; sin clave, 400', async () => {
    clock.set(NOW);
    const v = await arrive();
    const idempotencyKey = key();
    const [a, b] = await Promise.all([generate(v, null, recepcion, idempotencyKey), generate(v, null, recepcion, idempotencyKey)]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json<ReceiptGenerated>()).toEqual(b.json<ReceiptGenerated>());
    expect((await panel(v)).receipts).toHaveLength(1);
    expect((await recepcion.post(`/api/encounters/${v}/receipts`, { paymentId: null })).statusCode).toBe(400);
    expect((await generate(v, 'no-es-un-id')).statusCode).toBe(400);
  });

  it('límite de 30 impresiones por persona y minuto', async () => {
    clock.set('2026-11-05T18:00:00Z');
    try {
      const v = await arrive();
      const r = await generated(v);
      for (let i = 0; i < 30; i += 1) expect((await print(r.id)).statusCode).toBe(200);
      const limited = await print(r.id);
      expect([limited.statusCode, code(limited)]).toEqual([429, 'print_rate_limited']);
      expect(limited.body).not.toContain(r.code);
      // Otra persona no comparte el límite; pasado el minuto, se vuelve a imprimir.
      expect((await print(r.id, 'es', adminConRol)).statusCode).toBe(200);
      clock.set('2026-11-05T18:01:01Z');
      expect((await print(r.id)).statusCode).toBe(200);
    } finally {
      clock.set(NOW);
    }
  });

  it('quién: Recepción genera; un Administrador con rol clínico ve y reimprime pero no genera; los demás, no; cada organización ve lo suyo', async () => {
    clock.set(NOW);
    const v = await arrive();
    const r = await generated(v);
    expect(await panel(v, adminEnfermeria)).toMatchObject({ canGenerate: false, canPrint: true });
    expect((await generate(v, null, adminEnfermeria)).statusCode).toBe(403);
    expect((await print(r.id, 'es', adminEnfermeria)).statusCode).toBe(200);
    expect((await view(r.id, 'es', adminEnfermeria)).code).toBe(r.code);
    expect(await panel(v, adminConRol)).toMatchObject({ canGenerate: true, canPrint: true });
    for (const client of [enfermeria, proveedor, adminSinRol]) {
      expect((await client.get(`/api/encounters/${v}/receipts`)).statusCode).toBe(403);
      expect((await client.get(`/api/receipts/${r.id}`)).statusCode).toBe(403);
      expect((await print(r.id, 'es', client)).statusCode).toBe(403);
      expect((await generate(v, null, client)).statusCode).toBe(403);
    }
    // Otra organización: no existe.
    expect((await recepcionSur.get(`/api/receipts/${r.id}`)).statusCode).toBe(404);
    expect((await print(r.id, 'es', recepcionSur)).statusCode).toBe(404);
    expect((await recepcionSur.get(`/api/encounters/${v}/receipts`)).statusCode).toBe(404);
    // Idioma desconocido: 400.
    expect((await recepcion.get(`/api/receipts/${r.id}?lang=fr`)).statusCode).toBe(400);
    expect((await recepcion.post(`/api/receipts/${r.id}/print`, { language: 'fr' })).statusCode).toBe(400);
  });

  it('cuota de membresía: sin pagar no hay recibo; pagada, su recibo con la misma serie, el titular y el plan', async () => {
    clock.set(NOW);
    const holder = await newPatient();
    const enrolled = await recepcion.post(
      `/api/patients/${holder}/membership`,
      { planId: plan.ESENCIAL, startDate: '2026-11-05', billingDay: 15, affiliatePatientIds: [], identityVerified: true },
      { 'idempotency-key': key() },
    );
    expect(enrolled.statusCode, enrolled.body).toBe(201);
    expect(enrolled.json<MembershipSaved>().id).toBeTruthy();
    const initialFee = async () => {
      const card = (await recepcion.get(`/api/patients/${holder}/membership`)).json<PatientMembershipCard>().membership;
      const fee = card?.fees.find((f) => f.kind === 'initial');
      if (!fee) throw new Error('sin cuota inicial');
      return fee;
    };
    const pending = await initialFee();
    const feePanel = async (client = recepcion) => (await client.get(`/api/membership-fees/${pending.id}/receipts`)).json<ReceiptsPanel>();
    expect(await feePanel()).toMatchObject({ canGenerate: false, blocked: 'fee_not_paid', receipts: [] });
    const early = await recepcion.post(`/api/membership-fees/${pending.id}/receipts`, {}, { 'idempotency-key': key() });
    expect([early.statusCode, code(early)]).toEqual([409, 'fee_not_paid']);
    const payment = await recepcion.post(`/api/membership-fees/${pending.id}/payments`, { method: 'debit_card', reference: '000777', expectedVersion: pending.version }, { 'idempotency-key': key() });
    expect(payment.statusCode, payment.body).toBe(201);
    const visitReceipt = await generated(await arrive());
    const response = await recepcion.post(`/api/membership-fees/${pending.id}/receipts`, {}, { 'idempotency-key': key() });
    expect(response.statusCode, response.body).toBe(201);
    const feeReceipt = response.json<ReceiptGenerated>();
    expect(seq(feeReceipt.code)).toBe(seq(visitReceipt.code) + 1);
    const list = await feePanel();
    expect(list).toMatchObject({ canGenerate: true, blocked: null });
    expect(list.receipts).toEqual([expect.objectContaining({ code: feeReceipt.code, linkedPayment: { method: 'debit_card', amountCents: (await initialFee()).amountCents } })]);
    const es = (await print(feeReceipt.id)).json<ReceiptDocument>().text;
    expect(es).toContain('Titular:');
    expect(es).toMatch(/^Membresía +NOR1-M-\d{6}$/m);
    expect(es).toMatch(/^Cuota inicial +\$\d/m);
    expect(es).toMatch(/^Tarjeta de débito ••••0777/m);
    expect(es).toContain('Gracias por su pago');
    expect((await print(feeReceipt.id, 'en')).json<ReceiptDocument>().text).toMatch(/^Initial fee +\$\d/m);
    // Ve la cuota quien reimprime; el Proveedor, no.
    expect((await feePanel(adminEnfermeria)).canPrint).toBe(true);
    expect((await proveedor.get(`/api/membership-fees/${pending.id}/receipts`)).statusCode).toBe(403);
    const [audit] = await readAudit(`action = 'receipt.generated' and metadata->>'receiptCode' = $1`, [feeReceipt.code]);
    expect(audit?.metadata).toMatchObject({ feeKind: 'initial', linkedPayment: true });
  });
});
