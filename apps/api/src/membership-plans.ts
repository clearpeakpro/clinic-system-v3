import {
  consultations,
  labTests,
  locations,
  membershipBenefitItems,
  membershipBenefits,
  membershipPlanFees,
  membershipPlans,
  procedures,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import type {
  BenefitItem,
  BenefitItemKind,
  BenefitItemRef,
  BenefitQuotaMode,
  CreateMembershipBenefitInput,
  CreateMembershipPlanInput,
  MembershipBenefit,
  MembershipCategory,
  MembershipPlan,
  MembershipPlanDetail,
  MembershipPlanFee,
  MembershipPlanFeeInput,
  MembershipPlanList,
  UpdateMembershipBenefitInput,
  UpdateMembershipPlanInput,
} from '@clinic/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { AuditService } from './audit.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Planes de membresía y sus beneficios (T-026b parte A; S-ADM-21 y 22;
// ADR 0034), sobre la organización activa y bajo su RLS. Solo Administración
// (catalog.manage):
//  - el código del plan es único en la organización e inmutable;
//  - planes y beneficios se desactivan, nunca se borran; concurrencia
//    optimista por versión;
//  - las cuotas del plan (cuota inicial y mensualidad) valen en todas las
//    sedes (decisión 9) y, como los precios (ADR 0029), nunca se modifican:
//    un cambio es una fila nueva desde hoy o después en la sede más
//    adelantada;
//  - cada cambio se audita en la misma transacción con el antes y el
//    después (no son datos clínicos: importes, porcentajes y códigos del
//    catálogo).

const UNIQUE_VIOLATION = '23505';

function pgCode(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown }).cause ?? error;
  return (cause as { code?: string }).code;
}

type PlanRow = typeof membershipPlans.$inferSelect;
type BenefitRow = typeof membershipBenefits.$inferSelect;

const ITEM_TABLES = { consultations, procedures, 'lab-tests': labTests } as const;
const ITEM_COLUMN = { consultations: 'consultationId', procedures: 'procedureId', 'lab-tests': 'labTestId' } as const;

/** Los campos editables del plan, en el orden de la auditoría. */
const PLAN_FIELDS = ['nameEs', 'nameEn', 'descriptionEs', 'descriptionEn', 'maxMembers', 'sortOrder'] as const;

