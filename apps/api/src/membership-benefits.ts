import {
  charges,
  coverages,
  encounters,
  labTests,
  locations,
  membershipBenefitItems,
  membershipBenefits,
  patientMembershipMembers,
  patientMemberships,
  procedures,
  settleMembership,
  type Tx,
} from '@clinic/db';
import {
  applyMembershipBenefits,
  isOpenVisitStatus,
  type BenefitLine,
  type BenefitLineKind,
  type BenefitQuotaMode,
  type BenefitRules,
  type LineBenefit,
  type MembershipCategory,
  type VisitStatus,
} from '@clinic/shared';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

// Beneficios de membresía en los cargos (T-026b parte B; ADR 0034 y 0041).
//  - Solo con cobertura «Membresía», una membresía que da beneficios hoy
//    (activa y ya empezada, estado calculado con el reloj) y el paciente como
//    persona de esa membresía.
//  - Mientras la visita está abierta, se recalculan los de TODOS sus cargos
//    activos en el orden en que se crearon (decisión del 2026-11-04): así un
//    laboratorio ordenado antes de la consulta de seguimiento (plan Total)
//    sale sin costo, y cancelar una orden libera su incluido. Al completarse
//    la visita quedan fijos: una visita cerrada no se toca.
//  - El cupo usado en otras visitas es la suma de las unidades incluidas de
//    sus cargos activos, por persona, beneficio y año de beneficios.
//  - La membresía queda bloqueada (FOR UPDATE, en settleMembership) mientras
//    se calcula: dos visitas a la vez no usan el mismo incluido.
//  - Cada cargo que cambia sube su versión y deja su auditoría con el antes y
//    el después (importes, no datos clínicos).
//  - T-027: los cargos de Caja (sin orden, también consultas) reciben los
//    mismos beneficios: el servicio se lee del propio cargo.

type ChargeRow = typeof charges.$inferSelect;

export interface BenefitChange {
  chargeId: string;
  previousDiscountCents: number;
  discountCents: number;
  includedQuantity: number;
}

const NO_BENEFIT = {
  patientMembershipId: null,
  benefitYearStart: null,
  includedBenefitId: null,
  membershipIncludedQuantity: 0,
  sameVisitLabsBenefitId: null,
  discountBenefitId: null,
  membershipDiscountBp: null,
  membershipDiscountCents: 0,
} as const;

/** La membresía que da beneficios hoy al paciente de la visita, o null. */
export async function eligibleMembership(tx: Tx, patientId: string, membershipId: string, now: Date) {
  const settled = await settleMembership(tx, membershipId, now);
  if (!settled) return null;
  const [m] = await tx.select({ id: patientMemberships.id, planId: patientMemberships.planId, startDate: patientMemberships.startDate }).from(patientMemberships).where(eq(patientMemberships.id, membershipId));
  if (!m) return null;
  // Activa y ya empezada (hasBenefitsOn), con el estado recién guardado.
  if (settled.status !== 'active' || settled.today < m.startDate) return null;
  const [person] = await tx
    .select({ id: patientMembershipMembers.id })
    .from(patientMembershipMembers)
    .where(and(eq(patientMembershipMembers.membershipId, m.id), eq(patientMembershipMembers.patientId, patientId), isNull(patientMembershipMembers.removedAt)));
  return person ? m : null;
}

/**
 * Recalcula los beneficios de los cargos activos de una visita abierta y los
 * guarda. Devuelve los cargos que cambiaron (para la auditoría de quien lo
 * provocó). La visita debe estar bloqueada por quien llama.
 */
