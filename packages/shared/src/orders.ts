import { z } from 'zod';
import { compareLabProviders, labCostsOn, suggestLabs, type LabCostRecord, type LabCoverageType, type LabProvider } from './labs.ts';
import { expectedVersionSchema, reasonSchema } from './schemas.ts';
import { isDirectRoute, isOpenVisitStatus, type VisitRoute, type VisitStatus } from './visit.ts';

// Órdenes con su cargo y laboratorio sugerido (T-025; S-CLI-17, 18 y 21) y
// su ejecución y cola (T-026; S-CLI-03, 19, 20 y 22).
// Esquemas, estados, textos y reglas puras, los mismos en la web y en la API.
// Los valores son los que exige la base de datos (packages/db,
// orders-schema.ts); una prueba lo comprueba.
//  - Las crea solo el rol Proveedor en la sede (ADR 0033).
//  - Dinero en centavos, calculado en el servidor: la web solo da formato.
//  - Laboratorio (ADR 0028): las respuestas a Enfermería y al Proveedor
//    llevan solo el nombre del laboratorio, nunca costos.

export const ORDER_TYPES = ['procedure', 'injection', 'lab'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  procedure: 'Procedimiento',
  injection: 'Inyección',
  lab: 'Laboratorio',
};

/** Orden del selector segmentado de S-CLI-18. */
export const ORDER_TYPE_CHOICES: readonly OrderType[] = ['procedure', 'lab', 'injection'];

/** Estados de una orden (S-CLI-19): nacen «Pendiente»; se inician y completan (T-026) o se cancelan (T-025). */
export const ORDER_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

/** Pendiente o En curso: bloquea «Listo para pago» e «Iniciar pago» (S-CLI-08). */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ['PENDING', 'IN_PROGRESS'];

export function isOpenOrderStatus(status: OrderStatus): boolean {
  return OPEN_ORDER_STATUSES.includes(status);
}

/** Cantidad de cada línea (S-CLI-18). */
export const ORDER_QUANTITY_MIN = 1;
export const ORDER_QUANTITY_MAX = 1000;
/** Notas de la orden (S-CLI-18): nota clínica cifrada. */
export const ORDER_NOTES_MAX = 4000;
/** Pruebas de una orden de laboratorio a la vez. */
export const ORDER_LAB_TESTS_MAX = 50;

/**
 * Estados que aceptan órdenes (S-CLI-17): «Esperando proveedor», «Con
 * proveedor» y «Procedimiento pendiente»; en las rutas directas también
 * «Registrado». Fuera de ellos: `encounter_not_orderable`.
 */
export function canOrderIn(status: VisitStatus, route: VisitRoute): boolean {
  if (status === 'WAITING_FOR_PROVIDER' || status === 'WITH_PROVIDER' || status === 'PROCEDURE_PENDING') return true;
  return status === 'CHECKED_IN' && isDirectRoute(route);
}

export const NOT_ORDERABLE_TEXT =
  'Las órdenes se crean mientras el paciente espera al proveedor o está con él, o durante una consulta solo de procedimiento.';

// --- Entradas -----------------------------------------------------------------

const quantitySchema = z.number().int().min(ORDER_QUANTITY_MIN).max(ORDER_QUANTITY_MAX);
const notesSchema = z.string().max(ORDER_NOTES_MAX);

export const orderLineSchema = z.object({ itemId: z.uuid(), quantity: quantitySchema });
export type OrderLineInput = z.infer<typeof orderLineSchema>;

/**
 * Las líneas: en Procedimiento e Inyección, un solo ítem (una orden por vez,
 * S-CLI-18); en Laboratorio, una o varias pruebas distintas, que el servidor
 * reparte en una orden por laboratorio (ADR 0028).
 */
const linesSchema = z
  .array(orderLineSchema)
  .min(1)
  .max(ORDER_LAB_TESTS_MAX)
  .refine((lines) => new Set(lines.map((l) => l.itemId)).size === lines.length, { message: 'duplicated_item' });

