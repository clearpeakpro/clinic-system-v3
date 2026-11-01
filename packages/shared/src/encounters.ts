import { z } from 'zod';
import type { AppointmentStatus } from './appointments.ts';
import type { PatientSummary } from './patients.ts';
import { expectedVersionSchema, reasonSchema } from './schemas.ts';
import {
  CLOSE_OUTCOMES,
  VISIT_ROUTES,
  VISIT_STATUSES,
  type EncounterAbilities,
  type EncounterEventAction,
  type VisitAction,
  type VisitRoute,
  type VisitStatus,
} from './visit.ts';

// Llegada con cita y sin cita (T-017; S-REC-18 a 27). Esquemas de entrada,
// textos y tipos de respuesta, los mismos en la web y en la API. Los valores
// son los que exige la base de datos (packages/db, encounters-schema.ts); una
// prueba lo comprueba.
//
// Dinero (CLAUDE.md, regla 4): los importes viajan como texto decimal
// («25.00») y los convierte a centavos el servidor, con este mismo esquema,
// sin pasar por números de coma flotante. El coaseguro, en centésimas de
// punto (20.5 % → 2050).

export const COVERAGE_TYPES = ['self_pay', 'insurance', 'membership'] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];

export const COVERAGE_TYPE_LABELS: Record<CoverageType, string> = {
  self_pay: 'Pago directo',
  insurance: 'Seguro',
  membership: 'Membresía',
};

/** Coberturas que ofrece la llegada en la parte 3A: «Membresía» llega con T-026b (ADR 0034). */
export const ARRIVAL_COVERAGE_TYPES = ['self_pay', 'insurance'] as const satisfies readonly CoverageType[];

export const INSURANCE_TERMS = ['copay', 'coinsurance', 'deductible'] as const;
export type InsuranceTerm = (typeof INSURANCE_TERMS)[number];

export const INSURANCE_TERM_LABELS: Record<InsuranceTerm, string> = {
  copay: 'Copago',
  coinsurance: 'Coaseguro',
  deductible: 'Deducible',
};

/** Tope de un copago o deducible: 9 999 999.99 USD (el mismo que la base de datos). */
export const COVERAGE_AMOUNT_MAX_CENTS = 999_999_999;

