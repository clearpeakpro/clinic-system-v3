import {
  charges,
  coverages,
  encounters,
  enqueueNotification,
  labProviders,
  labTestCosts,
  labTests,
  locations,
  membershipRoles,
  memberships,
  nextOrderCode,
  notifyRealtime,
  orderItems,
  orders,
  patients,
  procedures,
  user as userTable,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  appendCompletionNote,
  assignOrderSchema,
  autoReadyForCheckout,
  canCancelOrder,
  canChangeOrderLab,
  canOrderIn,
  cancelOrderSchema,
  canMoveOrder,
  changeOrderLabSchema,
  compareLabProviders,
  completeOrderSchema,
  createOrderSchema,
  isOpenOrderStatus,
  isOpenVisitStatus,
  labOrderGroups,
  labsForAll,
  linesTotalCents,
  orderActions,
  orderPreviewSchema,
  ORDER_QUEUE_LIMIT,
  ORDER_QUEUE_TABS,
  ORDER_TYPES,
  startOrderSchema,
  type EncounterOrders,
  type LabCostRecord,
  type LabCoverageType,
  type LabGroup,
  type LabName,
  type OrderableItems,
  type OrderAssignee,
  type OrderLabOptions,
  type OrderLineInput,
  type OrderPreview,
  type OrderPreviewLine,
  type OrderQueue,
  type OrderQueueRow,
  type OrderQueueTab,
  type OrderSaved,
  type OrdersCreated,
  type OrderStatus,
  type OrderType,
  type OrderView,
  type VisitRoute,
  type VisitStatus,
} from '@clinic/shared';
import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import { hasOpenOrders, lockEncounter, type EncounterService, type LockedEncounter } from './encounters.ts';
import type { IdempotencyService } from './idempotency.ts';
import { recalculateVisitBenefits } from './membership-benefits.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Órdenes con su cargo y laboratorio sugerido (T-025; S-CLI-17, 18 y 21).
//  - Las crea solo el rol Proveedor en la sede (ADR 0033), en los estados que
//    las aceptan (canOrderIn). Orden, líneas, cargos, código NOR1-O-…,
//    auditoría y eventos en vivo en una sola transacción con Idempotency-Key
//    (ADR 0019): si falla el cargo, no queda la orden.
//  - Precio: el vigente en la sede el día de la sede (ADR 0029), calculado
//    aquí con el reloj inyectable. La web no suma importes.
//  - Laboratorio (ADR 0028): labOrderGroups() reparte las pruebas en una orden
//    por laboratorio con los costos vigentes ese día y la cobertura de la
//    visita. Ninguna respuesta lleva costos: solo el nombre del laboratorio.
//    Cambiar el sugerido exige motivo y se audita.
//  - Cancelar (S-CLI-21), con motivo e Idempotency-Key: anula sus cargos en la
//    misma transacción y, si era la última orden abierta en «Procedimiento
//    pendiente», la visita pasa sola a «Listo para caja» por la máquina de
//    estados (en el historial, «Sistema»).
//  - Auditoría: de las notas, solo el nombre del campo (ADR 0018); de los
//    cargos, el importe antes y después. Los eventos en vivo, ids y estados.
//  - Ejecutar (T-026; S-CLI-19, 20 y 22): orders.execute, es decir, el rol
//    Enfermería o Proveedor en la sede, sin pasar por encima de la asignación
//    (ADR 0033, decisión del 2026-11-02). Con `version` (409). Completar la
//    última orden abierta en «Procedimiento pendiente» pasa la visita a «Listo
//    para caja» en la misma transacción. Una orden de laboratorio no se
//    completa sin laboratorio (ADR 0028). El aviso «Orden asignada a usted» va
//    por el outbox con el código de la orden.
//  - Cola (S-CLI-03): solo códigos, servicio, cantidad y personal; nunca
//    nombres de pacientes, notas ni costos. «Completadas hoy», con el día de
//    la sede y el reloj inyectable.

/** Tope de un cargo: el mayor entero de la columna `amount_cents`. */
const MAX_CHARGE_CENTS = 2_147_483_647;

const notesContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'orders', column: 'notes', recordId });
const cancelContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'orders', column: 'cancel_reason', recordId });
const voidContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'charges', column: 'void_reason', recordId });

interface CatalogLine {
  itemId: string;
  code: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
}