/** «Cargo estimado» y laboratorio sugerido de S-CLI-18, antes de crear. */
export const orderPreviewSchema = z
  .object({ type: z.enum(ORDER_TYPES), lines: linesSchema })
  .refine((v) => v.type === 'lab' || v.lines.length === 1, { message: 'single_item' });
export type OrderPreviewInput = z.infer<typeof orderPreviewSchema>;

/** Laboratorio elegido para un grupo de pruebas de la vista previa (nulo: «Sin laboratorio asignado»). */
export const labGroupChoiceSchema = z.object({ labTestIds: z.array(z.uuid()).min(1).max(ORDER_LAB_TESTS_MAX), labProviderId: z.uuid().nullable() });
export type LabGroupChoice = z.infer<typeof labGroupChoiceSchema>;

/**
 * «Crear orden» (S-CLI-18). En Laboratorio, `labGroups` son los grupos de la
 * vista previa con el laboratorio elegido; sin ellos, los sugeridos. Cambiar
 * el sugerido exige `labChangeReason` (ADR 0028).
 */
export const createOrderSchema = z
  .object({
    type: z.enum(ORDER_TYPES),
    lines: linesSchema,
    notes: notesSchema.optional(),
    labGroups: z.array(labGroupChoiceSchema).min(1).max(ORDER_LAB_TESTS_MAX).optional(),
    labChangeReason: reasonSchema.optional(),
  })
  .refine((v) => v.type === 'lab' || v.lines.length === 1, { message: 'single_item' })
  .refine((v) => v.type === 'lab' || (v.labGroups === undefined && v.labChangeReason === undefined), { message: 'lab_only' });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** S-CLI-21 «Cancelar orden»: motivo obligatorio (máx. 500) y la versión leída. */
export const cancelOrderSchema = z.object({ reason: reasonSchema, expectedVersion: expectedVersionSchema });
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

/** «Cambiar laboratorio…» (Enfermería y Proveedor): otro laboratorio activo que haga todas las pruebas, con motivo. */
export const changeOrderLabSchema = z.object({ labProviderId: z.uuid(), reason: reasonSchema, expectedVersion: expectedVersionSchema });
export type ChangeOrderLabInput = z.infer<typeof changeOrderLabSchema>;

/** «Iniciar» (S-CLI-19): la versión leída. */
export const startOrderSchema = z.object({ expectedVersion: expectedVersionSchema });
export type StartOrderInput = z.infer<typeof startOrderSchema>;

/** S-CLI-20 «Completar orden»: «Notas de finalización (opcional)», máx. 4000, y la versión leída. */
export const completeOrderSchema = z.object({ notes: notesSchema.optional(), expectedVersion: expectedVersionSchema });
export type CompleteOrderInput = z.infer<typeof completeOrderSchema>;

/** S-CLI-22 «Asignar orden»: la membresía elegida, o nula para «Quitar asignación». */
export const assignOrderSchema = z.object({ membershipId: z.uuid().nullable(), expectedVersion: expectedVersionSchema });
export type AssignOrderInput = z.infer<typeof assignOrderSchema>;

// --- Cola de órdenes (T-026; S-CLI-03) -----------------------------------------

/** Pestañas de la cola. «Completadas hoy»: completadas en el día de la sede. */
export const ORDER_QUEUE_TABS = ['pending', 'in_progress', 'completed_today', 'cancelled'] as const;
export type OrderQueueTab = (typeof ORDER_QUEUE_TABS)[number];

export const ORDER_QUEUE_TAB_LABELS: Record<OrderQueueTab, string> = {
  pending: 'Pendientes',
  in_progress: 'En curso',
  completed_today: 'Completadas hoy',
  cancelled: 'Canceladas',
};

export function isOrderQueueTab(value: unknown): value is OrderQueueTab {
  return typeof value === 'string' && (ORDER_QUEUE_TABS as readonly string[]).includes(value);
}

/** Filas por pestaña: las canceladas se acumulan, así que se muestran las más recientes. */
export const ORDER_QUEUE_LIMIT = 200;

/** Una persona del personal, tal como la ve la cola: «me» o su nombre (nunca pacientes). */
export interface StaffRef {
  kind: 'me' | 'user';
  name: string | null;
}

