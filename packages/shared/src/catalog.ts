import { z } from 'zod';
import { reasonSchema } from './schemas.ts';
import { VISIT_ROUTES } from './visit.ts';

// Catálogo mínimo y precios por sede (T-011; S-ADM-13 a 20). Los valores
// permitidos son los mismos que exige la base de datos (packages/db,
// catalog-schema.ts); una prueba lo comprueba.

/** Los cuatro catálogos, en el orden de las pestañas. */
export const CATALOG_KINDS = ['appointment-types', 'procedures', 'lab-tests', 'referral-sources'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const CATALOG_LABELS: Record<CatalogKind, { title: string; singular: string; segment: string }> = {
  'appointment-types': { title: 'Tipos de cita', singular: 'tipo de cita', segment: 'tipos-de-cita' },
  procedures: { title: 'Procedimientos', singular: 'procedimiento', segment: 'procedimientos' },
  'lab-tests': { title: 'Pruebas de laboratorio', singular: 'prueba de laboratorio', segment: 'pruebas-de-laboratorio' },
  'referral-sources': { title: 'Fuentes de referido', singular: 'fuente de referido', segment: 'fuentes-de-referido' },
};

/** Catálogos con precio por sede. */
export const PRICED_KINDS: readonly CatalogKind[] = ['procedures', 'lab-tests'];

export function isCatalogKind(value: string): value is CatalogKind {
  return (CATALOG_KINDS as readonly string[]).includes(value);
}

/** Código: empieza por letra; A–Z, dígitos, `_` y `-`; de 2 a 41 caracteres (S-ADM-19, con guion). */
export const CATALOG_CODE_REGEX = /^[A-Z][A-Z0-9_-]{1,40}$/;

export const PROCEDURE_KINDS = ['procedure', 'injection'] as const;
export type ProcedureKind = (typeof PROCEDURE_KINDS)[number];
export const PROCEDURE_KIND_LABELS: Record<ProcedureKind, string> = { procedure: 'Procedimiento', injection: 'Inyección' };

/**
 * Colores de la agenda (T-011): sin rojo, ámbar ni verde, que ya significan
 * peligro, espera y completada. En la agenda (T-014) se usan solo como franja
 * lateral de la tarjeta, nunca como chip.
 */
export const AGENDA_COLORS = ['teal', 'cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'slate', 'stone'] as const;
export type AgendaColor = (typeof AGENDA_COLORS)[number];
export const AGENDA_COLOR_LABELS: Record<AgendaColor, string> = {
  teal: 'Verde azulado',
  cyan: 'Cian',
  blue: 'Azul',
  indigo: 'Índigo',
  violet: 'Violeta',
  fuchsia: 'Fucsia',
  slate: 'Pizarra',
  stone: 'Piedra',
};

/** Duración por defecto de un tipo de cita: el mismo rango que una cita. */
export const APPOINTMENT_DURATION_MIN = 5;
export const APPOINTMENT_DURATION_MAX = 480;
export const SORT_ORDER_MAX = 100_000;
/** Tope de un precio: 100 000 USD, en centavos. */
export const PRICE_MAX_CENTS = 10_000_000;

const name = z.string().trim().min(1).max(120);
const sortOrder = z.number().int().min(0).max(SORT_ORDER_MAX).nullable();
const expectedVersion = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const amountCents = z.number().int().min(0).max(PRICE_MAX_CENTS);

/**
 * Precio de venta nuevo (lo que paga el paciente), con su fecha de vigencia:
 * hoy o después. El general vale en todas las sedes de la organización.
 */
export const generalPriceSchema = z.object({ amountCents, effectiveFrom: isoDate });
/** Excepción de una sede: reemplaza al precio general solo en ella. */
export const locationPriceSchema = z.object({ locationId: z.uuid(), amountCents, effectiveFrom: isoDate });
/** «Volver al precio general» en una sede, desde una fecha (hoy o después en la sede). P-15, ADR 0029. */
export const useGeneralPriceSchema = z.object({ locationId: z.uuid(), effectiveFrom: isoDate });
export type GeneralPriceInput = z.infer<typeof generalPriceSchema>;
export type UseGeneralPriceInput = z.infer<typeof useGeneralPriceSchema>;
export type LocationPriceInput = z.infer<typeof locationPriceSchema>;

const FIELDS = {
  'appointment-types': {
    name,
    sortOrder,
    defaultDurationMinutes: z.number().int().min(APPOINTMENT_DURATION_MIN).max(APPOINTMENT_DURATION_MAX).nullable(),
    suggestedRoute: z.enum(VISIT_ROUTES).nullable(),
    color: z.enum(AGENDA_COLORS),
  },
  procedures: { name, sortOrder, kind: z.enum(PROCEDURE_KINDS) },
  'lab-tests': { name, sortOrder },
  'referral-sources': { name, sortOrder },
} as const;

/**
 * «Crear»: el código solo se escribe aquí. En los catálogos con precio, el
 * precio general es obligatorio y el de la sede elegida, opcional.
 */
export function createCatalogItemSchema(kind: CatalogKind) {
  const base = z.object({ code: z.string().regex(CATALOG_CODE_REGEX), ...FIELDS[kind] });
  return PRICED_KINDS.includes(kind) ? base.extend({ generalPrice: generalPriceSchema, locationPrice: locationPriceSchema.optional() }) : base;
}

/** «Guardar»: sin código; cada precio, solo si cambia (crea una fila nueva). */
export function updateCatalogItemSchema(kind: CatalogKind) {
  const base = z.object({ ...FIELDS[kind], expectedVersion });
  return PRICED_KINDS.includes(kind) ? base.extend({ generalPrice: generalPriceSchema.optional(), locationPrice: locationPriceSchema.optional() }) : base;
}

export const deactivateCatalogItemSchema = z.object({ reason: reasonSchema, expectedVersion });
export const reactivateCatalogItemSchema = z.object({ expectedVersion });

export interface CatalogPrice {
  /**
   * Centavos. Nulo solo en el precio de una sede: «Usa el precio general»
   * desde `effectiveFrom` (la sede vuelve al general).
   */
  amountCents: number | null;
  /** Fecha de vigencia, `AAAA-MM-DD`, en la zona horaria de la sede. */
  effectiveFrom: string;
}

/** El precio que rige hoy y el próximo programado. */
export interface PriceTimeline {
  current: CatalogPrice | null;
  next: CatalogPrice | null;
}

/** Una fila de cualquier catálogo; los campos propios solo vienen en el suyo. */
export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  sortOrder: number | null;
  active: boolean;
  version: number;
  defaultDurationMinutes?: number | null;
  suggestedRoute?: (typeof VISIT_ROUTES)[number] | null;
  color?: AgendaColor;
  kind?: ProcedureKind;
  /**
   * Procedimientos y pruebas, en la sede consultada: el precio general, el
   * propio de la sede (sin `current` ni `next`: «Usa el precio general») y el
   * que rige hoy (el propio si hay; si no, el general).
   */
  price?: { general: PriceTimeline; location: PriceTimeline; effective: CatalogPrice | null };
}

export interface CatalogList {
  locationId: string;
  /** Hoy en la sede (`AAAA-MM-DD`): la vigencia mínima de su precio propio. */
  today: string;
  /** El día más adelantado entre las sedes activas: la vigencia mínima de un precio general. */
  generalToday: string;
  items: Record<CatalogKind, CatalogItem[]>;
}
