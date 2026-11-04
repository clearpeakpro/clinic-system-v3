import {
  localDay,
  locations,
  membershipFees,
  membershipPlanFees,
  membershipPlans,
  memberships,
  nextMembershipCode,
  patientMembershipEvents,
  patientMembershipMembers,
  patientMemberships,
  patients,
  settleMembership,
  user as userTable,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  addDays,
  benefitYear,
  cancellationNotice,
  initialFeePeriod,
  addMembershipMemberSchema,
  enrollMembershipSchema,
  membershipVersionSchema,
  MEMBERSHIP_START_MAX_DAYS_AHEAD,
  type CoverageMembership,
  type EnrollmentOptions,
  type MembershipCancellation,
  type MembershipCancelResult,
  type MembershipEventAction,
  type MembershipFeeKind,
  type MembershipFeeStatus,
  type MembershipHistoryEntry,
  type MembershipMemberRole,
  type MembershipSaved,
  type PatientMembershipCard,
  type PatientMembershipStatus,
  type PatientMembershipView,
} from '@clinic/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import type { IdempotencyService } from './idempotency.ts';
import { eligibleMembership } from './membership-benefits.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Membresía del paciente (T-026b parte B; S-PAC-22 y S-PAC-23; ADR 0034).
//  - Inscribe Recepción (memberships.manage) desde el perfil: plan, fecha de
//    inicio (hoy o hasta 30 días después), día de cobro y, en el plan
//    Familiar, afiliados que ya son pacientes. «Identidad verificada» es
//    obligatoria y se guarda quién y cuándo: nunca un número de ID ni datos
//    de tarjeta. Con Idempotency-Key.
//  - La membresía se inscribe con las cuotas vigentes del plan ese día y las
//    guarda («Monto fijo»). Queda «Pendiente de pago», con la cuota inicial
//    pendiente: T-028 la cobra y la activa.
//  - Un paciente, en una sola membresía en curso (índice único de la base).
//  - Antes de leer o cambiar una membresía se deja guardado su estado con el
//    reloj (settleMembership), igual que hace el worker cada hora.
//  - Auditoría: códigos, plan, fechas e importes; nunca nombres.

/** Violación de un índice único, con el nombre de la restricción. */
function uniqueViolation(error: unknown): string | null {
  const pgError = ((error as { cause?: unknown }).cause ?? error) as { code?: string; constraint?: string };
  return pgError.code === '23505' ? (pgError.constraint ?? '') : null;
}

/**
 * La membresía en curso del paciente que da beneficios hoy (S-REC-24 y
 * S-CLI-12): «Membresía activa: {plan} (desde {fecha})». Nula si no hay.
 */
export async function coverageMembership(tx: Tx, patientId: string, now: Date): Promise<CoverageMembership | null> {
  const [current] = await tx
    .select({ id: patientMembershipMembers.membershipId })
    .from(patientMembershipMembers)
    .where(and(eq(patientMembershipMembers.patientId, patientId), isNull(patientMembershipMembers.removedAt)));
  if (!current) return null;
  const m = await eligibleMembership(tx, patientId, current.id, now);
  if (!m) return null;
  const [row] = await tx
    .select({ id: patientMemberships.id, code: patientMemberships.code, startDate: patientMemberships.startDate, planName: membershipPlans.nameEs })
    .from(patientMemberships)
    .innerJoin(membershipPlans, eq(membershipPlans.id, patientMemberships.planId))
    .where(eq(patientMemberships.id, m.id));
  return row ?? null;
}