/** La persona asignada a una orden, con su membresía (para marcarla en S-CLI-22). */
export interface AssignedRef extends StaffRef {
  membershipId: string;
}

/**
 * Una tarjeta de la cola (S-CLI-03). Mínimo necesario: códigos, servicio,
 * cantidad, tipo, estado y personal. Nunca nombres de pacientes, notas ni
 * costos (decisión del 2026-11-02).
 */
export interface OrderQueueRow {
  id: string;
  code: string;
  type: OrderType;
  status: OrderStatus;
  version: number;
  items: OrderItemView[];
  patientCode: string;
  encounter: { id: string; code: string; status: VisitStatus };
  orderedAt: string;
  orderedBy: StaffRef;
  assignedTo: AssignedRef | null;
  /** Solo en Laboratorio: el nombre del laboratorio (nulo: «Sin laboratorio asignado»). */
  lab: LabName | null;
  completedAt: string | null;
  cancelledAt: string | null;
  abilities: OrderActions & { cancel: boolean; changeLab: boolean };
}

export interface OrderQueue {
  tab: OrderQueueTab;
  mine: boolean;
  /** Día de la sede de «Completadas hoy» (AAAA-MM-DD). */
  today: string;
  timeZone: string;
  counts: Record<OrderQueueTab, number>;
  rows: OrderQueueRow[];
}

/** S-CLI-22: personal activo con rol Enfermería o Proveedor en la sede (decisión del 2026-11-02). */
export interface OrderAssignee {
  membershipId: string;
  name: string;
  me: boolean;
  roles: ('enfermeria' | 'proveedor')[];
}

// --- Respuestas ---------------------------------------------------------------

/** Un laboratorio, tal como lo ven Enfermería y Proveedor: solo el nombre (ADR 0028). */
export interface LabName {
  id: string;
  name: string;
}

/** Un ítem que se puede ordenar, con su precio vigente en la sede hoy (nulo: «Estimación no disponible»). */
export interface OrderableItem {
  id: string;
  code: string;
  name: string;
  unitPriceCents: number | null;
}

export interface OrderableItems {
  type: OrderType;
  /** Día de la sede del precio (AAAA-MM-DD). */
  date: string;
  items: OrderableItem[];
}

export interface OrderPreviewLine {
  itemId: string;
  code: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  /** Precio × cantidad; nulo si el ítem no tiene precio vigente. */
  amountCents: number | null;
}

/**
 * Un grupo de pruebas que irá en una sola orden. `suggested`: el laboratorio
 * sugerido (nulo con seguro o sin laboratorio); `options`: los laboratorios
 * activos que hacen todas las pruebas del grupo ese día, por preferencia.
 * Vacío: «Sin laboratorio asignado».
 */
export interface LabGroupPreview {
  labTestIds: string[];
  suggested: LabName | null;
  options: LabName[];
}

export interface OrderPreview {
  type: OrderType;
  lines: OrderPreviewLine[];
  /** Suma de las líneas; nulo si alguna no tiene precio. */
  totalCents: number | null;
  /** Solo en Laboratorio. Con seguro no se sugiere: el personal elige (ADR 0028). */
  lab: { coverage: LabCoverageType; groups: LabGroupPreview[] } | null;
}

export interface OrderItemView {
  code: string;
  name: string;
  quantity: number;
}

/** Una orden de la sección «Órdenes» (S-CLI-17). Sin costos de laboratorio. */
export interface OrderView {
  id: string;
  code: string;
  type: OrderType;
  status: OrderStatus;
  version: number;
  items: OrderItemView[];
  /** «Estimado {importe}»: los cargos de la orden (anulados incluidos, si está cancelada). */
  estimateCents: number;
  orderedAt: string;
  orderedBy: { kind: 'me' | 'user'; name: string | null };
  assignedTo: AssignedRef | null;
  /** Solo en Laboratorio: el laboratorio asignado (nulo: «Sin laboratorio asignado»). */
  lab: LabName | null;
  /** Notas y motivo de cancelación: solo para quien crea o ejecuta órdenes; nulos para Recepción. */
  notes: string | null;
  cancelReason: string | null;
  abilities: OrderActions & { cancel: boolean; changeLab: boolean };
}