export class OrderService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #idempotency: IdempotencyService;
  readonly #clock: Clock;
  readonly #encounters: EncounterService;
  readonly #outboxKey: string;

  constructor(
    pool: pg.Pool,
    tenantDb: TenantDb,
    audit: AuditService,
    cipher: FieldCipher,
    idempotency: IdempotencyService,
    clock: Clock,
    encounters: EncounterService,
    outboxKey: string,
  ) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#cipher = cipher;
    this.#idempotency = idempotency;
    this.#clock = clock;
    this.#encounters = encounters;
    this.#outboxKey = outboxKey;
  }

  // --- Lecturas ----------------------------------------------------------------

  /** S-CLI-18: los ítems activos de un tipo con su precio vigente en la sede hoy (sin costos). */
  async orderable(actor: Principal, encounterId: string, type: OrderType): Promise<OrderableItems> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#encounterSite(tx, ctx.locationId, encounterId);
      const date = this.#day(site.timezone);
      const rows =
        type === 'lab'
          ? await tx
              .select({ id: labTests.id, code: labTests.code, name: labTests.name })
              .from(labTests)
              .where(eq(labTests.active, true))
              .orderBy(sql`${labTests.sortOrder} nulls last`, asc(labTests.code))
          : await tx
              .select({ id: procedures.id, code: procedures.code, name: procedures.name })
              .from(procedures)
              .where(and(eq(procedures.active, true), eq(procedures.kind, type)))
              .orderBy(sql`${procedures.sortOrder} nulls last`, asc(procedures.code));
      const prices = await this.#pricesOn(tx, type, rows.map((r) => r.id), ctx.locationId, date);
      return { type, date, items: rows.map((r) => ({ ...r, unitPriceCents: prices.get(r.id) ?? null })) };
    });
  }

  /** S-CLI-18: «Cargo estimado» y, en Laboratorio, cómo se repartirán las pruebas y el laboratorio sugerido (solo nombres). */
  async preview(actor: Principal, encounterId: string, raw: unknown): Promise<OrderPreview> {
    const ctx = requireContext(actor);
    const input = orderPreviewSchema.parse(raw);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#encounterSite(tx, ctx.locationId, encounterId);
      const date = this.#day(site.timezone);
      const lines = await this.#catalogLines(tx, input.type, input.lines, ctx.locationId, date);
      const previewLines: OrderPreviewLine[] = lines.map((l) => ({ ...l, amountCents: l.unitPriceCents === null ? null : l.unitPriceCents * l.quantity }));
      if (input.type !== 'lab') return { type: input.type, lines: previewLines, totalCents: linesTotalCents(previewLines), lab: null };
      const { groups, coverage, names } = await this.#labGroups(tx, encounterId, lines.map((l) => l.itemId), date);
      return {
        type: input.type,
        lines: previewLines,
        totalCents: linesTotalCents(previewLines),
        lab: {
          coverage,
          groups: groups.map((g) => ({
            labTestIds: g.labTestIds,
            suggested: g.suggestedId ? labName(names, g.suggestedId) : null,
            options: g.optionIds.map((id) => labName(names, id)),
          })),
        },
      };
    });
  }

  /** S-CLI-17: las órdenes de la visita, las más recientes primero. Notas y motivos solo para quien crea o ejecuta órdenes. Lectura auditada. */
  async list(actor: Principal, encounterId: string, meta: RequestMeta): Promise<EncounterOrders> {
    const ctx = requireContext(actor);
    const clinical = actor.permissions.has('orders.execute') || actor.permissions.has('orders.create');
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [encounter] = await tx
        .select({ id: encounters.id, status: encounters.status, route: encounters.route, provider: encounters.providerMembershipId })
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, ctx.locationId)));
      if (!encounter) throw new HttpError(404, 'encounter_not_found');
      const rows = await tx.select().from(orders).where(eq(orders.encounterId, encounterId)).orderBy(desc(orders.orderedAt), desc(orders.code));
      const ids = rows.map((r) => r.id);
      const items = ids.length > 0 ? await tx.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.createdAt), asc(orderItems.id)) : [];
      const charged =
        ids.length > 0
          ? await tx
              .select({ orderId: charges.orderId, amountCents: charges.amountCents, discountCents: charges.membershipDiscountCents, status: charges.status })
              .from(charges)
              .where(inArray(charges.orderId, ids))
          : [];
      const labIds = [...new Set(rows.map((r) => r.labProviderId).filter((id): id is string => id !== null))];
      const labs = labIds.length > 0 ? await tx.select({ id: labProviders.id, name: labProviders.name }).from(labProviders).where(inArray(labProviders.id, labIds)) : [];
      const memberIds = [...new Set(rows.flatMap((r) => [r.orderedByMembershipId, r.assignedToMembershipId]).filter((id): id is string => id !== null))];
      const members = memberIds.length > 0 ? await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, memberIds)) : [];
      const me = await myMembership(tx, actor.userId);
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'encounter.orders_view',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'encounter',
        entityId: encounterId,
        ...meta,
      });
      return { encounter, rows, items, charged, labs, members, me };
    });
    const { encounter, rows, items, charged, labs, members, me } = data;
    const names = await this.#names(members.map((m) => m.userId));
    const person = (membershipId: string | null) => {
      if (membershipId === null) return null;
      if (membershipId === me) return { kind: 'me' as const, name: null };
      const member = members.find((m) => m.id === membershipId);
      return { kind: 'user' as const, name: member ? (names.get(member.userId) ?? null) : null };
    };
    const visitStatus = encounter.status as VisitStatus;
    const result: OrderView[] = [];
    for (const r of rows) {
      const status = r.status as OrderStatus;
      const own = charged.filter((c) => c.orderId === r.id);
      // Estimado: los cargos vigentes; en una orden cancelada, los anulados.
      const counted = status === 'CANCELLED' ? own : own.filter((c) => c.status === 'active');
      const lab = r.labProviderId ? (labs.find((l) => l.id === r.labProviderId) ?? null) : null;
      result.push({
        id: r.id,
        code: r.code,
        type: r.type as OrderType,
        status,
        version: r.version,
        items: items.filter((i) => i.orderId === r.id).map((i) => ({ code: i.itemCode, name: i.itemName, quantity: i.quantity })),
        estimateCents: counted.reduce((sum, c) => sum + c.amountCents, 0),
        membershipDiscountCents: own.filter((c) => c.status === 'active').reduce((sum, c) => sum + c.discountCents, 0),
        orderedAt: r.orderedAt.toISOString(),
        orderedBy: person(r.orderedByMembershipId) ?? { kind: 'user', name: null },
        assignedTo: assigned(person, r.assignedToMembershipId),
        lab: lab ? { id: lab.id, name: lab.name } : null,
        notes: clinical && r.notesEnc ? await this.#cipher.decrypt(r.notesEnc, notesContext(ctx.organizationId, r.id)) : null,
        cancelReason: clinical && r.cancelReasonEnc ? await this.#cipher.decrypt(r.cancelReasonEnc, cancelContext(ctx.organizationId, r.id)) : null,
        abilities: {
          ...orderActions({
            type: r.type as OrderType,
            status,
            visitStatus,
            canExecute: actor.permissions.has('orders.execute'),
            assigned: assignedState(r.assignedToMembershipId, me),
            labAssigned: r.labProviderId !== null,
          }),
          cancel: canCancelOrder({
            status,
            visitStatus,
            isProvider: actor.permissions.has('orders.cancel'),
            orderedByMe: r.orderedByMembershipId === me,
            visitProviderIsMe: encounter.provider !== null && encounter.provider === me,
          }),
          changeLab: canChangeOrderLab({ type: r.type as OrderType, status, visitStatus, canExecute: actor.permissions.has('orders.execute') }),
        },
      });
    }
    return {
      orders: result,
      canCreate: actor.permissions.has('orders.create'),
      orderable: isOpenVisitStatus(visitStatus) && canOrderIn(visitStatus, encounter.route as VisitRoute),
    };
  }

  /** Opciones de «Cambiar laboratorio…»: los activos que hacen todas las pruebas de la orden hoy en la sede (solo nombres). */
  async labOptions(actor: Principal, orderId: string): Promise<OrderLabOptions> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const order = await this.#order(tx, ctx.locationId, orderId);
      if (order.type !== 'lab') throw new HttpError(409, 'not_lab_order');
      const site = await this.#encounterSite(tx, ctx.locationId, order.encounterId);
      const { optionIds, names } = await this.#labOptionsFor(tx, order.id, this.#day(site.timezone));
      return { current: order.labProviderId ? labName(names, order.labProviderId) : null, options: optionIds.map((id) => labName(names, id)) };
    });
  }

  /**
   * S-CLI-03 Cola de órdenes de la sede activa, por pestaña y «Asignadas a
   * mí». Pendientes y En curso, las más antiguas primero; «Completadas hoy»
   * (día de la sede, reloj inyectable) y Canceladas, las más recientes. Solo
   * códigos, servicio, cantidad y personal: nunca nombres de pacientes, notas
   * ni costos. Lectura auditada con el número de filas.
   */
  async queue(actor: Principal, tab: OrderQueueTab, mine: boolean, meta: RequestMeta): Promise<OrderQueue> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const today = this.#day(site.timezone, now);
      const me = await myMembership(tx, actor.userId);
      const dayStart = sql`(${today}::date::timestamp at time zone ${site.timezone})`;
      const dayEnd = sql`((${today}::date + 1)::timestamp at time zone ${site.timezone})`;
      const tabWhere: Record<OrderQueueTab, SQL> = {
        pending: sql`${orders.status} = 'PENDING'`,
        in_progress: sql`${orders.status} = 'IN_PROGRESS'`,
        completed_today: sql`${orders.status} = 'COMPLETED' and ${orders.completedAt} >= ${dayStart} and ${orders.completedAt} < ${dayEnd}`,
        cancelled: sql`${orders.status} = 'CANCELLED'`,
      };
      const scope = and(eq(orders.locationId, ctx.locationId), mine ? eq(orders.assignedToMembershipId, me) : undefined);
      const counts = {} as Record<OrderQueueTab, number>;
      for (const t of ORDER_QUEUE_TABS) {
        const [row] = await tx.select({ n: count() }).from(orders).where(and(scope, tabWhere[t]));
        counts[t] = row?.n ?? 0;
      }
      const sort =
        tab === 'completed_today'
          ? [desc(orders.completedAt), desc(orders.code)]
          : tab === 'cancelled'
            ? [desc(orders.cancelledAt), desc(orders.code)]
            : [asc(orders.orderedAt), asc(orders.code)];
      const rows = await tx
        .select({
          order: orders,
          encounterCode: encounters.code,
          encounterStatus: encounters.status,
          encounterProvider: encounters.providerMembershipId,
          patientCode: patients.code,
        })
        .from(orders)
        .innerJoin(encounters, eq(encounters.id, orders.encounterId))
        .innerJoin(patients, eq(patients.id, encounters.patientId))
        .where(and(scope, tabWhere[tab]))
        .orderBy(...sort)
        .limit(ORDER_QUEUE_LIMIT);
      const ids = rows.map((r) => r.order.id);
      const items = ids.length > 0 ? await tx.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.createdAt), asc(orderItems.id)) : [];
      const labIds = [...new Set(rows.map((r) => r.order.labProviderId).filter((id): id is string => id !== null))];
      const labs = labIds.length > 0 ? await tx.select({ id: labProviders.id, name: labProviders.name }).from(labProviders).where(inArray(labProviders.id, labIds)) : [];
      const memberIds = [...new Set(rows.flatMap((r) => [r.order.orderedByMembershipId, r.order.assignedToMembershipId]).filter((id): id is string => id !== null))];
      const members = memberIds.length > 0 ? await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, memberIds)) : [];
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'order.queue_view',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'order',
        ...meta,
        metadata: { tab, mine, results: rows.length },
      });
      return { site, today, me, counts, rows, items, labs, members };
    });
    const names = await this.#names(data.members.map((m) => m.userId));
    const person = (membershipId: string | null) => {
      if (membershipId === null) return null;
      if (membershipId === data.me) return { kind: 'me' as const, name: null };
      const member = data.members.find((m) => m.id === membershipId);
      return { kind: 'user' as const, name: member ? (names.get(member.userId) ?? null) : null };
    };
    const canExecute = actor.permissions.has('orders.execute');
    const rows = data.rows.map(({ order: r, encounterCode, encounterStatus, encounterProvider, patientCode }): OrderQueueRow => {
      const status = r.status as OrderStatus;
      const type = r.type as OrderType;
      const visitStatus = encounterStatus as VisitStatus;
      const lab = r.labProviderId ? (data.labs.find((l) => l.id === r.labProviderId) ?? null) : null;
      return {
        id: r.id,
        code: r.code,
        type,
        status,
        version: r.version,
        items: data.items.filter((i) => i.orderId === r.id).map((i) => ({ code: i.itemCode, name: i.itemName, quantity: i.quantity })),
        patientCode,
        encounter: { id: r.encounterId, code: encounterCode, status: visitStatus },
        orderedAt: r.orderedAt.toISOString(),
        orderedBy: person(r.orderedByMembershipId) ?? { kind: 'user', name: null },
        assignedTo: assigned(person, r.assignedToMembershipId),
        lab: lab ? { id: lab.id, name: lab.name } : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
        abilities: {
          ...orderActions({ type, status, visitStatus, canExecute, assigned: assignedState(r.assignedToMembershipId, data.me), labAssigned: r.labProviderId !== null }),
          cancel: canCancelOrder({
            status,
            visitStatus,
            isProvider: actor.permissions.has('orders.cancel'),
            orderedByMe: r.orderedByMembershipId === data.me,
            visitProviderIsMe: encounterProvider !== null && encounterProvider === data.me,
          }),
          changeLab: canChangeOrderLab({ type, status, visitStatus, canExecute }),
        },
      };
    });
    return { tab, mine, today: data.today, timeZone: data.site.timezone, counts: data.counts, rows };
  }

  /** S-CLI-22: personal activo con rol Enfermería o Proveedor en la sede activa, por nombre (decisión del 2026-11-02). */
  async assignees(actor: Principal): Promise<OrderAssignee[]> {
    const ctx = requireContext(actor);
    const { rows, me } = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => ({
      rows: await this.#eligible(tx, ctx.locationId),
      me: await myMembership(tx, actor.userId),
    }));
    const names = await this.#names(rows.map((r) => r.userId));
    const byMember = new Map<string, OrderAssignee>();
    for (const r of rows) {
      const found = byMember.get(r.id) ?? { membershipId: r.id, name: names.get(r.userId) ?? '', me: r.id === me, roles: [] };
      found.roles.push(r.role as 'enfermeria' | 'proveedor');
      byMember.set(r.id, found);
    }
    return [...byMember.values()].map((a) => ({ ...a, roles: a.roles.sort() })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // --- Escrituras --------------------------------------------------------------

  /** «Crear orden» (S-CLI-18): orden(es), líneas y cargos en una transacción, con Idempotency-Key. */
  async create(actor: Principal, encounterId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<OrdersCreated> {
    const ctx = requireContext(actor);
    const input = createOrderSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/encounters/${encounterId}/orders`, body: raw },
      async (tx) => {
        const now = this.#clock.now();
        const current = await lockEncounter(tx, ctx.locationId, encounterId);
        if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
        if (!canOrderIn(current.status, current.route)) throw new HttpError(409, 'encounter_not_orderable');
        const me = await myMembership(tx, actor.userId);
        const site = await this.#site(tx, ctx.locationId);
        const date = this.#day(site.timezone, now);
        const lines = await this.#catalogLines(tx, input.type, input.lines, ctx.locationId, date);
        if (lines.some((l) => l.unitPriceCents === null)) throw new HttpError(409, 'price_unavailable');
        // El importe de cada cargo cabe en la columna (entero de 32 bits).
        if (lines.some((l) => (l.unitPriceCents ?? 0) * l.quantity > MAX_CHARGE_CENTS)) throw new HttpError(409, 'amount_too_large');

        // Un grupo por orden: Procedimiento e Inyección, el único ítem; Laboratorio, el reparto.
        let groups: { itemIds: string[]; labProviderId: string | null; suggestedId: string | null; changed: boolean }[];
        if (input.type !== 'lab') {
          groups = [{ itemIds: lines.map((l) => l.itemId), labProviderId: null, suggestedId: null, changed: false }];
        } else {
          const computed = (await this.#labGroups(tx, encounterId, lines.map((l) => l.itemId), date)).groups;
          groups = chooseLabs(computed, input.labGroups);
          if (groups.some((g) => g.changed) && !input.labChangeReason) throw new HttpError(400, 'lab_change_reason_required');
        }

        const created: string[] = [];
        for (const group of groups) {
          const orderId = uuidv7();
          const code = await nextOrderCode(tx, ctx.organizationId, site);
          const notes = input.notes?.trim() ? input.notes.trim() : null;
          await tx.insert(orders).values({
            id: orderId,
            organizationId: ctx.organizationId,
            locationId: ctx.locationId,
            encounterId,
            code,
            type: input.type,
            status: 'PENDING',
            orderedByMembershipId: me,
            orderedAt: now,
            labProviderId: group.labProviderId,
            suggestedLabProviderId: group.suggestedId,
            notesEnc: notes ? await this.#cipher.encrypt(notes, notesContext(ctx.organizationId, orderId)) : null,
            createdAt: now,
            updatedAt: now,
          });
          for (const line of lines.filter((l) => group.itemIds.includes(l.itemId))) {
            const itemId = uuidv7();
            await tx.insert(orderItems).values({
              id: itemId,
              organizationId: ctx.organizationId,
              orderId,
              procedureId: input.type === 'lab' ? null : line.itemId,
              labTestId: input.type === 'lab' ? line.itemId : null,
              quantity: line.quantity,
              itemCode: line.code,
              itemName: line.name,
              createdAt: now,
            });
            const unitPriceCents = line.unitPriceCents ?? 0;
            const amountCents = unitPriceCents * line.quantity;
            const chargeId = uuidv7();
            await tx.insert(charges).values({
              id: chargeId,
              organizationId: ctx.organizationId,
              locationId: ctx.locationId,
              encounterId,
              source: 'order',
              orderId,
              orderItemId: itemId,
              unitPriceCents,
              quantity: line.quantity,
              amountCents,
              priceDate: date,
              createdByMembershipId: me,
              createdAt: now,
            });
            await this.#audit.inTx(tx, ctx.organizationId, {
              action: 'charge.created',
              ...auditBase(actor, ctx.locationId, 'charge', chargeId, meta),
              metadata: { orderCode: code, encounterCode: current.code, source: 'order', previousCents: 'none', amountCents, unitPriceCents, quantity: line.quantity, priceDate: date },
            });
          }
          await this.#audit.inTx(tx, ctx.organizationId, {
            action: 'order.created',
            ...auditBase(actor, ctx.locationId, 'order', orderId, meta),
            ...(group.changed && input.labChangeReason ? { reason: input.labChangeReason } : {}),
            metadata: {
              code,
              encounterCode: current.code,
              type: input.type,
              items: group.itemIds.length,
              // Del texto clínico, solo el nombre del campo (ADR 0018).
              fields: notes ? 'notes' : '',
              ...(input.type === 'lab' ? { labAssigned: group.labProviderId !== null, labChanged: group.changed } : {}),
            },
          });
          await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: ctx.locationId, name: 'order.created', ids: { order: orderId, encounter: encounterId }, status: 'PENDING' });
          created.push(orderId);
        }
        await this.#applyBenefits(tx, actor, current, now, meta);
        await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: ctx.locationId, name: 'billing.changed', ids: { encounter: encounterId } });
        return { status: 201, resourceIds: created };
      },
      (ids) => this.#created(actor, ids),
    );
    return result.body;
  }

  /** S-CLI-21 «Cancelar orden», con motivo e Idempotency-Key: anula sus cargos y puede pasar la visita a «Listo para caja». */
  async cancel(actor: Principal, orderId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<OrderSaved> {
    const ctx = requireContext(actor);
    const input = cancelOrderSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/orders/${orderId}/cancel`, body: raw },
      async (tx) => {
        const now = this.#clock.now();
        const { current, order, me } = await this.#lockOrder(tx, actor, orderId);
        if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
        // El estado antes que la versión: si otra persona ya la cerró, ese es el motivo útil.
        if (!isOpenOrderStatus(order.status as OrderStatus)) throw new HttpError(409, 'order_closed');
        if (order.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
        if (order.orderedByMembershipId !== me && current.providerMembershipId !== me) throw new HttpError(403, 'order_not_owned');

        await tx
          .update(orders)
          .set({
            status: 'CANCELLED',
            cancelReasonEnc: await this.#cipher.encrypt(input.reason, cancelContext(ctx.organizationId, order.id)),
            cancelledByMembershipId: me,
            cancelledAt: now,
            version: order.version + 1,
            updatedAt: now,
          })
          .where(eq(orders.id, order.id));
        const active = await tx.select().from(charges).where(and(eq(charges.orderId, order.id), eq(charges.status, 'active'))).for('update');
        for (const charge of active) {
          await tx
            .update(charges)
            .set({
              status: 'voided',
              voidReasonEnc: await this.#cipher.encrypt(input.reason, voidContext(ctx.organizationId, charge.id)),
              voidedByMembershipId: me,
              voidedAt: now,
              version: charge.version + 1,
            })
            .where(eq(charges.id, charge.id));
          await this.#audit.inTx(tx, ctx.organizationId, {
            action: 'charge.voided',
            ...auditBase(actor, ctx.locationId, 'charge', charge.id, meta),
            reason: input.reason,
            metadata: {
              orderCode: order.code,
              encounterCode: current.code,
              amountCents: charge.amountCents,
              from: 'active',
              to: 'voided',
            },
          });
        }
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'order.cancelled',
          ...auditBase(actor, ctx.locationId, 'order', order.id, meta),
          reason: input.reason,
          metadata: { code: order.code, encounterCode: current.code, from: order.status, to: 'CANCELLED', chargesVoided: active.length },
        });
        // Cancelar libera el incluido: los beneficios de la visita se recalculan.
        await this.#applyBenefits(tx, actor, current, now, meta);
        await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: ctx.locationId, name: 'order.changed', ids: { order: order.id, encounter: current.id }, status: 'CANCELLED' });
        await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: ctx.locationId, name: 'billing.changed', ids: { encounter: current.id } });
        await this.#afterResolved(tx, actor, current, me, now, meta);
        return { status: 200, resourceIds: [order.id] };
      },
      (ids) => this.#saved(actor, ids[0] ?? ''),
    );
    return result.body;
  }

  /** «Cambiar laboratorio…» (ADR 0028): Enfermería y Proveedor, con motivo y la versión leída. Auditado. */
  async changeLab(actor: Principal, orderId: string, raw: unknown, meta: RequestMeta): Promise<OrderSaved> {
    const ctx = requireContext(actor);
    const input = changeOrderLabSchema.parse(raw);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const now = this.#clock.now();
      const { current, order } = await this.#lockOrder(tx, actor, orderId);
      if (order.type !== 'lab') throw new HttpError(409, 'not_lab_order');
      if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
      if (!isOpenOrderStatus(order.status as OrderStatus)) throw new HttpError(409, 'order_closed');
      if (order.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
      if (order.labProviderId === input.labProviderId) throw new HttpError(409, 'lab_unchanged');
      const site = await this.#site(tx, ctx.locationId);
      const { optionIds } = await this.#labOptionsFor(tx, order.id, this.#day(site.timezone, now));
      if (!optionIds.includes(input.labProviderId)) throw new HttpError(409, 'invalid_lab');
      await tx.update(orders).set({ labProviderId: input.labProviderId, version: order.version + 1, updatedAt: now }).where(eq(orders.id, order.id));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'order.lab_changed',
        ...auditBase(actor, ctx.locationId, 'order', order.id, meta),
        reason: input.reason,
        metadata: { code: order.code, encounterCode: current.code, previousLabProviderId: order.labProviderId ?? 'none', labProviderId: input.labProviderId },
      });
      await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: ctx.locationId, name: 'order.changed', ids: { order: order.id, encounter: current.id }, status: order.status });
    });
    return this.#saved(actor, orderId);
  }

  /** S-CLI-19 «Iniciar»: Pendiente, sin asignar o asignada a quien llama (ADR 0033: nadie pasa por encima de la asignación). */
  async start(actor: Principal, orderId: string, raw: unknown, meta: RequestMeta): Promise<OrderSaved> {
    const ctx = requireContext(actor);
    const input = startOrderSchema.parse(raw);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const now = this.#clock.now();
      const { current, order, me } = await this.#lockOrder(tx, actor, orderId);
      requireExecutable(current, order, 'IN_PROGRESS', input.expectedVersion);
      if (order.assignedToMembershipId !== null && order.assignedToMembershipId !== me) throw new HttpError(403, 'order_assigned_to_other');
      await tx
        .update(orders)
        .set({ status: 'IN_PROGRESS', startedByMembershipId: me, startedAt: now, version: order.version + 1, updatedAt: now })
        .where(eq(orders.id, order.id));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'order.started',
        ...auditBase(actor, ctx.locationId, 'order', order.id, meta),
        metadata: { code: order.code, encounterCode: current.code, from: order.status, to: 'IN_PROGRESS' },
      });
      await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: ctx.locationId, name: 'order.changed', ids: { order: order.id, encounter: current.id }, status: 'IN_PROGRESS' });
    });
    return this.#saved(actor, orderId);
  }

  /**
   * S-CLI-20 «Completar orden»: En curso; la nota se añade a las notas
   * cifradas. Laboratorio sin laboratorio: 409 `lab_not_assigned` (ADR 0028).
   * Si era la última orden abierta en «Procedimiento pendiente», la visita
   * pasa a «Listo para caja» en la misma transacción.
   */
  async complete(actor: Principal, orderId: string, raw: unknown, meta: RequestMeta): Promise<OrderSaved> {
    const ctx = requireContext(actor);
    const input = completeOrderSchema.parse(raw);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const now = this.#clock.now();
      const { current, order, me } = await this.#lockOrder(tx, actor, orderId);
      requireExecutable(current, order, 'COMPLETED', input.expectedVersion);
      if (order.type === 'lab' && order.labProviderId === null) throw new HttpError(409, 'lab_not_assigned');
      const context = notesContext(ctx.organizationId, order.id);
      const existing = order.notesEnc ? await this.#cipher.decrypt(order.notesEnc, context) : null;
      const notes = appendCompletionNote(existing, input.notes);
      if (!notes) throw new HttpError(400, 'notes_too_long');
      await tx
        .update(orders)
        .set({
          status: 'COMPLETED',
          completedByMembershipId: me,
          completedAt: now,
          ...(notes.changed && notes.notes ? { notesEnc: await this.#cipher.encrypt(notes.notes, context) } : {}),
          version: order.version + 1,
          updatedAt: now,
        })
        .where(eq(orders.id, order.id));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'order.completed',
        ...auditBase(actor, ctx.locationId, 'order', order.id, meta),
        // De la nota clínica, solo el nombre del campo (ADR 0018).
        metadata: { code: order.code, encounterCode: current.code, from: order.status, to: 'COMPLETED', fields: notes.changed ? 'notes' : '' },
      });
      await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: ctx.locationId, name: 'order.changed', ids: { order: order.id, encounter: current.id }, status: 'COMPLETED' });
      await this.#afterResolved(tx, actor, current, me, now, meta);
    });
    return this.#saved(actor, orderId);
  }

  /**
   * S-CLI-22 «Asignar orden»: a una persona activa con rol Enfermería o
   * Proveedor en la sede, o a nadie. Volver a elegir la misma no escribe nada.
   * El aviso «Orden asignada a usted» va por el outbox con el código de la
   * orden; nadie se avisa a sí mismo.
   */
  async assign(actor: Principal, orderId: string, raw: unknown, meta: RequestMeta): Promise<OrderSaved> {
    const ctx = requireContext(actor);
    const input = assignOrderSchema.parse(raw);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const now = this.#clock.now();
      const { current, order, me } = await this.#lockOrder(tx, actor, orderId);
      if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
      if (!isOpenOrderStatus(order.status as OrderStatus)) throw new HttpError(409, 'order_closed');
      if (order.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
      if (order.assignedToMembershipId === input.membershipId) return;
      let assignee: { id: string; userId: string } | null = null;
      if (input.membershipId !== null) {
        const found = (await this.#eligible(tx, ctx.locationId)).find((r) => r.id === input.membershipId);
        if (!found) throw new HttpError(400, 'assignee_not_eligible');
        assignee = found;
      }
      await tx
        .update(orders)
        .set({ assignedToMembershipId: input.membershipId, version: order.version + 1, updatedAt: now })
        .where(eq(orders.id, order.id));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'order.assigned',
        ...auditBase(actor, ctx.locationId, 'order', order.id, meta),
        metadata: {
          code: order.code,
          encounterCode: current.code,
          previousAssignee: order.assignedToMembershipId ?? 'none',
          assignee: input.membershipId ?? 'none',
          self: input.membershipId === me,
        },
      });
      if (assignee && assignee.userId !== actor.userId) {
        await enqueueNotification(tx, this.#outboxKey, {
          organizationId: ctx.organizationId,
          userId: assignee.userId,
          kind: 'order.assigned',
          locationId: ctx.locationId,
          entityType: 'order',
          entityId: order.id,
          code: order.code,
        });
      }
      await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: ctx.locationId, name: 'order.changed', ids: { order: order.id, encounter: current.id }, status: order.status });
    });
    return this.#saved(actor, orderId);
  }

  // --- Ayudas ------------------------------------------------------------------

  /** Recalcula los beneficios de membresía de la visita (T-026b) y audita cada cargo que cambia. */
  async #applyBenefits(tx: Tx, actor: Principal, current: LockedEncounter, now: Date, meta: RequestMeta): Promise<void> {
    for (const change of await recalculateVisitBenefits(tx, current.id, now)) {
      await this.#audit.inTx(tx, current.organizationId, {
        action: 'charge.membership_benefits',
        ...auditBase(actor, current.locationId, 'charge', change.chargeId, meta),
        metadata: { encounterCode: current.code, previousDiscountCents: change.previousDiscountCents, discountCents: change.discountCents, includedQuantity: change.includedQuantity },
      });
    }
  }

  /**
   * Tras resolver una orden (cancelarla o completarla): si la
   * visita está en «Procedimiento pendiente» y ya no quedan órdenes abiertas,
   * pasa sola a «Listo para caja» por la máquina de estados.
   */
  async #afterResolved(tx: Tx, actor: Principal, current: LockedEncounter, me: string, now: Date, meta: RequestMeta): Promise<void> {
    const step = autoReadyForCheckout(current.status, current.route, await hasOpenOrders(tx, current.id));
    if (!step?.ok) return;
    await this.#encounters.move(tx, actor, current, me, now, meta, {
      action: 'ready_for_checkout',
      to: step.to,
      forced: false,
      reason: null,
      audit: 'encounter.transitioned',
      system: true,
    });
  }

  /** Personal que puede ejecutar órdenes en la sede: activo, con rol Enfermería o Proveedor ahí. Una fila por rol. */
  async #eligible(tx: Tx, locationId: string) {
    return tx
      .select({ id: memberships.id, userId: memberships.userId, role: membershipRoles.role })
      .from(memberships)
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .where(and(eq(memberships.status, 'active'), eq(membershipRoles.locationId, locationId), inArray(membershipRoles.role, ['enfermeria', 'proveedor'])));
  }

  /** La orden de la sede activa y su visita, bloqueadas (primero la visita, como en el resto de cambios). */
  async #lockOrder(tx: Tx, actor: Principal, orderId: string) {
    const ctx = requireContext(actor);
    const [found] = await tx.select({ encounterId: orders.encounterId }).from(orders).where(and(eq(orders.id, orderId), eq(orders.locationId, ctx.locationId)));
    if (!found) throw new HttpError(404, 'order_not_found');
    const current = await lockEncounter(tx, ctx.locationId, found.encounterId);
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new HttpError(404, 'order_not_found');
    const me = await myMembership(tx, actor.userId);
    return { current, order, me };
  }

  async #order(tx: Tx, locationId: string, orderId: string) {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.locationId, locationId)));
    if (!order) throw new HttpError(404, 'order_not_found');
    return order;
  }

  /** Respuesta de «Crear orden» (y de cada repetición): solo ids, códigos, estado y versión. */
  async #created(actor: Principal, ids: string[]): Promise<OrdersCreated> {
    const ctx = requireContext(actor);
    if (ids.length === 0) return { orders: [] };
    const rows = await this.#tenantDb.withTenant(ctx.organizationId, (tx) =>
      tx
        .select({ id: orders.id, code: orders.code, status: orders.status, version: orders.version })
        .from(orders)
        .where(and(inArray(orders.id, ids), eq(orders.locationId, ctx.locationId)))
        .orderBy(asc(orders.code)),
    );
    return { orders: rows.map((r) => ({ ...r, status: r.status as OrderStatus })) };
  }

  async #saved(actor: Principal, orderId: string): Promise<OrderSaved> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx
        .select({ id: orders.id, status: orders.status, version: orders.version, encounterId: orders.encounterId })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.locationId, ctx.locationId)));
      if (!row) throw new HttpError(404, 'order_not_found');
      const [visit] = await tx.select({ status: encounters.status, version: encounters.version }).from(encounters).where(eq(encounters.id, row.encounterId));
      if (!visit) throw new HttpError(404, 'encounter_not_found');
      return {
        order: { id: row.id, status: row.status as OrderStatus, version: row.version },
        encounter: { id: row.encounterId, status: visit.status as VisitStatus, version: visit.version },
      };
    });
  }

  /** Las líneas pedidas con su código, nombre y precio vigente. Ítems de otro tipo o inexistentes: 400; inactivos: 409. */
  async #catalogLines(tx: Tx, type: OrderType, lines: OrderLineInput[], locationId: string, date: string): Promise<CatalogLine[]> {
    const ids = lines.map((l) => l.itemId);
    const rows =
      type === 'lab'
        ? await tx.select({ id: labTests.id, code: labTests.code, name: labTests.name, active: labTests.active }).from(labTests).where(inArray(labTests.id, ids))
        : await tx
            .select({ id: procedures.id, code: procedures.code, name: procedures.name, active: procedures.active })
            .from(procedures)
            .where(and(inArray(procedures.id, ids), eq(procedures.kind, type)));
    const prices = await this.#pricesOn(tx, type, ids, locationId, date);
    return lines.map((line) => {
      const row = rows.find((r) => r.id === line.itemId);
      if (!row) throw new HttpError(400, 'item_not_found');
      if (!row.active) throw new HttpError(409, 'item_inactive');
      return { itemId: row.id, code: row.code, name: row.name, quantity: line.quantity, unitPriceCents: prices.get(row.id) ?? null };
    });
  }

  /**
   * Precio vigente en la sede un día (ADR 0029), por ítem: la última fila de la
   * sede vigente ese día si tiene importe; si no (o es «Usa el precio
   * general»), la última general vigente. Nulo si no hay ninguno.
   */
  async #pricesOn(tx: Tx, type: OrderType, itemIds: string[], locationId: string, date: string): Promise<Map<string, number | null>> {
    if (itemIds.length === 0) return new Map();
    const column = sql.raw(type === 'lab' ? '"lab_test_id"' : '"procedure_id"');
    const latest = (scope: ReturnType<typeof sql>) => sql`(
      select p.amount_cents from app.prices p
       where ${scope} and p.${column} = i.id and p.effective_from <= ${date}::date
       order by p.effective_from desc, p.created_at desc, p.id desc limit 1)`;
    const { rows } = await tx.execute<{ item_id: string; own: number | null; general: number | null }>(sql`
      select i.id as item_id,
             ${latest(sql`p.location_id = ${locationId}`)} as own,
             ${latest(sql`p.location_id is null`)} as general
        from unnest(array[${sql.join(
          itemIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::uuid[]) as i(id)`);
    return new Map(rows.map((r) => [r.item_id, r.own ?? r.general]));
  }

  /** Reparto de las pruebas con los laboratorios, los costos y la cobertura de la visita (ADR 0028). Los costos no salen de aquí. */
  async #labGroups(tx: Tx, encounterId: string, labTestIds: string[], date: string) {
    const [coverage] = await tx.select({ type: coverages.type }).from(coverages).where(eq(coverages.encounterId, encounterId));
    const type: LabCoverageType = (coverage?.type as LabCoverageType | undefined) ?? 'self_pay';
    const { labs, costs } = await this.#labData(tx, labTestIds);
    const groups: LabGroup[] = labOrderGroups({ labTestIds, labs, costs, date, coverage: type });
    return { groups, coverage: type, names: new Map(labs.map((l) => [l.id, l.name])) };
  }

  async #labOptionsFor(tx: Tx, orderId: string, date: string) {
    const items = await tx.select({ labTestId: orderItems.labTestId }).from(orderItems).where(eq(orderItems.orderId, orderId));
    const testIds = items.map((i) => i.labTestId).filter((id): id is string => id !== null);
    const { labs, costs } = await this.#labData(tx, testIds);
    return { optionIds: labsForAll({ labs, costs, date }, testIds), names: new Map(labs.map((l) => [l.id, l.name])) };
  }

  async #labData(tx: Tx, labTestIds: string[]): Promise<{ labs: { id: string; name: string; preference: number; active: boolean }[]; costs: LabCostRecord[] }> {
    const labs = (await tx.select({ id: labProviders.id, name: labProviders.name, preference: labProviders.preference, active: labProviders.active }).from(labProviders)).sort(
      compareLabProviders,
    );
    const costs =
      labTestIds.length === 0
        ? []
        : (
            await tx
              .select({
                labTestId: labTestCosts.labTestId,
                labProviderId: labTestCosts.labProviderId,
                amountCents: labTestCosts.amountCents,
                effectiveFrom: labTestCosts.effectiveFrom,
              })
              .from(labTestCosts)
              .where(inArray(labTestCosts.labTestId, labTestIds))
              .orderBy(asc(labTestCosts.createdAt), asc(labTestCosts.id))
          );
    return { labs, costs };
  }

  /** La sede de una visita de la sede activa (404 si es de otra). */
  async #encounterSite(tx: Tx, locationId: string, encounterId: string): Promise<{ timezone: string }> {
    const [row] = await tx
      .select({ timezone: locations.timezone })
      .from(encounters)
      .innerJoin(locations, eq(locations.id, encounters.locationId))
      .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, locationId)));
    if (!row) throw new HttpError(404, 'encounter_not_found');
    return row;
  }

  async #site(tx: Tx, locationId: string): Promise<{ id: string; code: string; timezone: string }> {
    const [row] = await tx.select({ id: locations.id, code: locations.code, timezone: locations.timezone }).from(locations).where(eq(locations.id, locationId));
    if (!row) throw new HttpError(403, 'no_active_context');
    return row;
  }

  /** AAAA-MM-DD en la zona de la sede, con el reloj inyectable. */
  #day(timeZone: string, instant: Date = this.#clock.now()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  }

  /** Nombres del personal (cuentas globales, fuera de RLS; solo las ya filtradas por organización). */
  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