/** La membresía con su plan, sede, personas, cuotas e historial. */
async function loadMembership(tx: Tx, membershipId: string, now: Date) {
  const [m] = await tx
    .select({ membership: patientMemberships, plan: membershipPlans, location: { code: locations.code, name: locations.name, timezone: locations.timezone } })
    .from(patientMemberships)
    .innerJoin(membershipPlans, eq(membershipPlans.id, patientMemberships.planId))
    .innerJoin(locations, eq(locations.id, patientMemberships.locationId))
    .where(eq(patientMemberships.id, membershipId));
  if (!m) return null;
  const people = await tx
    .select({ member: patientMembershipMembers, code: patients.code, firstName: patients.firstName, lastName: patients.lastName })
    .from(patientMembershipMembers)
    .innerJoin(patients, eq(patients.id, patientMembershipMembers.patientId))
    .where(eq(patientMembershipMembers.membershipId, membershipId))
    .orderBy(asc(patientMembershipMembers.addedAt), asc(patientMembershipMembers.id));
  const fees = await tx.select().from(membershipFees).where(eq(membershipFees.membershipId, membershipId)).orderBy(asc(membershipFees.dueDate), asc(membershipFees.kind));
  const events = await tx
    .select({ event: patientMembershipEvents, patientCode: patients.code, actorUserId: memberships.userId })
    .from(patientMembershipEvents)
    .leftJoin(patients, eq(patients.id, patientMembershipEvents.patientId))
    .leftJoin(memberships, eq(memberships.id, patientMembershipEvents.actorMembershipId))
    .where(eq(patientMembershipEvents.membershipId, membershipId))
    .orderBy(desc(patientMembershipEvents.occurredAt), desc(patientMembershipEvents.id));
  const [verifier] = await tx.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.id, m.membership.identityVerifiedByMembershipId));
  return { ...m, people, fees, events, verifierUserId: verifier?.userId ?? null, today: localDay(now, m.location.timezone) };
}

type LoadedMembership = NonNullable<Awaited<ReturnType<typeof loadMembership>>>;