export interface EncounterOrders {
  orders: OrderView[];
  /** ¿Quien llama puede crear órdenes (rol Proveedor)? */
  canCreate: boolean;
  /** ¿La visita acepta órdenes en su estado? */
  orderable: boolean;
}

export interface OrdersCreated {
  orders: { id: string; code: string; status: OrderStatus; version: number }[];
}

export interface OrderSaved {
  order: { id: string; status: OrderStatus; version: number };
  encounter: { id: string; status: VisitStatus; version: number };
}

/** Opciones de «Cambiar laboratorio…»: los activos que hacen todas las pruebas de la orden hoy. */
export interface OrderLabOptions {
  current: LabName | null;
  options: LabName[];
}

// --- Reglas puras -------------------------------------------------------------

/**
 * «Cancelar orden» (S-CLI-19 y 21, T-025): el Proveedor que la ordenó o el de
 * la visita, con la orden abierta y la visita abierta. La anulación
 * administrativa llega con T-028.
 */
export function canCancelOrder(o: {
  status: OrderStatus;
  visitStatus: VisitStatus;
  isProvider: boolean;
  orderedByMe: boolean;
  visitProviderIsMe: boolean;
}): boolean {
  return o.isProvider && isOpenOrderStatus(o.status) && isOpenVisitStatus(o.visitStatus) && (o.orderedByMe || o.visitProviderIsMe);
}

/**
 * Ejecutar una orden (T-026; S-CLI-19). Ejecutan quienes tienen el rol
 * Enfermería o Proveedor en la sede (`orders.execute`); el Propietario y el
 * Administrador solo si tienen uno de esos roles, y sin pasar por encima de la
 * asignación (ADR 0033, decisión del 2026-11-02). Todo, con la visita abierta.
 *  - «Iniciar»: Pendiente, sin asignar o asignada a quien llama.
 *  - «Completar»: En curso (no exige ser quien la inició). En Laboratorio,
 *    solo con laboratorio asignado (ADR 0028): `needsLab` lo explica.
 *  - «Asignar»: cualquier orden abierta; reasignar o quitar la asignación.
 */
export interface OrderActionsInput {
  type: OrderType;
  status: OrderStatus;
  visitStatus: VisitStatus;
  canExecute: boolean;
  /** La persona asignada: nula = «Sin asignar»; `me` = quien llama. */
  assigned: 'none' | 'me' | 'other';
  labAssigned: boolean;
}

export interface OrderActions {
  start: boolean;
  complete: boolean;
  assign: boolean;
  /** En curso, de laboratorio y sin laboratorio: «Completar» espera a «Cambiar laboratorio…». */
  needsLab: boolean;
}

export function orderActions(o: OrderActionsInput): OrderActions {
  const live = o.canExecute && isOpenVisitStatus(o.visitStatus);
  const needsLab = live && o.status === 'IN_PROGRESS' && o.type === 'lab' && !o.labAssigned;
  return {
    start: live && o.status === 'PENDING' && o.assigned !== 'other',
    complete: live && o.status === 'IN_PROGRESS' && !needsLab,
    assign: live && isOpenOrderStatus(o.status),
    needsLab,
  };
}

/** Transiciones de la orden (S-CLI-19): Pendiente → En curso → Completada; Pendiente o En curso → Cancelada. */
export function canMoveOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (to === 'IN_PROGRESS') return from === 'PENDING';
  if (to === 'COMPLETED') return from === 'IN_PROGRESS';
  if (to === 'CANCELLED') return isOpenOrderStatus(from);
  return false;
}

/** Separador entre las notas de la orden y la nota de finalización (S-CLI-20: se añade, no reemplaza). */
export const ORDER_NOTES_SEPARATOR = '\n\n';

/**
 * Notas tras completar (S-CLI-20): la nota de finalización se añade a las
 * existentes. Nulo si la suma pasa de 4000 (`notes_too_long`).
 */
