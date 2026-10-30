import { z } from 'zod';
import { reasonSchema } from './schemas.ts';

// Laboratorios, costos por prueba y sugerencia de laboratorio (T-011b,
// ADR 0028; S-ADM-16 y 17). Los costos son lo que la prueba le cuesta a la
// clínica en cada laboratorio; no son el precio que paga el paciente.

/** Preferencia de un laboratorio: 1 es el más preferido. */
export const LAB_PREFERENCE_MIN = 1;
export const LAB_PREFERENCE_MAX = 1000;
/** Tope de un costo: 100 000 USD, en centavos (como un precio). */
export const LAB_COST_MAX_CENTS = 10_000_000;

const expectedVersion = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const labProviderFields = {
  name: z.string().trim().min(1).max(120),
  preference: z.number().int().min(LAB_PREFERENCE_MIN).max(LAB_PREFERENCE_MAX),
};
export const createLabProviderSchema = z.object(labProviderFields);
export const updateLabProviderSchema = z.object({ ...labProviderFields, expectedVersion });
export const deactivateLabProviderSchema = z.object({ reason: reasonSchema, expectedVersion });
export const reactivateLabProviderSchema = z.object({ expectedVersion });
export type CreateLabProviderInput = z.infer<typeof createLabProviderSchema>;
export type UpdateLabProviderInput = z.infer<typeof updateLabProviderSchema>;

/**
 * Un cambio en «Laboratorios que la realizan», desde una fecha: como el
 * precio general, hoy o después en la sede más adelantada. Marcar el
 * laboratorio o cambiar su costo (`amountCents`), o desmarcarlo
 * (`amountCents: null`, «No la realiza desde {fecha}»).
 */
export const labCostChangeSchema = z.object({
  labProviderId: z.uuid(),
  amountCents: z.number().int().min(0).max(LAB_COST_MAX_CENTS).nullable(),
  effectiveFrom: isoDate,
});
export type LabCostChange = z.infer<typeof labCostChangeSchema>;
/** Como mucho un cambio por laboratorio en cada guardado. */
export const labCostChangesSchema = z
  .array(labCostChangeSchema)
  .max(100)
  .refine((changes) => new Set(changes.map((c) => c.labProviderId)).size === changes.length, { message: 'Un laboratorio aparece dos veces.' });

export interface LabProvider {
  id: string;
  name: string;
  preference: number;
  active: boolean;
  version: number;
}

export interface LabCost {
  /** Centavos. Nulo: «No la realiza desde» `effectiveFrom`. */
  amountCents: number | null;
  /** `AAAA-MM-DD`. */
  effectiveFrom: string;
}

/** Un laboratorio en una prueba: el costo que rige hoy y el próximo programado. */
export interface LabTestLab {
  labProviderId: string;
  current: LabCost | null;
  next: LabCost | null;
}

/** Ordena por preferencia (1 primero) y, con la misma, por nombre. */
export function compareLabProviders(a: Pick<LabProvider, 'name' | 'preference'>, b: Pick<LabProvider, 'name' | 'preference'>): number {
  return a.preference - b.preference || a.name.localeCompare(b.name, 'es');
}

// --- Sugerencia de laboratorio (ADR 0028, «Selección» y «Cobertura») ---

/** Cobertura de la visita: la sugerencia por costo no aplica con seguro. */
export const LAB_COVERAGE_TYPES = ['self_pay', 'membership', 'insurance'] as const;
export type LabCoverageType = (typeof LAB_COVERAGE_TYPES)[number];

/** Una fila del historial de costos, en el orden en que se crearon. */
export interface LabCostRecord extends LabCost {
  labTestId: string;
  labProviderId: string;
}

export interface LabSuggestionInput {
  /** Las pruebas que se ordenan (ids de `lab_tests`). */
  labTestIds: readonly string[];
  /** Los laboratorios de la organización; los inactivos no se consideran. */
  labs: readonly Pick<LabProvider, 'id' | 'name' | 'preference' | 'active'>[];
  /** El historial completo de costos, en el orden en que se crearon. */
  costs: readonly LabCostRecord[];
  /** El día de la orden en la sede (`AAAA-MM-DD`). */
  date: string;
  coverage: LabCoverageType;
}

export interface LabAssignment {
  labProviderId: string;
  labTestIds: string[];
  totalCents: number;
}

export type LabSuggestion =
  /** Con seguro no se sugiere por costo: el personal elige el laboratorio de la red del seguro. */
  | { kind: 'insurance' }
  | {
      kind: 'suggested';
      /** Un laboratorio por orden, del más preferido al menos. Vacío si ninguna prueba tiene laboratorio. */
      assignments: LabAssignment[];
      totalCents: number;
      /** Pruebas que ningún laboratorio activo hace ese día: se avisa. */
      withoutLab: string[];
    };