export async function recalculateVisitBenefits(tx: Tx, encounterId: string, now: Date): Promise<BenefitChange[]> {
  const [visit] = await tx
    .select({ status: encounters.status, patientId: encounters.patientId, timezone: locations.timezone })
    .from(encounters)
    .innerJoin(locations, eq(locations.id, encounters.locationId))
    .where(eq(encounters.id, encounterId));
  if (!visit || !isOpenVisitStatus(visit.status as VisitStatus)) return [];
  const active = (
    await tx
      .select({ charge: charges })
      .from(charges)
      .where(and(eq(charges.encounterId, encounterId), eq(charges.status, 'active')))
      .orderBy(asc(charges.createdAt), asc(charges.id))
  ).map((r) => r.charge);
  if (active.length === 0) return [];

  const [coverage] = await tx.select({ type: coverages.type, patientMembershipId: coverages.patientMembershipId }).from(coverages).where(eq(coverages.encounterId, encounterId));
  const membership = coverage?.type === 'membership' && coverage.patientMembershipId ? await eligibleMembership(tx, visit.patientId, coverage.patientMembershipId, now) : null;

  let results: Map<string, LineBenefit> = new Map();
  if (membership) {
    const rules = await planRules(tx, membership.planId);
    const lines = await benefitLines(tx, active);
    const used = await usedElsewhere(tx, membership.id, visit.patientId, encounterId);
    results = new Map(
      applyMembershipBenefits({ rules, startDate: membership.startDate, lines, usedElsewhere: (benefitId, year, item) => used.get(`${benefitId}|${year}|${item ?? ''}`) ?? 0 }).map((r) => [
        r.chargeId,
        r,
      ]),
    );
  }

  const changes: BenefitChange[] = [];
  for (const charge of active) {
    const r = results.get(charge.id);
    const next = r
      ? {
          patientMembershipId: membership?.id ?? null,
          benefitYearStart: r.benefitYearStart,
          includedBenefitId: r.includedBenefitId,
          membershipIncludedQuantity: r.includedQuantity,
          sameVisitLabsBenefitId: r.sameVisitLabsBenefitId,
          discountBenefitId: r.discountBenefitId,
          membershipDiscountBp: r.discountBp,
          membershipDiscountCents: r.discountCents,
        }
      : NO_BENEFIT;
    if (sameBenefit(charge, next)) continue;
    await tx
      .update(charges)
      .set({ ...next, version: charge.version + 1 })
      .where(eq(charges.id, charge.id));
    changes.push({ chargeId: charge.id, previousDiscountCents: charge.membershipDiscountCents, discountCents: next.membershipDiscountCents, includedQuantity: next.membershipIncludedQuantity });
  }
  return changes;
}

function sameBenefit(charge: ChargeRow, next: Record<keyof typeof NO_BENEFIT, unknown>): boolean {
  return (Object.keys(NO_BENEFIT) as (keyof typeof NO_BENEFIT)[]).every((k) => charge[k] === next[k]);
}

/** Los beneficios activos del plan, con los servicios de cada incluido. */
async function planRules(tx: Tx, planId: string): Promise<BenefitRules> {
  const benefits = await tx.select().from(membershipBenefits).where(and(eq(membershipBenefits.planId, planId), eq(membershipBenefits.active, true)));
  const includedIds = benefits.filter((b) => b.type === 'included').map((b) => b.id);
  const items = includedIds.length > 0 ? await tx.select().from(membershipBenefitItems).where(inArray(membershipBenefitItems.benefitId, includedIds)) : [];
  return {
    included: benefits
      .filter((b) => b.type === 'included')
      .map((b) => ({
        id: b.id,
        sortOrder: b.sortOrder,
        quantityPerYear: b.quantityPerYear ?? 0,
        quotaMode: (b.quotaMode ?? 'shared') as BenefitQuotaMode,
        includesSameVisitLabs: b.includesSameVisitLabs,
        items: items
          .filter((i) => i.benefitId === b.id)
          .flatMap((i): { kind: BenefitLineKind; id: string }[] =>
            i.consultationId
              ? [{ kind: 'consultation' as const, id: i.consultationId }]
              : i.procedureId
                ? [{ kind: 'procedure' as const, id: i.procedureId }]
                : i.labTestId
                  ? [{ kind: 'lab_test' as const, id: i.labTestId }]
                  : [],
          ),
      })),
    discounts: benefits
      .filter((b) => b.type === 'discount' && b.category !== null && b.discountBp !== null)
      .map((b) => ({ id: b.id, category: b.category as MembershipCategory, discountBp: b.discountBp ?? 0 })),
  };
}