/**
 * Los grupos que se crearán, con el laboratorio elegido. Sin elección, los
 * sugeridos. Con elección, deben ser exactamente los grupos que calcula el
 * servidor (si no, 409 `lab_groups_changed`: los costos cambiaron entre la
 * vista previa y la creación) y cada laboratorio, uno de sus opciones (409
 * `invalid_lab`). Elegir otro distinto del sugerido es un cambio (motivo).
 */
export function chooseLabs(
  computed: LabGroup[],
  choices: { labTestIds: string[]; labProviderId: string | null }[] | undefined,
): { itemIds: string[]; labProviderId: string | null; suggestedId: string | null; changed: boolean }[] {
  if (!choices) return computed.map((g) => ({ itemIds: g.labTestIds, labProviderId: g.suggestedId, suggestedId: g.suggestedId, changed: false }));
  const key = (ids: readonly string[]) => [...ids].sort().join(',');
  if (choices.length !== computed.length) throw new HttpError(409, 'lab_groups_changed');
  return computed.map((g) => {
    const choice = choices.find((c) => key(c.labTestIds) === key(g.labTestIds));
    if (!choice) throw new HttpError(409, 'lab_groups_changed');
    if (choice.labProviderId !== null && !g.optionIds.includes(choice.labProviderId)) throw new HttpError(409, 'invalid_lab');
    return { itemIds: g.labTestIds, labProviderId: choice.labProviderId, suggestedId: g.suggestedId, changed: g.suggestedId !== null && choice.labProviderId !== g.suggestedId };
  });
}