/**
 * Costo que rige un día para cada prueba y laboratorio: la última fila
 * vigente ese día (la de fecha más reciente que no sea posterior; con la
 * misma fecha, la última creada). Si no tiene importe, el laboratorio no la
 * hace («No la realiza desde»), y no aparece.
 */
export function labCostsOn(costs: readonly LabCostRecord[], date: string): Map<string, Map<string, number>> {
  const latest = new Map<string, LabCostRecord>();
  for (const row of costs) {
    if (row.effectiveFrom > date) continue;
    const key = `${row.labTestId}|${row.labProviderId}`;
    const previous = latest.get(key);
    if (!previous || row.effectiveFrom >= previous.effectiveFrom) latest.set(key, row);
  }
  const byTest = new Map<string, Map<string, number>>();
  for (const row of latest.values()) {
    if (row.amountCents === null) continue;
    const labs = byTest.get(row.labTestId) ?? new Map<string, number>();
    labs.set(row.labProviderId, row.amountCents);
    byTest.set(row.labTestId, labs);
  }
  return byTest;
}

function* combinations<T>(items: readonly T[], size: number, start = 0): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - size; i++) {
    for (const rest of combinations(items, size - 1, i + 1)) yield [items[i] as T, ...rest];
  }
}

/**
 * Sugiere a qué laboratorio enviar las pruebas (ADR 0028):
 * 1. entre los laboratorios activos que hacen todas, el de menor costo total;
 * 2. si hay empate, el de mayor preferencia;
 * 3. si ninguno las hace todas, el menor número de laboratorios y, con ese
 *    número, el menor costo total, con cada prueba en el más barato de los
 *    elegidos. Si dos combinaciones empatan, gana la que incluye el
 *    laboratorio más preferido; si también, la del siguiente, y así;
 * 4. avisa de las pruebas que ningún laboratorio activo hace.
 * Con seguro no sugiere.
 */
export function suggestLabs(input: LabSuggestionInput): LabSuggestion {
  if (input.coverage === 'insurance') return { kind: 'insurance' };
  const testIds = [...new Set(input.labTestIds)];
  const active = input.labs.filter((l) => l.active).sort(compareLabProviders);
  const rank = new Map(active.map((l, i) => [l.id, i]));
  const costsOn = labCostsOn(input.costs, input.date);
  const offers = new Map<string, Map<string, number>>();
  for (const testId of testIds) {
    const labs = new Map([...(costsOn.get(testId) ?? new Map<string, number>())].filter(([labId]) => rank.has(labId)));
    if (labs.size > 0) offers.set(testId, labs);
  }
  const withoutLab = testIds.filter((id) => !offers.has(id));
  const covered = testIds.filter((id) => offers.has(id));
  if (covered.length === 0) return { kind: 'suggested', assignments: [], totalCents: 0, withoutLab };

  // Solo cuentan los laboratorios que hacen alguna de las pruebas.
  const candidates = active.filter((l) => covered.some((t) => offers.get(t)?.has(l.id)));
  for (let size = 1; size <= candidates.length; size++) {
    let best: { ranks: number[]; total: number; byLab: Map<string, string[]>; totals: Map<string, number> } | null = null;
    for (const combo of combinations(candidates, size)) {
      const byLab = new Map<string, string[]>();
      const totals = new Map<string, number>();
      let total = 0;
      let coversAll = true;
      for (const testId of covered) {
        const labs = offers.get(testId);
        // El más barato de los elegidos; con el mismo costo, el más preferido (combo está ordenado).
        let chosen: { id: string; cents: number } | null = null;
        for (const lab of combo) {
          const cents = labs?.get(lab.id);
          if (cents !== undefined && (chosen === null || cents < chosen.cents)) chosen = { id: lab.id, cents };
        }
        if (!chosen) {
          coversAll = false;
          break;
        }
        total += chosen.cents;
        byLab.set(chosen.id, [...(byLab.get(chosen.id) ?? []), testId]);
        totals.set(chosen.id, (totals.get(chosen.id) ?? 0) + chosen.cents);
      }
      if (!coversAll) continue;
      const ranks = combo.map((l) => rank.get(l.id) ?? 0);
      if (best === null || total < best.total || (total === best.total && preferredFirst(ranks, best.ranks))) {
        best = { ranks, total, byLab, totals };
      }
    }
    if (best) {
      const assignments = candidates
        .filter((l) => best.byLab.has(l.id))
        .map((l) => ({ labProviderId: l.id, labTestIds: best.byLab.get(l.id) ?? [], totalCents: best.totals.get(l.id) ?? 0 }));
      return { kind: 'suggested', assignments, totalCents: best.total, withoutLab };
    }
  }
  // No se llega aquí: todos los candidatos juntos cubren las pruebas cubiertas.
  return { kind: 'suggested', assignments: [], totalCents: 0, withoutLab: testIds };
}

/** `a` incluye un laboratorio más preferido que `b` (rangos ordenados, de igual longitud). */
function preferredFirst(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