export class MembershipPlanService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;

  constructor(tenantDb: TenantDb, audit: AuditService) {
    this.#tenantDb = tenantDb;
    this.#audit = audit;
  }

  /** S-ADM-21: los planes de la organización, con sus cuotas de hoy y las próximas. */
  async list(actor: Principal): Promise<MembershipPlanList> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const generalToday = await this.#generalToday(tx);
      const rows = await tx.select().from(membershipPlans).orderBy(sql`${membershipPlans.sortOrder} nulls last`, asc(membershipPlans.code));
      const fees = await this.#fees(tx, generalToday);
      const counts = await tx
        .select({ planId: membershipBenefits.planId, n: sql<number>`count(*)::int` })
        .from(membershipBenefits)
        .where(eq(membershipBenefits.active, true))
        .groupBy(membershipBenefits.planId);
      const active = new Map(counts.map((c) => [c.planId, c.n]));
      return { generalToday, plans: rows.map((row) => toPlan(row, fees.get(row.id), active.get(row.id) ?? 0)) };
    });
  }

  /** S-ADM-22: un plan con sus beneficios y los servicios de cada incluido. */
  async detail(actor: Principal, planId: string): Promise<MembershipPlanDetail & { generalToday: string }> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const generalToday = await this.#generalToday(tx);
      const [row] = await tx.select().from(membershipPlans).where(eq(membershipPlans.id, planId));
      if (!row) throw new HttpError(404, 'membership_plan_not_found');
      const fees = await this.#fees(tx, generalToday, planId);
      const benefitRows = await tx
        .select()
        .from(membershipBenefits)
        .where(eq(membershipBenefits.planId, planId))
        .orderBy(sql`${membershipBenefits.sortOrder} nulls last`, asc(membershipBenefits.createdAt), asc(membershipBenefits.id));
      const items = await this.#items(tx, benefitRows.map((b) => b.id));
      const benefits = benefitRows.map((b) => toBenefit(b, items.get(b.id) ?? []));
      return { generalToday, plan: toPlan(row, fees.get(planId), benefits.filter((b) => b.active).length), benefits };
    });
  }

  /** S-ADM-21 «Crear», con sus cuotas. */
  async createPlan(actor: Principal, input: CreateMembershipPlanInput, meta: RequestMeta): Promise<{ id: string }> {
    const ctx = requireContext(actor);
    try {
      return await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const { code, fee, ...fields } = input;
        const [row] = await tx
          .insert(membershipPlans)
          .values({ ...fields, code, organizationId: ctx.organizationId })
          .returning({ id: membershipPlans.id });
        if (!row) throw new Error('No se creó el plan');
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'membership_plan.created',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'membership_plan',
          entityId: row.id,
          ...meta,
          metadata: { code, maxMembers: input.maxMembers },
        });
        await this.#setFee(tx, actor, row.id, fee, meta);
        return { id: row.id };
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) throw new HttpError(409, 'catalog_code_taken');
      throw error;
    }
  }

  /** S-ADM-21 «Guardar». El código no cambia; unas cuotas nuevas son una fila nueva. */
  async updatePlan(actor: Principal, planId: string, input: UpdateMembershipPlanInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#loadPlan(tx, planId, input.expectedVersion);
      const fields = PLAN_FIELDS.filter((key) => input[key] !== current[key]);
      if (fields.length > 0) {
        await tx
          .update(membershipPlans)
          .set({ ...Object.fromEntries(fields.map((key) => [key, input[key]])), version: sql`${membershipPlans.version} + 1` })
          .where(eq(membershipPlans.id, planId));
        const metadata: Record<string, string | number | boolean> = { fields: fields.join(',') };
        // El máximo de personas cambia lo que cubre el plan: antes y después.
        if (fields.includes('maxMembers')) {
          metadata.previousMaxMembers = current.maxMembers;
          metadata.newMaxMembers = input.maxMembers;
        }
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'membership_plan.updated',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'membership_plan',
          entityId: planId,
          ...meta,
          metadata,
        });
      }
      if (input.fee) await this.#setFee(tx, actor, planId, input.fee, meta);
    });
  }

  /** «Desactivar» (con motivo) y «Activar». */
  async setPlanActive(actor: Principal, planId: string, active: boolean, input: { expectedVersion: number; reason?: string }, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#loadPlan(tx, planId, input.expectedVersion);
      if (current.active === active) throw new HttpError(409, active ? 'catalog_item_already_active' : 'catalog_item_already_inactive');
      await tx
        .update(membershipPlans)
        .set({ active, version: sql`${membershipPlans.version} + 1` })
        .where(eq(membershipPlans.id, planId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: active ? 'membership_plan.reactivated' : 'membership_plan.deactivated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'membership_plan',
        entityId: planId,
        ...(input.reason ? { reason: input.reason } : {}),
        ...meta,
      });
    });
  }

  /** S-ADM-22 «Crear». Los servicios de un incluido deben estar activos en el catálogo. */
  async createBenefit(actor: Principal, planId: string, input: CreateMembershipBenefitInput, meta: RequestMeta): Promise<{ id: string }> {
    const ctx = requireContext(actor);
    try {
      return await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const [plan] = await tx.select({ id: membershipPlans.id }).from(membershipPlans).where(eq(membershipPlans.id, planId));
        if (!plan) throw new HttpError(404, 'membership_plan_not_found');
        const [row] = await tx
          .insert(membershipBenefits)
          .values({ organizationId: ctx.organizationId, planId, ...benefitValues(input) })
          .returning({ id: membershipBenefits.id });
        if (!row) throw new Error('No se creó el beneficio');
        const codes = input.type === 'included' ? await this.#replaceItems(tx, ctx.organizationId, row.id, input.items) : '';
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'membership_benefit.created',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'membership_benefit',
          entityId: row.id,
          ...meta,
          metadata: { planId, type: input.type, ...describe(input, codes, 'new') },
        });
        return { id: row.id };
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) throw new HttpError(409, 'benefit_category_taken');
      throw error;
    }
  }

  /** S-ADM-22 «Guardar». El tipo no se puede cambiar después de crearlo. */
  async updateBenefit(actor: Principal, benefitId: string, input: UpdateMembershipBenefitInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    try {
      await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const current = await this.#loadBenefit(tx, benefitId, input.expectedVersion);
        if (current.type !== input.type) throw new HttpError(400, 'benefit_type_immutable');
        const before = current.type === 'included' ? await this.#codes(tx, benefitId) : '';
        await tx
          .update(membershipBenefits)
          // El tipo no se actualiza (no cambia y clinic_app no tiene permiso sobre esa columna).
          .set({ ...withoutType(benefitValues(input)), version: sql`${membershipBenefits.version} + 1` })
          .where(eq(membershipBenefits.id, benefitId));
        const after = input.type === 'included' ? await this.#replaceItems(tx, ctx.organizationId, benefitId, input.items) : '';
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'membership_benefit.updated',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'membership_benefit',
          entityId: benefitId,
          ...meta,
          metadata: { planId: current.planId, type: current.type, ...describe(rowAsInput(current), before, 'previous'), ...describe(input, after, 'new') },
        });
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) throw new HttpError(409, 'benefit_category_taken');
      throw error;
    }
  }

  /** «Desactivar» (con motivo) y «Activar» un beneficio. */
  async setBenefitActive(
    actor: Principal,
    benefitId: string,
    active: boolean,
    input: { expectedVersion: number; reason?: string },
    meta: RequestMeta,
  ): Promise<void> {
    const ctx = requireContext(actor);
    try {
      await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const current = await this.#loadBenefit(tx, benefitId, input.expectedVersion);
        if (current.active === active) throw new HttpError(409, active ? 'catalog_item_already_active' : 'catalog_item_already_inactive');
        await tx
          .update(membershipBenefits)
          .set({ active, version: sql`${membershipBenefits.version} + 1` })
          .where(eq(membershipBenefits.id, benefitId));
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: active ? 'membership_benefit.reactivated' : 'membership_benefit.deactivated',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'membership_benefit',
          entityId: benefitId,
          ...(input.reason ? { reason: input.reason } : {}),
          ...meta,
          metadata: { planId: current.planId },
        });
      });
    } catch (error) {
      // Activar un descuento de una categoría que ya tiene otro activo.
      if (pgCode(error) === UNIQUE_VIOLATION) throw new HttpError(409, 'benefit_category_taken');
      throw error;
    }
  }

  /**
   * Cuotas nuevas: fila nueva, sin tocar las anteriores, desde hoy o después
   * en la sede más adelantada (valen en todas las sedes). Se audita con las
   * que regían ese día y las nuevas.
   */
  async #setFee(tx: Tx, actor: Principal, planId: string, fee: MembershipPlanFeeInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    if (fee.effectiveFrom < (await this.#generalToday(tx))) throw new HttpError(400, 'effective_from_past');
    const [before] = await tx
      .select()
      .from(membershipPlanFees)
      .where(and(eq(membershipPlanFees.planId, planId), sql`${membershipPlanFees.effectiveFrom} <= ${fee.effectiveFrom}::date`))
      .orderBy(sql`${membershipPlanFees.effectiveFrom} desc`, sql`${membershipPlanFees.createdAt} desc`, sql`${membershipPlanFees.id} desc`)
      .limit(1);
    await tx.insert(membershipPlanFees).values({ organizationId: ctx.organizationId, planId, ...fee });
    await this.#audit.inTx(tx, ctx.organizationId, {
      action: 'membership_plan.fee_set',
      actorType: 'user',
      actorId: actor.userId,
      locationId: ctx.locationId,
      entityType: 'membership_plan',
      entityId: planId,
      ...meta,
      // Datos financieros, no clínicos: cuotas anteriores y nuevas (ADR 0018).
      metadata: {
        effectiveFrom: fee.effectiveFrom,
        previousInitialCents: before?.initialFeeCents ?? 'none',
        previousMonthlyCents: before?.monthlyFeeCents ?? 'none',
        newInitialCents: fee.initialFeeCents,
        newMonthlyCents: fee.monthlyFeeCents,
      },
    });
  }

  /** Por plan, las cuotas que rigen `today` y las próximas programadas. */
  async #fees(tx: Tx, today: string, planId?: string): Promise<Map<string, MembershipPlan['fee']>> {
    const query = (which: 'current' | 'next') =>
      tx.execute<{ plan_id: string; initial_fee_cents: number; monthly_fee_cents: number; effective_from: string }>(sql`
        select distinct on (plan_id) plan_id, initial_fee_cents, monthly_fee_cents, effective_from::text as effective_from
          from app.membership_plan_fees
         where ${which === 'current' ? sql`effective_from <= ${today}::date` : sql`effective_from > ${today}::date`}
           ${planId ? sql`and plan_id = ${planId}` : sql``}
         order by plan_id, effective_from ${which === 'current' ? sql`desc` : sql`asc`}, created_at desc, id desc`);
    const result = new Map<string, MembershipPlan['fee']>();
    const fee = (r: { initial_fee_cents: number; monthly_fee_cents: number; effective_from: string }): MembershipPlanFee => ({
      initialFeeCents: r.initial_fee_cents,
      monthlyFeeCents: r.monthly_fee_cents,
      effectiveFrom: r.effective_from,
    });
    const entry = (id: string) => {
      const value = result.get(id) ?? { current: null, next: null };
      result.set(id, value);
      return value;
    };
    for (const r of (await query('current')).rows) entry(r.plan_id).current = fee(r);
    for (const r of (await query('next')).rows) entry(r.plan_id).next = fee(r);
    return result;
  }

  /** Los servicios de cada beneficio incluido, con el código y el nombre del catálogo. */
  async #items(tx: Tx, benefitIds: string[]): Promise<Map<string, BenefitItem[]>> {
    const result = new Map<string, BenefitItem[]>();
    if (benefitIds.length === 0) return result;
    const rows = await tx.select().from(membershipBenefitItems).where(inArray(membershipBenefitItems.benefitId, benefitIds));
    const catalog = await this.#catalogItems(tx, rows.map(refOf));
    for (const row of rows) {
      const ref = refOf(row);
      const item = catalog.get(`${ref.kind}:${ref.id}`);
      if (!item) continue;
      const list = result.get(row.benefitId) ?? [];
      list.push(item);
      result.set(row.benefitId, list);
    }
    for (const list of result.values()) list.sort((a, b) => a.code.localeCompare(b.code));
    return result;
  }

  /** Código, nombre y estado de cada servicio referido, por `tipo:id`. */
  async #catalogItems(tx: Tx, refs: BenefitItemRef[]): Promise<Map<string, BenefitItem>> {
    const result = new Map<string, BenefitItem>();
    for (const kind of Object.keys(ITEM_TABLES) as BenefitItemKind[]) {
      const ids = [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))];
      if (ids.length === 0) continue;
      const table = ITEM_TABLES[kind];
      const rows = await tx.select({ id: table.id, code: table.code, name: table.name, active: table.active }).from(table).where(inArray(table.id, ids));
      for (const r of rows) result.set(`${kind}:${r.id}`, { kind, ...r });
    }
    return result;
  }

  /**
   * Reemplaza los servicios de un beneficio incluido (configuración, no
   * finanzas). Cada servicio debe existir y estar activo. Devuelve sus
   * códigos ordenados, para la auditoría.
   */
  async #replaceItems(tx: Tx, organizationId: string, benefitId: string, refs: BenefitItemRef[]): Promise<string> {
    const catalog = await this.#catalogItems(tx, refs);
    const items = refs.map((ref) => catalog.get(`${ref.kind}:${ref.id}`));
    if (items.some((item) => !item?.active)) throw new HttpError(400, 'invalid_benefit_item');
    await tx.delete(membershipBenefitItems).where(eq(membershipBenefitItems.benefitId, benefitId));
    await tx.insert(membershipBenefitItems).values(refs.map((ref) => ({ organizationId, benefitId, [ITEM_COLUMN[ref.kind]]: ref.id })));
    return items
      .map((item) => item?.code ?? '')
      .sort()
      .join(',');
  }

  /** Los códigos de los servicios de un beneficio, ordenados. */
  async #codes(tx: Tx, benefitId: string): Promise<string> {
    const items = await this.#items(tx, [benefitId]);
    return (items.get(benefitId) ?? [])
      .map((item) => item.code)
      .sort()
      .join(',');
  }

  /** Bloquea el plan y comprueba la versión (409 version_conflict). */
  async #loadPlan(tx: Tx, planId: string, expectedVersion: number): Promise<PlanRow> {
    const [row] = await tx.select().from(membershipPlans).where(eq(membershipPlans.id, planId)).for('update');
    if (!row) throw new HttpError(404, 'membership_plan_not_found');
    if (row.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
    return row;
  }

  /** Bloquea el beneficio y comprueba la versión (409 version_conflict). */
  async #loadBenefit(tx: Tx, benefitId: string, expectedVersion: number): Promise<BenefitRow> {
    const [row] = await tx.select().from(membershipBenefits).where(eq(membershipBenefits.id, benefitId)).for('update');
    if (!row) throw new HttpError(404, 'membership_benefit_not_found');
    if (row.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
    return row;
  }

  /** El día más adelantado entre las sedes activas: unas cuotas nuevas no pueden cambiar el pasado de ninguna. */
  async #generalToday(tx: Tx): Promise<string> {
    const [row] = await tx
      .select({ today: sql<string>`(max((now() at time zone ${locations.timezone})::date))::text` })
      .from(locations)
      .where(eq(locations.active, true));
    if (!row?.today) throw new HttpError(409, 'no_active_location');
    return row.today;
  }
}