/** Iniciar o completar: visita abierta, la transición de la orden (S-CLI-19) y la versión leída. */
function requireExecutable(current: LockedEncounter, order: { status: string; version: number }, to: OrderStatus, expectedVersion: number): void {
  if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
  // El estado antes que la versión: si otra persona ya la cerró, ese es el motivo útil.
  const from = order.status as OrderStatus;
  if (!isOpenOrderStatus(from)) throw new HttpError(409, 'order_closed');
  if (!canMoveOrder(from, to)) throw new HttpError(409, 'invalid_order_transition');
  if (order.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
}

/** La persona asignada con su membresía (S-CLI-22), o nula. */
function assigned(person: (id: string | null) => { kind: 'me' | 'user'; name: string | null } | null, membershipId: string | null) {
  const found = person(membershipId);
  return found && membershipId ? { ...found, membershipId } : null;
}

/** La persona asignada, vista por quien llama. */
function assignedState(assignedTo: string | null, me: string): 'none' | 'me' | 'other' {
  if (assignedTo === null) return 'none';
  return assignedTo === me ? 'me' : 'other';
}

function labName(names: Map<string, string>, id: string): LabName {
  return { id, name: names.get(id) ?? '' };
}

function auditBase(actor: Principal, locationId: string, entityType: 'order' | 'charge', entityId: string, meta: RequestMeta) {
  return { actorType: 'user' as const, actorId: actor.userId, locationId, entityType, entityId, ...meta };
}

async function myMembership(tx: Tx, userId: string): Promise<string> {
  const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
  if (!mine) throw new HttpError(403, 'forbidden');
  return mine.id;
}

/** Para el controlador: ¿es un tipo de orden válido? */
export function isOrderType(value: unknown): value is OrderType {
  return typeof value === 'string' && (ORDER_TYPES as readonly string[]).includes(value);
}