/** El servicio del catálogo de un cargo. */
function chargeItem(charge: Pick<ChargeRow, 'consultationId' | 'procedureId' | 'labTestId'>): { kind: BenefitLineKind; id: string } {
  if (charge.consultationId) return { kind: 'consultation', id: charge.consultationId };
  if (charge.labTestId) return { kind: 'lab_test', id: charge.labTestId };
  return { kind: 'procedure', id: charge.procedureId ?? '' };
}

/** Cada cargo como línea del cálculo, con la categoría de su servicio (una consulta es siempre «Consulta», ADR 0041). */
async function benefitLines(tx: Tx, rows: ChargeRow[]): Promise<BenefitLine[]> {
  const procedureIds = rows.flatMap((r) => (r.procedureId ? [r.procedureId] : []));
  const labIds = rows.flatMap((r) => (r.labTestId ? [r.labTestId] : []));
  const procedureCategories = new Map(
    (procedureIds.length > 0 ? await tx.select({ id: procedures.id, category: procedures.membershipCategory }).from(procedures).where(inArray(procedures.id, procedureIds)) : []).map((p) => [p.id, p.category]),
  );
  const labCategories = new Map(
    (labIds.length > 0 ? await tx.select({ id: labTests.id, category: labTests.membershipCategory }).from(labTests).where(inArray(labTests.id, labIds)) : []).map((l) => [l.id, l.category]),
  );
  return rows.map((charge) => {
    const item = chargeItem(charge);
    const category =
      item.kind === 'consultation' ? 'consultation' : ((item.kind === 'lab_test' ? labCategories.get(item.id) : procedureCategories.get(item.id)) ?? null);
    return {
      chargeId: charge.id,
      kind: item.kind,
      itemId: item.id,
      category: category as MembershipCategory | null,
      unitPriceCents: charge.unitPriceCents,
      quantity: charge.quantity,
      date: charge.priceDate,
    };
  });
}

/**
 * Unidades incluidas ya usadas por la persona en otras visitas, por
 * beneficio y año (clave `beneficio|año|`, para un «Cupo compartido») y
 * además por servicio (`beneficio|año|kind:id`, para un «Paquete»).
 */
async function usedElsewhere(tx: Tx, membershipId: string, patientId: string, encounterId: string): Promise<Map<string, number>> {
  const rows = await tx
    .select({
      benefitId: charges.includedBenefitId,
      year: charges.benefitYearStart,
      consultationId: charges.consultationId,
      procedureId: charges.procedureId,
      labTestId: charges.labTestId,
      used: sql<number>`coalesce(sum(${charges.membershipIncludedQuantity}), 0)::int`,
    })
    .from(charges)
    .innerJoin(encounters, eq(encounters.id, charges.encounterId))
    .where(
      and(
        eq(charges.patientMembershipId, membershipId),
        eq(encounters.patientId, patientId),
        eq(charges.status, 'active'),
        ne(charges.encounterId, encounterId),
        sql`${charges.includedBenefitId} is not null`,
      ),
    )
    .groupBy(charges.includedBenefitId, charges.benefitYearStart, charges.consultationId, charges.procedureId, charges.labTestId);
  const used = new Map<string, number>();
  const add = (key: string, n: number) => used.set(key, (used.get(key) ?? 0) + n);
  for (const r of rows) {
    const base = `${r.benefitId ?? ''}|${r.year ?? ''}|`;
    add(base, r.used);
    const item = chargeItem(r);
    add(`${base}${item.kind}:${item.id}`, r.used);
  }
  return used;
}