function refOf(row: typeof membershipBenefitItems.$inferSelect): BenefitItemRef {
  if (row.consultationId) return { kind: 'consultations', id: row.consultationId };
  if (row.procedureId) return { kind: 'procedures', id: row.procedureId };
  return { kind: 'lab-tests', id: row.labTestId ?? '' };
}

function toPlan(row: PlanRow, fee: MembershipPlan['fee'] | undefined, activeBenefits: number): MembershipPlan {
  return {
    id: row.id,
    code: row.code,
    nameEs: row.nameEs,
    nameEn: row.nameEn,
    descriptionEs: row.descriptionEs,
    descriptionEn: row.descriptionEn,
    maxMembers: row.maxMembers,
    sortOrder: row.sortOrder,
    active: row.active,
    version: row.version,
    fee: fee ?? { current: null, next: null },
    activeBenefits,
  };
}

function toBenefit(row: BenefitRow, items: BenefitItem[]): MembershipBenefit {
  return {
    id: row.id,
    type: row.type as MembershipBenefit['type'],
    nameEs: row.nameEs,
    nameEn: row.nameEn,
    quantityPerYear: row.quantityPerYear,
    quotaMode: row.quotaMode as MembershipBenefit['quotaMode'],
    includesSameVisitLabs: row.includesSameVisitLabs,
    category: row.category as MembershipBenefit['category'],
    discountBp: row.discountBp,
    sortOrder: row.sortOrder,
    active: row.active,
    version: row.version,
    items,
  };
}