const MONEY = /^(\d{1,7})(?:\.(\d{1,2}))?$/;
const PERCENT = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/** «25», «25.5» o «25.50» → 2550 centavos. Nulo si no es un monto válido (solo dígitos y punto, hasta dos decimales). */
export function parseMoneyToCents(text: string): number | null {
  const match = MONEY.exec(text.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents <= COVERAGE_AMOUNT_MAX_CENTS ? cents : null;
}

/** «20», «20.5» → 2050 centésimas de punto. Nulo si no está entre 0 y 100 con hasta dos decimales. */
export function parsePercentToBasisPoints(text: string): number | null {
  const match = PERCENT.exec(text.trim());
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

/** 2550 → «25.50» (para mostrar; nunca para sumar). */
export function centsToDecimal(cents: number): string {
  return `${String(Math.trunc(cents / 100))}.${String(cents % 100).padStart(2, '0')}`;
}

/** 2050 → «20.5»; 2000 → «20». */
export function basisPointsToPercent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = bp % 100;
  if (rest === 0) return String(whole);
  return `${String(whole)}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}

/** Mensajes de validación del paso «Datos del pagador» (S-REC-25). */
export const COVERAGE_MESSAGES = {
  insurerName: 'Ingrese el nombre del seguro.',
  money: 'Ingrese un monto válido (hasta dos decimales).',
  percent: 'Ingrese un porcentaje entre 0 y 100.',
} as const;

const insuranceInput = z
  .object({
    type: z.literal('insurance'),
    insurerName: z.string().trim().min(1, COVERAGE_MESSAGES.insurerName).max(120),
    memberId: z
      .string()
      .trim()
      .max(60)
      .nullish()
      .transform((v) => (v ? v : null)),
    term: z.enum(INSURANCE_TERMS),
    /** Texto decimal: «25.00» (copago o deducible) o «20» (coaseguro, en %). */
    value: z.string().max(20),
  })
  .transform((v, ctx) => {
    if (v.term === 'coinsurance') {
      const coinsuranceBp = parsePercentToBasisPoints(v.value);
      if (coinsuranceBp === null) {
        ctx.addIssue({ code: 'custom', message: COVERAGE_MESSAGES.percent, path: ['value'] });
        return z.NEVER;
      }
      return { type: v.type, insurerName: v.insurerName, memberId: v.memberId, term: v.term, amountCents: null, coinsuranceBp };
    }
    const amountCents = parseMoneyToCents(v.value);
    if (amountCents === null) {
      ctx.addIssue({ code: 'custom', message: COVERAGE_MESSAGES.money, path: ['value'] });
      return z.NEVER;
    }
    return { type: v.type, insurerName: v.insurerName, memberId: v.memberId, term: v.term, amountCents, coinsuranceBp: null };
  });

/** Cobertura de la llegada en 3A: Pago directo o Seguro con un solo término. */
export const arrivalCoverageSchema = z.union([z.object({ type: z.literal('self_pay') }), insuranceInput]);
export type ArrivalCoverageInput = z.input<typeof arrivalCoverageSchema>;
export type ArrivalCoverageData = z.output<typeof arrivalCoverageSchema>;

const route = z.enum(VISIT_ROUTES);

/**
 * «Registrar llegada» (S-REC-18) o «Iniciar visita sin cita» (S-REC-19), con
 * Idempotency-Key. La ruta elegida se guarda también con cita (ADR 0005).
 */
export const arrivalSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('appointment'),
    appointmentId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    route,
    coverage: arrivalCoverageSchema,
  }),
  z.object({
    source: z.literal('walk_in'),
    patientId: z.uuid(),
    appointmentTypeId: z.uuid().nullable(),
    route,
    coverage: arrivalCoverageSchema,
  }),
]);
export type ArrivalInput = z.input<typeof arrivalSchema>;
export type ArrivalData = z.output<typeof arrivalSchema>;

/** Sede de la visita (paso «Sede», S-REC-22). */
export interface ArrivalSite {
  id: string;
  code: string;
  name: string;
  timezone: string;
  active: boolean;
}

/** Paciente del paso «Paciente» (S-REC-21). Su lectura se audita. */
export interface ArrivalPatient extends PatientSummary {
  /** Si fue fusionado, el registro principal («Abrir registro principal»). */
  mergedInto: string | null;
}

/** Tipo de cita activo, con su ruta sugerida (paso «Ruta», S-REC-23). */
export interface ArrivalAppointmentType {
  id: string;
  name: string;
  suggestedRoute: VisitRoute | null;
}

/** Lo que necesita el asistente de llegada para empezar (S-REC-18 o S-REC-19). */
export interface ArrivalContext {
  site: ArrivalSite;
  patient: ArrivalPatient;
  /** Solo con cita. */
  appointment: {
    id: string;
    code: string;
    status: AppointmentStatus;
    version: number;
    startsAt: string;
    /** ¿Es de hoy en la sede? Solo las de hoy admiten la llegada. */
    isToday: boolean;
    appointmentType: ArrivalAppointmentType | null;
  } | null;
  /** Tipos de cita activos (solo sin cita: desplegable «Tipo de cita»). */
  appointmentTypes: ArrivalAppointmentType[];
}

/** Respuesta de la llegada (S-REC-27): sin datos del seguro. */
export interface ArrivalResult {
  encounter: { id: string; code: string; status: VisitStatus; route: VisitRoute; version: number };
  coverageType: CoverageType;
  appointment: { id: string; status: AppointmentStatus; version: number } | null;
}

// --- Pantalla de la visita (T-018; S-CLI-04 a 12, S-CLI-24, S-PAC-08) -------

/** Pasos regulares que se piden por `POST /encounters/:id/transition`: ni la apertura ni los cierres. */
export const REGULAR_VISIT_ACTIONS = [
  'send_to_nurse',
  'send_to_procedure',
  'start_nursing',
  'send_to_provider',
  'start_consult',
  'ready_for_checkout',
  'start_checkout',
  'complete',
] as const satisfies readonly VisitAction[];
export type RegularVisitAction = (typeof REGULAR_VISIT_ACTIONS)[number];

/** Acción regular de la barra (S-CLI-07). */
export const encounterTransitionSchema = z.object({ action: z.enum(REGULAR_VISIT_ACTIONS), expectedVersion: expectedVersionSchema });
export type EncounterTransitionInput = z.input<typeof encounterTransitionSchema>;

/** «Cerrar visita» (S-CLI-09): resultado y motivo obligatorio (máx. 500). */
export const closeEncounterSchema = z.object({ outcome: z.enum(CLOSE_OUTCOMES), reason: reasonSchema, expectedVersion: expectedVersionSchema });
export type CloseEncounterInput = z.input<typeof closeEncounterSchema>;

/** «Cambio excepcional de estado» (S-CLI-10): destino y motivo obligatorio. */
export const forceEncounterSchema = z.object({ status: z.enum(VISIT_STATUSES), reason: reasonSchema, expectedVersion: expectedVersionSchema });
export type ForceEncounterInput = z.input<typeof forceEncounterSchema>;

/** «Asignar proveedor» o «Asignarme» (S-CLI-05/06). */
export const assignProviderSchema = z.object({ providerMembershipId: z.uuid(), expectedVersion: expectedVersionSchema });
export type AssignProviderInput = z.input<typeof assignProviderSchema>;

/** Diálogo «Cobertura» (S-CLI-12): la misma cobertura que la llegada (3A: sin membresía) y la versión de la cobertura. */
export const updateCoverageSchema = z.object({ coverage: arrivalCoverageSchema, expectedVersion: expectedVersionSchema });
export type UpdateCoverageInput = z.input<typeof updateCoverageSchema>;

/** Respuesta de cada cambio de la visita: sin datos del paciente. La pantalla vuelve a leer la visita. */
export interface EncounterSaved {
  id: string;
  status: VisitStatus;
  version: number;
}

/** Cobertura de la visita (S-CLI-11), descifrada para quien abre la visita. Importes en centavos. */
export interface EncounterCoverage {
  type: CoverageType;
  insurerName: string | null;
  memberId: string | null;
  term: InsuranceTerm | null;
  amountCents: number | null;
  coinsuranceBp: number | null;
  version: number;
}

/** Proveedor de la visita o de la lista de S-CLI-06. */
export interface EncounterProvider {
  membershipId: string;
  name: string;
}

/** Una entrada del historial (S-CLI-24). */
export interface EncounterTimelineEntry {
  id: string;
  action: EncounterEventAction;
  fromStatus: VisitStatus | null;
  toStatus: VisitStatus;
  forced: boolean;
  /** Motivo (cerrar o forzar), descifrado. */
  reason: string | null;
  occurredAt: string;
  /** Versión de la visita tras el cambio. */
  version: number;
  /** «Usted», el nombre de la persona, «Kiosco» o «Sistema». */
  actor: { kind: 'me' | 'user' | 'kiosk' | 'system'; name: string | null };
}

/** La visita completa (S-CLI-04): encabezado, cobertura, historial y lo que puede hacer quien la abre. */
export interface EncounterDetail {
  id: string;
  code: string;
  status: VisitStatus;
  route: VisitRoute;
  version: number;
  arrivedAt: string;
  closedAt: string | null;
  /** Desde cuándo está en el estado actual (último cambio del historial). */
  statusSince: string;
  /** Motivo del último cierre, si la visita está cerrada («Motivo: …» del banner). */
  closeReason: string | null;
  /** Hora del servidor (reloj inyectable): base de los cronómetros. */
  serverNow: string;
  /** Día de hoy en la sede (AAAA-MM-DD), para la edad. */
  today: string;
  patient: { id: string; code: string; firstName: string; lastName: string; birthDate: string };
  location: { id: string; code: string; name: string; timezone: string };
  appointmentType: { id: string; name: string } | null;
  provider: EncounterProvider | null;
  /** Membresía de quien abre la visita (para «Usted»). */
  myMembershipId: string;
  coverage: EncounterCoverage | null;
  timeline: EncounterTimelineEntry[];
  abilities: EncounterAbilities;
}

/** Filas de la pestaña Visitas del perfil (S-PAC-08), de la más reciente a la más antigua. */
export const PATIENT_ENCOUNTERS_PAGE_SIZE = 50;

export interface PatientEncounterRow {
  id: string;
  code: string;
  arrivedAt: string;
  status: VisitStatus;
  route: VisitRoute;
  location: { id: string; code: string; name: string };
  provider: EncounterProvider | null;
}

export interface PatientEncounters {
  encounters: PatientEncounterRow[];
  nextOffset: number | null;
}

/** Ruta inicial del paso «Ruta»: la sugerida por el tipo, o «Estándar». */
export function suggestedRoute(type: { suggestedRoute: VisitRoute | null } | null | undefined): VisitRoute {
  return type?.suggestedRoute ?? 'STANDARD';
}
