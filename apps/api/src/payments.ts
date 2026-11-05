import {
  billingStatements,
  charges,
  encounters,
  locations,
  membershipFees,
  membershipPlans,
  memberships,
  notifyRealtime,
  patientMemberships,
  payments,
  settleMembership,
  touchStatement,
  user as userTable,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  payMembershipFeeSchema,
  permissionsFor,
  recordPaymentSchema,
  referenceLast4,
  voidSchema,
  type PatientBalanceFee,
  type PatientBalances,
  type PatientBalanceVisit,
  type PaymentMethod,
  type PaymentRecorded,
  type PaymentView,
  type StatementTotals,
  type VisitStatus,
  type VoidResult,
} from '@clinic/shared';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import { prepareStatement, statementTotals, totalsByVisit } from './billing-statement.ts';
import type { Clock } from './clock.ts';
import { lockEncounter, type LockedEncounter } from './encounters.ts';
import type { IdempotencyService } from './idempotency.ts';
import type { BenefitChange } from './membership-benefits.ts';
import { rolesAt, type Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Pagos, anulaciones y saldos (T-028; S-CAJ-10 a 13, S-CAJ-17, S-PAC-10;
// ADR 0004, 0019, 0033, 0034 y 0042).
//  - Registrar pago (S-CAJ-11): Recepción (checkout.access), con
//    Idempotency-Key, en una sola transacción: la visita y su estado de
//    cuenta bloqueados (SELECT … FOR UPDATE), la versión leída, el saldo
//    recalculado, el pago y la auditoría. El monto no puede superar el saldo:
//    dos cajas a la vez se esperan en el bloqueo y la segunda ve la versión
//    nueva (409). Se cobra en cualquier estado abierto (por adelantado), con
//    la visita completada (ADR 0004) y con «Se retiró»; una visita
//    «Cancelada» tiene el estado de cuenta «Anulado» y no se cobra.
//  - Anular (S-CAJ-10 y 13): Propietario o Administrador con un rol clínico
//    en la sede (billing.void + patients.access, ADR 0033), con motivo e
//    Idempotency-Key, también con la visita cerrada. Un pago se anula con su
//    fila inversa; un cargo de Caja, con el mecanismo de T-025 (pasa a
//    «Anulado» con motivo). Los cargos de orden se anulan cancelando la orden.
//    Auditado con el antes y el después de los importes.
//  - Cuotas de membresía (ADR 0034): se cobran completas, un pago por cuota.
//    En la misma transacción la cuota pasa a pagada y settleMembership()
//    activa (cuota inicial) o reactiva (mensualidad vencida) la membresía.
//    Anular ese pago devuelve la cuota a pendiente (y el estado se
//    recalcula), o la deja «Anulada» sin deuda si la membresía ya está
//    cancelada (decisión del 2026-11-05).
//  - Nunca se guardan datos de tarjeta: solo el método y los últimos 4
//    caracteres de la referencia, cifrados. Ni la referencia ni el motivo van
//    a la auditoría ni a los logs.
//  - Saldos (S-CAJ-17 / S-PAC-10): las visitas con saldo del paciente en las
//    sedes de quien mira y las cuotas pendientes de las membresías de las que
//    es titular. Lectura auditada sin nombres.

const referenceContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'payments', column: 'reference_last4', recordId });
const reasonContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'payments', column: 'reason', recordId });
const chargeVoidContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'charges', column: 'void_reason', recordId });

type PaymentRow = typeof payments.$inferSelect;

