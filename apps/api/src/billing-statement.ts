import { charges, coverages, ensureStatement, orders, touchStatement, type FieldCipher, type Tx } from '@clinic/db';
import {
  computeStatement,
  isOpenVisitStatus,
  type BillingItemKind,
  type ChargeSource,
  type CoverageType,
  type InsuranceTerm,
  type StatementCoverage,
  type StatementLine,
  type StatementTotals,
  type StatementVoidedLine,
  type VisitStatus,
} from '@clinic/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { recalculateVisitBenefits, type BenefitChange } from './membership-benefits.ts';

// El estado de cuenta de una visita (T-027), leído y calculado en el servidor.
// Lo usan la Caja (billing.ts) y «Completar visita» (encounters.ts). Siempre
// dentro de withTenant y con la visita bloqueada por quien llama.
//  - prepareStatement(): con la visita abierta, recalcula los beneficios de
//    membresía de todos sus cargos activos (decisión del 2026-11-04: también
//    al abrir el estado de cuenta, porque la membresía puede haberse
//    suspendido o reactivado con el reloj) y, si algo cambió, sube la versión
//    del estado de cuenta. Con la visita cerrada no toca nada: los beneficios
//    quedan fijos al completarse.
//  - readStatement(): cargos activos y anulados, cobertura y totales con
//    computeStatement() de @clinic/shared. Los pagos llegan con T-028: hasta
//    entonces «Pagado» es $0.00.

/** Lo pagado en la visita. T-028 lo leerá de `payments`. */
const PAID_CENTS_UNTIL_PAYMENTS = 0;

export interface VisitKey {
  id: string;
  organizationId: string;
  locationId: string;
  status: VisitStatus;
}

export interface StatementData {
  version: number;
  coverage: StatementCoverage | null;
  totals: StatementTotals;
  lines: StatementLine[];
  voided: StatementVoidedLine[];
}

const voidContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'charges', column: 'void_reason', recordId });

/** Recalcula los beneficios de una visita abierta y deja el estado de cuenta creado (y con su versión al día). */
export async function prepareStatement(tx: Tx, visit: VisitKey, now: Date): Promise<{ version: number; changes: BenefitChange[] }> {
  const key = { organizationId: visit.organizationId, locationId: visit.locationId, encounterId: visit.id };
  const changes = isOpenVisitStatus(visit.status) ? await recalculateVisitBenefits(tx, visit.id, now) : [];
  const row = changes.length > 0 ? await touchStatement(tx, key, now) : await ensureStatement(tx, key, now);
  return { version: row.version, changes };
}

/** Totales de la visita (sin líneas): lo que necesita «Completar visita» y la cola. */
export async function statementTotals(tx: Tx, encounterId: string): Promise<StatementTotals> {
  const active = await tx
    .select({ amountCents: charges.amountCents, membershipDiscountCents: charges.membershipDiscountCents })
    .from(charges)
    .where(and(eq(charges.encounterId, encounterId), eq(charges.status, 'active')));
  return computeStatement({ lines: active, coverage: await statementCoverage(tx, encounterId), paidCents: PAID_CENTS_UNTIL_PAYMENTS });
}

/** Totales de varias visitas a la vez (la cola de Caja), con lo guardado en sus cargos. */
export async function totalsByVisit(tx: Tx, encounterIds: string[]): Promise<Map<string, StatementTotals>> {
  if (encounterIds.length === 0) return new Map();
  const rows = await tx
    .select({ encounterId: charges.encounterId, amountCents: charges.amountCents, membershipDiscountCents: charges.membershipDiscountCents })
    .from(charges)
    .where(and(inArray(charges.encounterId, encounterIds), eq(charges.status, 'active')));
  const covs = await tx
    .select({ encounterId: coverages.encounterId, type: coverages.type, term: coverages.term, amountCents: coverages.amountCents, coinsuranceBp: coverages.coinsuranceBp })
    .from(coverages)
    .where(inArray(coverages.encounterId, encounterIds));
  const result = new Map<string, StatementTotals>();
  for (const id of encounterIds) {
    const cov = covs.find((c) => c.encounterId === id);
    result.set(
      id,
      computeStatement({
        lines: rows.filter((r) => r.encounterId === id),
        coverage: cov ? toCoverage(cov) : null,
        paidCents: PAID_CENTS_UNTIL_PAYMENTS,
      }),
    );
  }
  return result;
}

/** El estado de cuenta completo: líneas, anulados (con su motivo descifrado), cobertura y totales. */
export async function readStatement(tx: Tx, cipher: FieldCipher, visit: VisitKey, version: number): Promise<StatementData> {
  const rows = await tx
    .select({ charge: charges, orderCode: orders.code })
    .from(charges)
    .leftJoin(orders, eq(orders.id, charges.orderId))
    .where(eq(charges.encounterId, visit.id))
    .orderBy(asc(charges.createdAt), asc(charges.id));
  const coverage = await statementCoverage(tx, visit.id);
  const active = rows.filter((r) => r.charge.status === 'active');
  const lines: StatementLine[] = active.map(({ charge, orderCode }) => ({
    id: charge.id,
    source: charge.source as ChargeSource,
    kind: itemKind(charge),
    itemCode: charge.itemCode,
    itemName: charge.itemName,
    orderCode,
    quantity: charge.quantity,
    unitPriceCents: charge.unitPriceCents,
    amountCents: charge.amountCents,
    discountCents: charge.membershipDiscountCents,
    includedQuantity: charge.membershipIncludedQuantity,
    lineTotalCents: charge.amountCents - charge.membershipDiscountCents,
    createdAt: charge.createdAt.toISOString(),
  }));
  const voided: StatementVoidedLine[] = await Promise.all(
    rows
      .filter((r) => r.charge.status === 'voided')
      .map(async ({ charge }) => ({
        id: charge.id,
        source: charge.source as ChargeSource,
        itemCode: charge.itemCode,
        itemName: charge.itemName,
        amountCents: charge.amountCents,
        reason: charge.voidReasonEnc ? await cipher.decrypt(charge.voidReasonEnc, voidContext(visit.organizationId, charge.id)) : null,
      })),
  );
  const totals = computeStatement({
    lines: active.map((r) => ({ amountCents: r.charge.amountCents, membershipDiscountCents: r.charge.membershipDiscountCents })),
    coverage,
    paidCents: PAID_CENTS_UNTIL_PAYMENTS,
  });
  return { version, coverage, totals, lines, voided };
}

async function statementCoverage(tx: Tx, encounterId: string): Promise<StatementCoverage | null> {
  const [row] = await tx
    .select({ type: coverages.type, term: coverages.term, amountCents: coverages.amountCents, coinsuranceBp: coverages.coinsuranceBp })
    .from(coverages)
    .where(eq(coverages.encounterId, encounterId));
  return row ? toCoverage(row) : null;
}

function toCoverage(row: { type: string; term: string | null; amountCents: number | null; coinsuranceBp: number | null }): StatementCoverage {
  return { type: row.type as CoverageType, term: row.term as InsuranceTerm | null, amountCents: row.amountCents, coinsuranceBp: row.coinsuranceBp };
}

function itemKind(charge: { consultationId: string | null; labTestId: string | null }): BillingItemKind {
  if (charge.consultationId) return 'consultation';
  return charge.labTestId ? 'lab_test' : 'procedure';
}