/** Las columnas de un beneficio según su tipo (las del otro tipo, nulas). */
function benefitValues(input: CreateMembershipBenefitInput) {
  return input.type === 'included'
    ? {
        type: 'included',
        nameEs: input.nameEs,
        nameEn: input.nameEn,
        quantityPerYear: input.quantityPerYear,
        quotaMode: input.quotaMode,
        includesSameVisitLabs: input.includesSameVisitLabs,
        category: null,
        discountBp: null,
        sortOrder: input.sortOrder,
      }
    : {
        type: 'discount',
        nameEs: null,
        nameEn: null,
        quantityPerYear: null,
        quotaMode: null,
        includesSameVisitLabs: false,
        category: input.category,
        discountBp: input.discountBp,
        sortOrder: input.sortOrder,
      };
}

/** Un beneficio guardado, en la forma de la entrada (para la auditoría del antes). */
function rowAsInput(row: BenefitRow): CreateMembershipBenefitInput {
  return row.type === 'included'
    ? {
        type: 'included',
        nameEs: row.nameEs ?? '',
        nameEn: row.nameEn ?? '',
        quantityPerYear: row.quantityPerYear ?? 0,
        quotaMode: (row.quotaMode ?? 'shared') as BenefitQuotaMode,
        includesSameVisitLabs: row.includesSameVisitLabs,
        items: [],
        sortOrder: row.sortOrder,
      }
    : { type: 'discount', category: row.category as MembershipCategory, discountBp: row.discountBp ?? 0, sortOrder: row.sortOrder };
}

/** El valor de un beneficio para la auditoría, con el prefijo `previous` o `new`. */
function describe(input: CreateMembershipBenefitInput, codes: string, prefix: 'previous' | 'new'): Record<string, string | number | boolean> {
  if (input.type === 'discount') return { [`${prefix}Category`]: input.category, [`${prefix}DiscountBp`]: input.discountBp };
  return {
    [`${prefix}Quantity`]: input.quantityPerYear,
    [`${prefix}QuotaMode`]: input.quotaMode,
    [`${prefix}SameVisitLabs`]: input.includesSameVisitLabs,
    [`${prefix}Items`]: codes,
  };
}

/** Las columnas de un beneficio sin el tipo, que no cambia nunca. */
function withoutType<T extends { type: string }>(values: T): Omit<T, 'type'> {
  const rest: Partial<T> = { ...values };
  delete rest.type;
  return rest as Omit<T, 'type'>;
}