/** Los pagos (con su anulación) de una visita o de unas cuotas, para mostrarlos (S-CAJ-12). */
export async function loadPayments(tx: Tx, cipher: FieldCipher, where: { encounterId: string } | { feeIds: string[] }): Promise<{ rows: LoadedPayment[]; userIds: string[] }> {
  if ('feeIds' in where && where.feeIds.length === 0) return { rows: [], userIds: [] };
  const all = await tx
    .select({ payment: payments, userId: memberships.userId })
    .from(payments)
    .innerJoin(memberships, eq(memberships.id, payments.recordedByMembershipId))
    .where('encounterId' in where ? eq(payments.encounterId, where.encounterId) : inArray(payments.membershipFeeId, where.feeIds))
    .orderBy(asc(payments.recordedAt), asc(payments.id));
  const voids = new Map(all.filter((r) => r.payment.kind === 'void').map((r) => [r.payment.reversesPaymentId ?? '', r]));
  const rows: LoadedPayment[] = [];
  for (const { payment, userId } of all.filter((r) => r.payment.kind === 'payment')) {
    const reversal = voids.get(payment.id);
    rows.push({
      payment,
      userId,
      referenceLast4: payment.referenceLast4Enc ? await cipher.decrypt(payment.referenceLast4Enc, referenceContext(payment.organizationId, payment.id)) : null,
      voided: reversal
        ? {
            at: reversal.payment.recordedAt,
            userId: reversal.userId,
            membershipId: reversal.payment.recordedByMembershipId,
            reason: reversal.payment.reasonEnc ? await cipher.decrypt(reversal.payment.reasonEnc, reasonContext(payment.organizationId, reversal.payment.id)) : null,
          }
        : null,
    });
  }
  return { rows, userIds: [...new Set(all.map((r) => r.userId))] };
}

export interface LoadedPayment {
  payment: PaymentRow;
  userId: string;
  referenceLast4: string | null;
  voided: { at: Date; userId: string; membershipId: string; reason: string | null } | null;
}

/** Vista de un pago: «Usted» o el nombre de quien lo recibió o lo anuló. Los registrados primero y después los anulados (S-CAJ-12). */
export function paymentViews(rows: LoadedPayment[], names: Map<string, string>, me: string): PaymentView[] {
  const who = (membershipId: string, userId: string) => (membershipId === me ? 'Usted' : (names.get(userId) ?? null));
  const views = rows.map(
    (r): PaymentView => ({
      id: r.payment.id,
      method: r.payment.method as PaymentMethod,
      amountCents: r.payment.amountCents,
      referenceLast4: r.referenceLast4,
      recordedAt: r.payment.recordedAt.toISOString(),
      recordedBy: who(r.payment.recordedByMembershipId, r.userId),
      voided: r.voided ? { reason: r.voided.reason, at: r.voided.at.toISOString(), by: who(r.voided.membershipId, r.voided.userId) } : null,
    }),
  );
  return [...views.filter((v) => !v.voided), ...views.filter((v) => v.voided)];
}