export function appendCompletionNote(existing: string | null, note: string | undefined): { notes: string | null; changed: boolean } | null {
  const added = note?.trim() ?? '';
  if (added === '') return { notes: existing, changed: false };
  const notes = existing ? `${existing}${ORDER_NOTES_SEPARATOR}${added}` : added;
  return notes.length > ORDER_NOTES_MAX ? null : { notes, changed: true };
}

/** «Cambiar laboratorio…»: Enfermería y Proveedor, en una orden de laboratorio abierta de una visita abierta. */
export function canChangeOrderLab(o: { type: OrderType; status: OrderStatus; visitStatus: VisitStatus; canExecute: boolean }): boolean {
  return o.canExecute && o.type === 'lab' && isOpenOrderStatus(o.status) && isOpenVisitStatus(o.visitStatus);
}

export interface LabGroupsInput {
  labTestIds: readonly string[];
  labs: readonly Pick<LabProvider, 'id' | 'name' | 'preference' | 'active'>[];
  costs: readonly LabCostRecord[];
  /** El día de la orden en la sede (`AAAA-MM-DD`). */
  date: string;
  coverage: LabCoverageType;
}

export interface LabGroup {
  labTestIds: string[];
  /** Id del laboratorio sugerido; nulo con seguro o si ninguno las hace. */
  suggestedId: string | null;
  /** Ids de los laboratorios activos que hacen todas las pruebas del grupo, por preferencia. */
  optionIds: string[];
}

/** Laboratorios activos que hacen todas las pruebas ese día, por preferencia. */
export function labsForAll(input: Omit<LabGroupsInput, 'coverage' | 'labTestIds'>, labTestIds: readonly string[]): string[] {
  const costsOn = labCostsOn(input.costs, input.date);
  return [...input.labs]
    .filter((l) => l.active)
    .sort(compareLabProviders)
    .filter((l) => labTestIds.every((t) => costsOn.get(t)?.has(l.id)))
    .map((l) => l.id);
}

/**
 * Cómo se reparten las pruebas en órdenes (T-025; ADR 0028 y decisión del
 * 2026-11-02 para el seguro). Cada grupo es una orden:
 *  - Pago directo y membresía: los grupos de `suggestLabs()` (uno si un
 *    laboratorio las hace todas; si no, el reparto del ADR), cada uno con su
 *    sugerido, y aparte las pruebas que ningún laboratorio hace («Sin
 *    laboratorio asignado»).
 *  - Seguro: sin sugerencia. Si algún laboratorio activo las hace todas, una
 *    sola orden con esas opciones; si no, una orden por prueba, cada una con
 *    los laboratorios que la hacen. Se puede dejar sin laboratorio y
 *    Enfermería lo elige después.
 * Las pruebas de cada grupo y los grupos, en el orden en que llegaron.
 */
export function labOrderGroups(input: LabGroupsInput): LabGroup[] {
  const testIds = [...new Set(input.labTestIds)];
  const inOrder = (ids: readonly string[]) => testIds.filter((id) => ids.includes(id));
  const group = (ids: readonly string[], suggestedId: string | null): LabGroup => {
    const labTestIds = inOrder(ids);
    return { labTestIds, suggestedId, optionIds: labsForAll(input, labTestIds) };
  };
  const suggestion = suggestLabs({ ...input, labTestIds: testIds });
  if (suggestion.kind === 'insurance') {
    if (labsForAll(input, testIds).length > 0) return [group(testIds, null)];
    return testIds.map((id) => group([id], null));
  }
  const groups = suggestion.assignments.map((a) => group(a.labTestIds, a.labProviderId));
  if (suggestion.withoutLab.length > 0) groups.push(group(suggestion.withoutLab, null));
  // Los grupos en el orden de su primera prueba.
  return groups.sort((a, b) => testIds.indexOf(a.labTestIds[0] ?? '') - testIds.indexOf(b.labTestIds[0] ?? ''));
}

/** Total de las líneas en centavos (solo el servidor lo usa); nulo si alguna no tiene precio. */
export function linesTotalCents(lines: readonly { amountCents: number | null }[]): number | null {
  let total = 0;
  for (const line of lines) {
    if (line.amountCents === null) return null;
    total += line.amountCents;
  }
  return total;
}