export class PatientMembershipService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #idempotency: IdempotencyService;
  readonly #clock: Clock;

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, idempotency: IdempotencyService, clock: Clock) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#idempotency = idempotency;
    this.#clock = clock;
  }

  /** S-PAC-23: los planes activos con cuotas vigentes hoy en la sede activa, y el rango de la fecha de inicio. */
  async enrollmentOptions(actor: Principal): Promise<EnrollmentOptions> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const today = await this.#today(tx, ctx.locationId);
      const plans = await this.#enrollablePlans(tx, today);
      return { plans, today, maxStartDate: addDays(today, MEMBERSHIP_START_MAX_DAYS_AHEAD) };
    });
  }

  /** S-PAC-22: la tarjeta «Membresía» del perfil. Lectura auditada. */
  async card(actor: Principal, patientId: string, meta: RequestMeta): Promise<PatientMembershipCard> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [patient] = await tx.select({ id: patients.id, status: patients.status, mergedInto: patients.mergedInto }).from(patients).where(eq(patients.id, patientId));
      if (!patient) throw new HttpError(404, 'patient_not_found');
      const today = await this.#today(tx, ctx.locationId);
      // La membresía en curso (con el estado del reloj guardado) o, si no
      // hay, la última cancelada en la que estuvo. Un afiliado quitado de una
      // membresía que sigue no la ve como suya.
      const [current] = await tx
        .select({ id: patientMembershipMembers.membershipId })
        .from(patientMembershipMembers)
        .where(and(eq(patientMembershipMembers.patientId, patientId), isNull(patientMembershipMembers.removedAt)));
      const settled = current ? await settleMembership(tx, current.id, now) : null;
      const inCourse = current && settled?.status !== 'cancelled' ? current.id : null;
      const [lastCancelled] = inCourse
        ? []
        : await tx
            .select({ id: patientMemberships.id })
            .from(patientMembershipMembers)
            .innerJoin(patientMemberships, eq(patientMemberships.id, patientMembershipMembers.membershipId))
            .where(and(eq(patientMembershipMembers.patientId, patientId), eq(patientMemberships.status, 'cancelled')))
            .orderBy(desc(patientMemberships.updatedAt))
            .limit(1);
      const shownId = inCourse ?? lastCancelled?.id ?? null;
      const view = shownId ? await loadMembership(tx, shownId, now) : null;
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'patient.membership_view',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        entityId: patientId,
        ...meta,
      });
      const me = await this.#myMembership(tx, actor.userId);
      return { patient, today, view, me, inCourse };
    });
    const membership = data.view ? await this.#view(actor, data.view, patientId, data.me) : null;
    const manage = actor.permissions.has('memberships.manage');
    return {
      membership,
      canEnroll: manage && data.patient.status === 'active' && !data.patient.mergedInto && data.inCourse === null,
      today: data.today,
    };
  }

  /** «Inscribir» (S-PAC-23), con Idempotency-Key. */
  async enroll(actor: Principal, patientId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<MembershipSaved> {
    const ctx = requireContext(actor);
    const input = enrollMembershipSchema.parse(raw);
    try {
      const result = await this.#idempotency.run(
        ctx.organizationId,
        idempotencyKey,
        { method: 'POST', path: `/api/patients/${patientId}/membership`, body: raw },
        async (tx) => {
          const now = this.#clock.now();
          const [site] = await tx
            .select({ id: locations.id, code: locations.code, timezone: locations.timezone, active: locations.active })
            .from(locations)
            .where(eq(locations.id, ctx.locationId));
          if (!site) throw new HttpError(403, 'no_active_context');
          if (!site.active) throw new HttpError(409, 'location_inactive');
          const today = localDay(now, site.timezone);
          if (input.startDate < today || input.startDate > addDays(today, MEMBERSHIP_START_MAX_DAYS_AHEAD)) throw new HttpError(400, 'invalid_start_date');
          const plan = (await this.#enrollablePlans(tx, today, input.planId))[0];
          if (!plan) throw new HttpError(409, 'plan_not_enrollable');
          if (input.affiliatePatientIds.includes(patientId)) throw new HttpError(400, 'invalid_request');
          const people = [patientId, ...input.affiliatePatientIds];
          if (people.length > plan.maxMembers) throw new HttpError(409, 'too_many_members', { maxMembers: plan.maxMembers });
          for (const person of people) await this.#requireFree(tx, person, now);

          const me = await this.#myMembership(tx, actor.userId);
          const id = uuidv7();
          const code = await nextMembershipCode(tx, ctx.organizationId, site);
          await tx.insert(patientMemberships).values({
            id,
            organizationId: ctx.organizationId,
            code,
            planId: plan.id,
            holderPatientId: patientId,
            locationId: site.id,
            status: 'pending_payment',
            enrolledOn: today,
            startDate: input.startDate,
            billingDay: input.billingDay,
            initialFeeCents: plan.initialFeeCents,
            monthlyFeeCents: plan.monthlyFeeCents,
            enrolledByMembershipId: me,
            identityVerifiedByMembershipId: me,
            identityVerifiedAt: now,
            createdAt: now,
            updatedAt: now,
          });
          for (const [index, person] of people.entries()) {
            await tx.insert(patientMembershipMembers).values({
              organizationId: ctx.organizationId,
              membershipId: id,
              patientId: person,
              role: index === 0 ? 'holder' : 'affiliate',
              addedByMembershipId: me,
              addedAt: now,
            });
          }
          const period = initialFeePeriod(input.startDate, input.billingDay);
          await tx.insert(membershipFees).values({ organizationId: ctx.organizationId, membershipId: id, kind: 'initial', ...period, amountCents: plan.initialFeeCents, createdAt: now });
          await tx.insert(patientMembershipEvents).values({
            organizationId: ctx.organizationId,
            membershipId: id,
            action: 'enrolled',
            fromStatus: null,
            toStatus: 'pending_payment',
            actorType: 'user',
            actorMembershipId: me,
            occurredAt: now,
          });
          const codes = await this.#patientCodes(tx, people);
          await this.#audit.inTx(tx, ctx.organizationId, {
            action: 'patient_membership.enrolled',
            ...this.#base(actor, ctx.locationId, id, meta),
            metadata: {
              code,
              planCode: plan.code,
              startDate: input.startDate,
              billingDay: input.billingDay,
              initialFeeCents: plan.initialFeeCents,
              monthlyFeeCents: plan.monthlyFeeCents,
              holder: codes.get(patientId) ?? '',
              affiliates: input.affiliatePatientIds.map((p) => codes.get(p) ?? '').join(','),
              identityVerified: true,
            },
          });
          await this.#audit.inTx(tx, ctx.organizationId, {
            action: 'membership_fee.created',
            ...this.#base(actor, ctx.locationId, id, meta),
            metadata: { code, kind: 'initial', dueDate: period.dueDate, amountCents: plan.initialFeeCents, previousCents: 'none' },
          });
          return { status: 201, resourceIds: [id] };
        },
        (ids) => this.#saved(actor, ids[0] ?? ''),
      );
      return result.body;
    } catch (error) {
      if (uniqueViolation(error) === 'patient_membership_members_current_key') throw new HttpError(409, 'patient_in_membership');
      throw error;
    }
  }

  /** «Añadir afiliado»: un paciente registrado, hasta el máximo del plan. */
  async addMember(actor: Principal, membershipId: string, raw: unknown, meta: RequestMeta): Promise<MembershipSaved> {
    const input = addMembershipMemberSchema.parse(raw);
    try {
      return await this.#change(actor, membershipId, input.expectedVersion, async (tx, m, me, now) => {
        const current = await tx
          .select({ patientId: patientMembershipMembers.patientId })
          .from(patientMembershipMembers)
          .where(and(eq(patientMembershipMembers.membershipId, m.id), isNull(patientMembershipMembers.removedAt)));
        const [plan] = await tx.select({ maxMembers: membershipPlans.maxMembers }).from(membershipPlans).where(eq(membershipPlans.id, m.planId));
        if (current.length >= (plan?.maxMembers ?? 1)) throw new HttpError(409, 'too_many_members', { maxMembers: plan?.maxMembers ?? 1 });
        await this.#requireFree(tx, input.patientId, now);
        await tx.insert(patientMembershipMembers).values({
          organizationId: m.organizationId,
          membershipId: m.id,
          patientId: input.patientId,
          role: 'affiliate',
          addedByMembershipId: me,
          addedAt: now,
        });
        return { action: 'member_added' as const, patientId: input.patientId };
      }, meta);
    } catch (error) {
      if (uniqueViolation(error) === 'patient_membership_members_current_key') throw new HttpError(409, 'patient_in_membership');
      throw error;
    }
  }

  /** «Quitar afiliado»: el titular no se quita. El cupo ya usado queda en sus cargos. */
  async removeMember(actor: Principal, membershipId: string, patientId: string, raw: unknown, meta: RequestMeta): Promise<MembershipSaved> {
    const input = membershipVersionSchema.parse(raw);
    return this.#change(actor, membershipId, input.expectedVersion, async (tx, m, me, now) => {
      const [person] = await tx
        .select()
        .from(patientMembershipMembers)
        .where(and(eq(patientMembershipMembers.membershipId, m.id), eq(patientMembershipMembers.patientId, patientId), isNull(patientMembershipMembers.removedAt)));
      if (!person) throw new HttpError(404, 'member_not_found');
      if (person.role === 'holder') throw new HttpError(409, 'holder_not_removable');
      await tx.update(patientMembershipMembers).set({ removedAt: now, removedByMembershipId: me }).where(eq(patientMembershipMembers.id, person.id));
      return { action: 'member_removed' as const, patientId };
    }, meta);
  }

  /**
   * «Registrar aviso de cancelación» (decisión 7): con 15 días o más antes del
   * próximo cobro, los beneficios valen hasta el día antes; con menos, esa
   * mensualidad se debe y duran un mes más. «Pendiente de pago» se cancela en
   * el momento (no tuvo beneficios ni pagó nada).
   */
  async cancel(actor: Principal, membershipId: string, raw: unknown, meta: RequestMeta): Promise<MembershipCancelResult> {
    const input = membershipVersionSchema.parse(raw);
    let notice: { benefitsEndDate: string | null; owedDueDate: string | null } = { benefitsEndDate: null, owedDueDate: null };
    const saved = await this.#change(actor, membershipId, input.expectedVersion, async (tx, m, me, now, today) => {
      if (m.cancelNoticeOn) throw new HttpError(409, 'cancel_notice_exists');
      if (m.status === 'pending_payment') {
        await tx
          .update(membershipFees)
          .set({ status: 'voided', voidedAt: now, version: sql`${membershipFees.version} + 1` })
          .where(and(eq(membershipFees.membershipId, m.id), eq(membershipFees.status, 'pending')));
        await tx
          .update(patientMembershipMembers)
          .set({ removedAt: now, removedByMembershipId: me })
          .where(and(eq(patientMembershipMembers.membershipId, m.id), isNull(patientMembershipMembers.removedAt)));
        return { action: 'cancelled' as const, status: 'cancelled' as const, set: { cancelledOn: today, cancellation: 'notice' } };
      }
      const computed = cancellationNotice(m.startDate, m.billingDay, today);
      notice = computed;
      // Ninguna mensualidad después del fin de beneficios (no debería haberla).
      await tx
        .update(membershipFees)
        .set({ status: 'voided', voidedAt: now, version: sql`${membershipFees.version} + 1` })
        .where(and(eq(membershipFees.membershipId, m.id), eq(membershipFees.status, 'pending'), sql`${membershipFees.dueDate} > ${computed.benefitsEndDate}::date`));
      return {
        action: 'cancel_notice' as const,
        set: { cancelNoticeOn: today, cancelNoticeByMembershipId: me, benefitsEndDate: computed.benefitsEndDate },
        metadata: { benefitsEndDate: computed.benefitsEndDate, owedDueDate: computed.owedDueDate ?? 'none' },
      };
    }, meta);
    return { ...saved, ...notice };
  }

  // --- Ayudas -------------------------------------------------------------------

  /**
   * Un cambio de la membresía: se deja guardado su estado, se comprueba la
   * versión y que no esté cancelada, y se registran el historial, la versión
   * y la auditoría.
   */
  async #change(
    actor: Principal,
    membershipId: string,
    expectedVersion: number,
    work: (
      tx: Tx,
      m: typeof patientMemberships.$inferSelect,
      me: string,
      now: Date,
      today: string,
    ) => Promise<{
      action: MembershipEventAction;
      patientId?: string;
      status?: PatientMembershipStatus;
      set?: Partial<typeof patientMemberships.$inferInsert>;
      metadata?: Record<string, string | number | boolean>;
    }>,
    meta: RequestMeta,
  ): Promise<MembershipSaved> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const settled = await settleMembership(tx, membershipId, now);
      if (!settled) throw new HttpError(404, 'membership_not_found');
      const [m] = await tx.select().from(patientMemberships).where(eq(patientMemberships.id, membershipId));
      if (!m) throw new HttpError(404, 'membership_not_found');
      if (m.status === 'cancelled') throw new HttpError(409, 'membership_cancelled');
      if (m.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
      const me = await this.#myMembership(tx, actor.userId);
      const step = await work(tx, m, me, now, settled.today);
      const version = m.version + 1;
      const to = step.status ?? (m.status as PatientMembershipStatus);
      await tx
        .update(patientMemberships)
        .set({ ...step.set, status: to, version, updatedAt: now })
        .where(eq(patientMemberships.id, m.id));
      await tx.insert(patientMembershipEvents).values({
        organizationId: m.organizationId,
        membershipId: m.id,
        action: step.action,
        fromStatus: m.status,
        toStatus: to,
        actorType: 'user',
        actorMembershipId: me,
        patientId: step.patientId ?? null,
        occurredAt: now,
      });
      const codes = step.patientId ? await this.#patientCodes(tx, [step.patientId]) : new Map<string, string>();
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: `patient_membership.${step.action}`,
        ...this.#base(actor, ctx.locationId, m.id, meta),
        metadata: {
          code: m.code,
          from: m.status,
          to,
          version,
          ...(step.patientId ? { patientCode: codes.get(step.patientId) ?? '' } : {}),
          ...step.metadata,
        },
      });
    });
    return this.#saved(actor, membershipId);
  }

  /** El paciente existe, está activo, no está fusionado y no está en otra membresía en curso. */
  async #requireFree(tx: Tx, patientId: string, now: Date): Promise<void> {
    const [patient] = await tx.select({ status: patients.status, mergedInto: patients.mergedInto }).from(patients).where(eq(patients.id, patientId)).for('update');
    if (!patient) throw new HttpError(404, 'patient_not_found');
    if (patient.mergedInto) throw new HttpError(409, 'patient_merged', { patientId });
    if (patient.status !== 'active') throw new HttpError(409, 'patient_inactive', { patientId });
    const [current] = await tx
      .select({ id: patientMembershipMembers.membershipId })
      .from(patientMembershipMembers)
      .where(and(eq(patientMembershipMembers.patientId, patientId), isNull(patientMembershipMembers.removedAt)));
    if (!current) return;
    // Una membresía que el reloj ya canceló libera a sus personas.
    const settled = await settleMembership(tx, current.id, now);
    if (settled?.status !== 'cancelled') throw new HttpError(409, 'patient_in_membership', { patientId });
  }

  /** Planes activos con cuotas vigentes `today` (todas las sedes, decisión 9). */
  async #enrollablePlans(tx: Tx, today: string, planId?: string) {
    const plans = await tx
      .select()
      .from(membershipPlans)
      .where(and(eq(membershipPlans.active, true), ...(planId ? [eq(membershipPlans.id, planId)] : [])))
      .orderBy(sql`${membershipPlans.sortOrder} asc nulls last`, asc(membershipPlans.code));
    if (plans.length === 0) return [];
    const fees = await tx
      .select()
      .from(membershipPlanFees)
      .where(and(inArray(membershipPlanFees.planId, plans.map((p) => p.id)), sql`${membershipPlanFees.effectiveFrom} <= ${today}::date`))
      .orderBy(desc(membershipPlanFees.effectiveFrom), desc(membershipPlanFees.createdAt), desc(membershipPlanFees.id));
    return plans.flatMap((p) => {
      const fee = fees.find((f) => f.planId === p.id);
      return fee
        ? [{ id: p.id, code: p.code, name: p.nameEs, description: p.descriptionEs, maxMembers: p.maxMembers, initialFeeCents: fee.initialFeeCents, monthlyFeeCents: fee.monthlyFeeCents }]
        : [];
    });
  }

  async #view(actor: Principal, data: LoadedMembership, patientId: string, me: string): Promise<PatientMembershipView> {
    const { membership: m, plan, location, people, fees, events, today } = data;
    const names = await this.#names([...events.flatMap((e) => (e.actorUserId ? [e.actorUserId] : [])), ...(data.verifierUserId ? [data.verifierUserId] : [])]);
    const status = m.status as PatientMembershipStatus;
    const cancelled = status === 'cancelled';
    // En curso: los que siguen; cancelada: los que estaban al cancelarse (dados de baja por la cancelación).
    const shown = people.filter((p) => (cancelled ? p.member.removedByMembershipId === null || p.member.removedAt?.getTime() === m.updatedAt.getTime() : p.member.removedAt === null));
    const current = people.filter((p) => p.member.removedAt === null);
    const overdue = status === 'suspended' ? fees.filter((f) => f.kind === 'monthly' && f.status === 'pending' && f.dueDate < today).map((f) => f.dueDate).sort()[0] ?? null : null;
    const manage = actor.permissions.has('memberships.manage') && !cancelled;
    const history: MembershipHistoryEntry[] = events.map(({ event: e, patientCode, actorUserId }) => ({
      id: e.id,
      action: e.action as MembershipEventAction,
      fromStatus: e.fromStatus as PatientMembershipStatus | null,
      toStatus: e.toStatus as PatientMembershipStatus,
      occurredAt: e.occurredAt.toISOString(),
      actor:
        e.actorType === 'system'
          ? { kind: 'system', name: null }
          : e.actorMembershipId === me
            ? { kind: 'me', name: null }
            : { kind: 'user', name: actorUserId ? (names.get(actorUserId) ?? null) : null },
      patientCode,
    }));
    return {
      id: m.id,
      code: m.code,
      status,
      suspendedSince: overdue ? addDays(overdue, 1) : null,
      overdueDueDate: overdue,
      plan: { id: plan.id, code: plan.code, name: plan.nameEs, maxMembers: plan.maxMembers },
      location: { code: location.code, name: location.name },
      enrolledOn: m.enrolledOn,
      startDate: m.startDate,
      billingDay: m.billingDay,
      initialFeeCents: m.initialFeeCents,
      monthlyFeeCents: m.monthlyFeeCents,
      cancelNoticeOn: m.cancelNoticeOn,
      benefitsEndDate: m.benefitsEndDate,
      cancelledOn: m.cancelledOn,
      cancellation: m.cancellation as MembershipCancellation | null,
      identityVerified: { by: m.identityVerifiedByMembershipId === me ? 'Usted' : data.verifierUserId ? (names.get(data.verifierUserId) ?? null) : null, at: m.identityVerifiedAt.toISOString() },
      members: shown.map((p) => ({
        patientId: p.member.patientId,
        code: p.code,
        firstName: p.firstName,
        lastName: p.lastName,
        role: p.member.role as MembershipMemberRole,
        addedAt: p.member.addedAt.toISOString(),
      })),
      fees: fees.map((f) => ({
        id: f.id,
        kind: f.kind as MembershipFeeKind,
        dueDate: f.dueDate,
        periodStart: f.periodStart,
        periodEnd: f.periodEnd,
        amountCents: f.amountCents,
        status: f.status as MembershipFeeStatus,
      })),
      history,
      hasBenefitsToday: status === 'active' && today >= m.startDate && current.some((p) => p.member.patientId === patientId),
      benefitYear: benefitYear(m.startDate, today < m.startDate ? m.startDate : today),
      version: m.version,
      abilities: {
        addMember: manage && current.length < plan.maxMembers,
        removeMember: manage && current.some((p) => p.member.role === 'affiliate'),
        cancel: manage && m.cancelNoticeOn === null,
      },
    };
  }

  async #saved(actor: Principal, membershipId: string): Promise<MembershipSaved> {
    const ctx = requireContext(actor);
    const [row] = await this.#tenantDb.withTenant(ctx.organizationId, (tx) =>
      tx.select({ id: patientMemberships.id, status: patientMemberships.status, version: patientMemberships.version }).from(patientMemberships).where(eq(patientMemberships.id, membershipId)),
    );
    if (!row) throw new HttpError(404, 'membership_not_found');
    return { id: row.id, status: row.status as PatientMembershipStatus, version: row.version };
  }

  async #patientCodes(tx: Tx, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await tx.select({ id: patients.id, code: patients.code }).from(patients).where(inArray(patients.id, ids));
    return new Map(rows.map((r) => [r.id, r.code]));
  }

  async #today(tx: Tx, locationId: string): Promise<string> {
    const [site] = await tx.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, locationId));
    if (!site) throw new HttpError(403, 'no_active_context');
    return localDay(this.#clock.now(), site.timezone);
  }

  async #myMembership(tx: Tx, userId: string): Promise<string> {
    const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
    if (!mine) throw new HttpError(403, 'forbidden');
    return mine.id;
  }

  /** Nombres del personal (cuentas globales, fuera de RLS; solo las ya filtradas por organización). */
  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  #base(actor: Principal, locationId: string, membershipId: string, meta: RequestMeta) {
    return { actorType: 'user' as const, actorId: actor.userId, locationId, entityType: 'patient_membership', entityId: membershipId, ...meta };
  }
}