export class PaymentService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #idempotency: IdempotencyService;
  readonly #clock: Clock;

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, idempotency: IdempotencyService, clock: Clock) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#cipher = cipher;
    this.#idempotency = idempotency;
    this.#clock = clock;
  }

  /** S-CAJ-11 «Registrar pago» de una visita. */
  async recordPayment(actor: Principal, encounterId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<PaymentRecorded> {
    const ctx = requireContext(actor);
    const input = recordPaymentSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/encounters/${encounterId}/payments`, body: raw },
      async (tx) => {
        const now = this.#clock.now();
        const { current, before } = await this.#lockStatement(tx, actor, ctx.locationId, encounterId, input.expectedVersion, meta);
        if (before.balanceCents <= 0) throw new HttpError(409, 'nothing_due', { balanceCents: before.balanceCents });
        if (input.amountCents > before.balanceCents) throw new HttpError(409, 'amount_exceeds_balance', { balanceCents: before.balanceCents });
        const me = await myMembership(tx, actor.userId);
        const paymentId = uuidv7();
        const last4 = referenceLast4(input.reference);
        await tx.insert(payments).values({
          id: paymentId,
          organizationId: ctx.organizationId,
          locationId: ctx.locationId,
          patientId: current.patientId,
          encounterId: current.id,
          kind: 'payment',
          method: input.method,
          amountCents: input.amountCents,
          referenceLast4Enc: last4 ? await this.#cipher.encrypt(last4, referenceContext(ctx.organizationId, paymentId)) : null,
          recordedByMembershipId: me,
          recordedAt: now,
        });
        const after = await this.#afterChange(tx, current, now);
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'payment.recorded',
          ...base(actor, ctx.locationId, 'payment', paymentId, meta),
          metadata: {
            encounterCode: current.code,
            method: input.method,
            amountCents: input.amountCents,
            hasReference: last4 !== null,
            ...money('before', before),
            ...money('after', after),
          },
        });
        return { status: 201, resourceIds: [paymentId] };
      },
      (ids) => this.#recorded(actor, ids[0] ?? ''),
    );
    return result.body;
  }

  /** S-CAJ-10 «Anular cargo»: solo cargos de Caja; los de orden se anulan cancelando la orden. */
  async voidCharge(actor: Principal, chargeId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<VoidResult> {
    const ctx = requireContext(actor);
    this.#requireVoid(actor);
    const input = voidSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/charges/${chargeId}/void`, body: raw },
      async (tx) => {
        const now = this.#clock.now();
        const [found] = await tx.select({ encounterId: charges.encounterId }).from(charges).where(and(eq(charges.id, chargeId), eq(charges.locationId, ctx.locationId)));
        if (!found) throw new HttpError(404, 'charge_not_found');
        const { current, before } = await this.#lockStatement(tx, actor, ctx.locationId, found.encounterId, input.expectedVersion, meta);
        const [charge] = await tx.select().from(charges).where(eq(charges.id, chargeId)).for('update');
        if (!charge) throw new HttpError(404, 'charge_not_found');
        if (charge.source !== 'cashier') throw new HttpError(409, 'charge_from_order');
        if (charge.status !== 'active') throw new HttpError(409, 'charge_already_voided');
        const me = await myMembership(tx, actor.userId);
        await tx
          .update(charges)
          .set({
            status: 'voided',
            voidReasonEnc: await this.#cipher.encrypt(input.reason, chargeVoidContext(ctx.organizationId, charge.id)),
            voidedByMembershipId: me,
            voidedAt: now,
            version: charge.version + 1,
          })
          .where(eq(charges.id, charge.id));
        // Con la visita abierta, anular libera el incluido: los beneficios se recalculan.
        const { changes } = await prepareStatement(tx, current, now);
        await this.#auditBenefits(tx, actor, current, changes, meta);
        const after = await this.#afterChange(tx, current, now);
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'charge.voided',
          ...base(actor, ctx.locationId, 'charge', charge.id, meta),
          reason: input.reason,
          metadata: {
            encounterCode: current.code,
            source: 'cashier',
            itemCode: charge.itemCode,
            amountCents: charge.amountCents,
            from: 'active',
            to: 'voided',
            ...money('before', before),
            ...money('after', after),
          },
        });
        return { status: 200, resourceIds: [charge.id, found.encounterId] };
      },
      (ids) => this.#statementVersion(actor, ids[0] ?? '', ids[1] ?? ''),
    );
    return result.body;
  }

  /** S-CAJ-13 «Anular pago»: de una visita o de una cuota de membresía. Fila inversa con motivo. */
  async voidPayment(actor: Principal, paymentId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<VoidResult> {
    const ctx = requireContext(actor);
    this.#requireVoid(actor);
    const input = voidSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/payments/${paymentId}/void`, body: raw },
      async (tx) => {
        const [found] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.kind, 'payment')));
        if (!found) throw new HttpError(404, 'payment_not_found');
        if (found.encounterId) {
          if (found.locationId !== ctx.locationId) throw new HttpError(404, 'payment_not_found');
          return this.#voidVisitPayment(tx, actor, found, input, meta);
        }
        return this.#voidFeePayment(tx, actor, found, input, meta);
      },
      (ids) => (ids[2] === 'fee' ? this.#feeVersion(actor, ids[0] ?? '', ids[1] ?? '') : this.#statementVersion(actor, ids[0] ?? '', ids[1] ?? '')),
    );
    return result.body;
  }

  /** Cobro de una cuota de membresía (tarjeta «Membresía» y pestaña Saldos): completa, un pago por cuota. */
  async payFee(actor: Principal, feeId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<PaymentRecorded> {
    const ctx = requireContext(actor);
    const input = payMembershipFeeSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/membership-fees/${feeId}/payments`, body: raw },
      async (tx) => {
        const now = this.#clock.now();
        const [ref] = await tx.select({ membershipId: membershipFees.membershipId }).from(membershipFees).where(eq(membershipFees.id, feeId));
        if (!ref) throw new HttpError(404, 'fee_not_found');
        // Orden de bloqueo: membresía (settleMembership la bloquea) → cuota.
        const before = await settleMembership(tx, ref.membershipId, now);
        if (!before) throw new HttpError(404, 'fee_not_found');
        const [fee] = await tx.select().from(membershipFees).where(eq(membershipFees.id, feeId)).for('update');
        if (!fee) throw new HttpError(404, 'fee_not_found');
        if (fee.status !== 'pending') throw new HttpError(409, 'fee_not_pending', { status: fee.status });
        if (fee.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
        if (fee.amountCents <= 0) throw new HttpError(409, 'nothing_due');
        const [m] = await tx.select().from(patientMemberships).where(eq(patientMemberships.id, fee.membershipId));
        if (!m) throw new HttpError(404, 'fee_not_found');
        const me = await myMembership(tx, actor.userId);
        const paymentId = uuidv7();
        const last4 = referenceLast4(input.reference);
        await tx.insert(payments).values({
          id: paymentId,
          organizationId: ctx.organizationId,
          locationId: ctx.locationId,
          patientId: m.holderPatientId,
          membershipFeeId: fee.id,
          kind: 'payment',
          method: input.method,
          amountCents: fee.amountCents,
          referenceLast4Enc: last4 ? await this.#cipher.encrypt(last4, referenceContext(ctx.organizationId, paymentId)) : null,
          recordedByMembershipId: me,
          recordedAt: now,
        });
        await tx
          .update(membershipFees)
          .set({ status: 'paid', paidAt: now, version: fee.version + 1 })
          .where(eq(membershipFees.id, fee.id));
        // En la misma transacción: activa (cuota inicial) o reactiva (mensualidad vencida).
        const after = await settleMembership(tx, m.id, now);
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'membership_fee.paid',
          ...base(actor, ctx.locationId, 'payment', paymentId, meta),
          metadata: {
            membershipCode: m.code,
            feeKind: fee.kind,
            dueDate: fee.dueDate,
            method: input.method,
            amountCents: fee.amountCents,
            hasReference: last4 !== null,
            feeFrom: 'pending',
            feeTo: 'paid',
            membershipFrom: before.status,
            membershipTo: after?.status ?? before.status,
          },
        });
        return { status: 201, resourceIds: [paymentId] };
      },
      (ids) => this.#feeRecorded(actor, ids[0] ?? ''),
    );
    return result.body;
  }

  /** S-CAJ-17 / S-PAC-10: los saldos del paciente en las sedes de quien mira y sus cuotas pendientes. Lectura auditada. */
  async balances(actor: Principal, patientId: string, meta: RequestMeta): Promise<PatientBalances> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const sites = await tx.select({ id: locations.id, code: locations.code, name: locations.name }).from(locations);
      // Las sedes donde la persona tiene un rol que ve saldos (Recepción o Proveedor).
      const mine = sites.filter((s) => permissionsFor(rolesAt(actor.assignments, ctx.organizationId, s.id)).has('balances.view'));
      const rows =
        mine.length > 0
          ? await tx
              .select({ id: encounters.id, code: encounters.code, status: encounters.status, locationId: encounters.locationId, arrivedAt: encounters.arrivedAt })
              .from(encounters)
              .where(and(eq(encounters.patientId, patientId), inArray(encounters.locationId, mine.map((s) => s.id)), ne(encounters.status, 'CANCELLED')))
              .orderBy(desc(encounters.arrivedAt), desc(encounters.id))
          : [];
      const totals = await totalsByVisit(tx, rows.map((r) => r.id));
      const visits: PatientBalanceVisit[] = rows.flatMap((r) => {
        const t = totals.get(r.id);
        const site = mine.find((s) => s.id === r.locationId);
        if (!t || !site || t.balanceCents <= 0) return [];
        return [
          {
            encounterId: r.id,
            code: r.code,
            status: r.status as VisitStatus,
            location: site,
            arrivedAt: r.arrivedAt.toISOString(),
            totalDueCents: t.totalDueCents,
            paidCents: t.paidCents,
            balanceCents: t.balanceCents,
            statementStatus: t.status,
          },
        ];
      });
      // Las cuotas pendientes de las membresías de las que es titular, con su estado al día.
      const held = await tx
        .select({ id: patientMemberships.id })
        .from(patientMemberships)
        .where(and(eq(patientMemberships.holderPatientId, patientId), ne(patientMemberships.status, 'cancelled')));
      for (const h of held) await settleMembership(tx, h.id, now);
      const feeRows =
        held.length > 0
          ? await tx
              .select({ fee: membershipFees, code: patientMemberships.code, planName: membershipPlans.nameEs })
              .from(membershipFees)
              .innerJoin(patientMemberships, eq(patientMemberships.id, membershipFees.membershipId))
              .innerJoin(membershipPlans, eq(membershipPlans.id, patientMemberships.planId))
              .where(and(inArray(membershipFees.membershipId, held.map((h) => h.id)), eq(membershipFees.status, 'pending')))
              .orderBy(asc(membershipFees.dueDate), asc(membershipFees.kind))
          : [];
      const fees: PatientBalanceFee[] = feeRows.map(({ fee, code, planName }) => ({
        feeId: fee.id,
        membershipId: fee.membershipId,
        membershipCode: code,
        planName,
        kind: fee.kind as PatientBalanceFee['kind'],
        dueDate: fee.dueDate,
        amountCents: fee.amountCents,
        version: fee.version,
      }));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'billing.balances_view',
        ...base(actor, ctx.locationId, 'patient', patientId, meta),
        metadata: { visits: visits.length, fees: fees.length, locations: mine.length },
      });
      return { visits, fees, canCollect: actor.permissions.has('checkout.access') };
    });
  }

  // --- Ayudas ------------------------------------------------------------------

  async #voidVisitPayment(tx: Tx, actor: Principal, found: PaymentRow, input: { reason: string; expectedVersion: number }, meta: RequestMeta) {
    const now = this.#clock.now();
    const { current, before } = await this.#lockStatement(tx, actor, found.locationId, found.encounterId ?? '', input.expectedVersion, meta);
    const reversalId = await this.#insertReversal(tx, actor, found, input.reason, now);
    const after = await this.#afterChange(tx, current, now);
    await this.#audit.inTx(tx, found.organizationId, {
      action: 'payment.voided',
      ...base(actor, found.locationId, 'payment', found.id, meta),
      reason: input.reason,
      metadata: {
        encounterCode: current.code,
        reversalId,
        method: found.method,
        amountCents: found.amountCents,
        from: 'recorded',
        to: 'voided',
        ...money('before', before),
        ...money('after', after),
      },
    });
    return { status: 200, resourceIds: [found.id, current.id, 'visit'] };
  }

  async #voidFeePayment(tx: Tx, actor: Principal, found: PaymentRow, input: { reason: string; expectedVersion: number }, meta: RequestMeta) {
    const now = this.#clock.now();
    const [ref] = await tx.select({ membershipId: membershipFees.membershipId }).from(membershipFees).where(eq(membershipFees.id, found.membershipFeeId ?? ''));
    if (!ref) throw new HttpError(404, 'payment_not_found');
    const before = await settleMembership(tx, ref.membershipId, now);
    if (!before) throw new HttpError(404, 'payment_not_found');
    const [fee] = await tx.select().from(membershipFees).where(eq(membershipFees.id, found.membershipFeeId ?? '')).for('update');
    if (!fee) throw new HttpError(404, 'payment_not_found');
    if (fee.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
    if (fee.status !== 'paid') throw new HttpError(409, 'payment_already_voided');
    const [m] = await tx.select({ code: patientMemberships.code }).from(patientMemberships).where(eq(patientMemberships.id, fee.membershipId));
    const reversalId = await this.#insertReversal(tx, actor, found, input.reason, now);
    // Membresía cancelada: la cuota queda «Anulada», sin deuda. Si no, vuelve a pendiente.
    const feeTo = before.status === 'cancelled' ? 'voided' : 'pending';
    await tx
      .update(membershipFees)
      .set(feeTo === 'voided' ? { status: 'voided', paidAt: null, voidedAt: now, version: fee.version + 1 } : { status: 'pending', paidAt: null, version: fee.version + 1 })
      .where(eq(membershipFees.id, fee.id));
    // El estado se recalcula: puede volver a «Pendiente de pago», suspenderse o cancelarse.
    const after = await settleMembership(tx, fee.membershipId, now);
    await this.#audit.inTx(tx, found.organizationId, {
      action: 'payment.voided',
      ...base(actor, requireContext(actor).locationId, 'payment', found.id, meta),
      reason: input.reason,
      metadata: {
        membershipCode: m?.code ?? '',
        feeKind: fee.kind,
        dueDate: fee.dueDate,
        reversalId,
        method: found.method,
        amountCents: found.amountCents,
        from: 'recorded',
        to: 'voided',
        feeFrom: fee.status,
        feeTo,
        membershipFrom: before.status,
        membershipTo: after?.status ?? before.status,
      },
    });
    return { status: 200, resourceIds: [found.id, fee.id, 'fee'] };
  }

  /** La fila inversa: el mismo destino y método, el monto en negativo y el motivo cifrado. Un pago se anula una sola vez. */
  async #insertReversal(tx: Tx, actor: Principal, found: PaymentRow, reason: string, now: Date): Promise<string> {
    const [already] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.reversesPaymentId, found.id));
    if (already) throw new HttpError(409, 'payment_already_voided');
    const ctx = requireContext(actor);
    const id = uuidv7();
    await tx.insert(payments).values({
      id,
      organizationId: found.organizationId,
      locationId: ctx.locationId,
      patientId: found.patientId,
      encounterId: found.encounterId,
      membershipFeeId: found.membershipFeeId,
      kind: 'void',
      method: found.method,
      amountCents: -found.amountCents,
      reversesPaymentId: found.id,
      reasonEnc: await this.#cipher.encrypt(reason, reasonContext(found.organizationId, id)),
      recordedByMembershipId: await myMembership(tx, actor.userId),
      recordedAt: now,
    });
    return id;
  }

  /**
   * La visita y su estado de cuenta bloqueados (en ese orden), con los
   * beneficios al día, la versión comprobada y los totales de antes. Un
   * estado de cuenta «Anulado» (visita «Cancelada») no admite cambios.
   */
  async #lockStatement(tx: Tx, actor: Principal, locationId: string, encounterId: string, expectedVersion: number, meta: RequestMeta): Promise<{ current: LockedEncounter; before: StatementTotals }> {
    const now = this.#clock.now();
    const current = await lockEncounter(tx, locationId, encounterId);
    const { version, changes } = await prepareStatement(tx, current, now);
    await this.#auditBenefits(tx, actor, current, changes, meta);
    if (version !== expectedVersion) throw new HttpError(409, 'version_conflict');
    if (current.status === 'CANCELLED') throw new HttpError(409, 'statement_voided');
    return { current, before: await statementTotals(tx, current.id) };
  }

  async #afterChange(tx: Tx, current: LockedEncounter, now: Date): Promise<StatementTotals> {
    await touchStatement(tx, { organizationId: current.organizationId, locationId: current.locationId, encounterId: current.id }, now);
    await notifyRealtime(tx, { t: 'event', org: current.organizationId, loc: current.locationId, name: 'billing.changed', ids: { encounter: current.id } });
    return statementTotals(tx, current.id);
  }

  async #auditBenefits(tx: Tx, actor: Principal, current: LockedEncounter, changes: BenefitChange[], meta: RequestMeta): Promise<void> {
    for (const change of changes) {
      await this.#audit.inTx(tx, current.organizationId, {
        action: 'charge.membership_benefits',
        ...base(actor, current.locationId, 'charge', change.chargeId, meta),
        metadata: { encounterCode: current.code, previousDiscountCents: change.previousDiscountCents, discountCents: change.discountCents, includedQuantity: change.includedQuantity },
      });
    }
  }

  /** Anular exige billing.void y además patients.access, es decir, un rol clínico en la sede (ADR 0033). */
  #requireVoid(actor: Principal): void {
    if (!actor.permissions.has('billing.void') || !actor.permissions.has('patients.access')) throw new HttpError(403, 'forbidden');
  }

  async #recorded(actor: Principal, paymentId: string): Promise<PaymentRecorded> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx
        .select({ id: payments.id, version: billingStatements.version })
        .from(payments)
        .innerJoin(billingStatements, eq(billingStatements.encounterId, payments.encounterId))
        .where(and(eq(payments.id, paymentId), eq(payments.locationId, ctx.locationId)));
      if (!row) throw new HttpError(404, 'payment_not_found');
      return { paymentId: row.id, version: row.version };
    });
  }

  async #feeRecorded(actor: Principal, paymentId: string): Promise<PaymentRecorded> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx
        .select({ id: payments.id, version: membershipFees.version })
        .from(payments)
        .innerJoin(membershipFees, eq(membershipFees.id, payments.membershipFeeId))
        .where(eq(payments.id, paymentId));
      if (!row) throw new HttpError(404, 'payment_not_found');
      return { paymentId: row.id, version: row.version };
    });
  }

  async #statementVersion(actor: Principal, id: string, encounterId: string): Promise<VoidResult> {
    const ctx = requireContext(actor);
    const [row] = await this.#tenantDb.withTenant(ctx.organizationId, (tx) =>
      tx
        .select({ version: billingStatements.version })
        .from(billingStatements)
        .where(and(eq(billingStatements.encounterId, encounterId), eq(billingStatements.locationId, ctx.locationId))),
    );
    if (!row) throw new HttpError(404, 'not_found');
    return { id, version: row.version };
  }

  async #feeVersion(actor: Principal, id: string, feeId: string): Promise<VoidResult> {
    const ctx = requireContext(actor);
    const [row] = await this.#tenantDb.withTenant(ctx.organizationId, (tx) => tx.select({ version: membershipFees.version }).from(membershipFees).where(eq(membershipFees.id, feeId)));
    if (!row) throw new HttpError(404, 'not_found');
    return { id, version: row.version };
  }

  /** Nombres del personal (cuentas globales, fuera de RLS; solo las ya filtradas por organización). */
  async names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

function base(actor: Principal, locationId: string, entityType: string, entityId: string, meta: RequestMeta) {
  return { actorType: 'user' as const, actorId: actor.userId, locationId, entityType, entityId, ...meta };
}

/** El antes o el después de los importes del estado de cuenta, para la auditoría (ADR 0018: cambios financieros). */
function money(prefix: 'before' | 'after', t: StatementTotals): Record<string, number> {
  return { [`${prefix}TotalDueCents`]: t.totalDueCents, [`${prefix}PaidCents`]: t.paidCents, [`${prefix}BalanceCents`]: t.balanceCents };
}

export async function myMembership(tx: Tx, userId: string): Promise<string> {
  const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
  if (!mine) throw new HttpError(403, 'forbidden');
  return mine.id;
}
