import { describe, expect, it } from 'vitest';
import { compareLabProviders, labCostChangesSchema, type LabCostRecord, suggestLabs, type LabSuggestionInput } from '../src/labs.ts';

// T-011b (ADR 0028): sugerencia de laboratorio. Laboratorios y costos ficticios.

const LABCORP = { id: 'labcorp', name: 'LabCorp', preference: 1, active: true };
const QUEST = { id: 'quest', name: 'Quest Diagnostics', preference: 2, active: true };
const CPL = { id: 'cpl', name: 'CPL', preference: 3, active: true };
const LABS = [CPL, QUEST, LABCORP];

const cost = (labProviderId: string, labTestId: string, amountCents: number | null, effectiveFrom = '2026-01-01'): LabCostRecord => ({
  labProviderId,
  labTestId,
  amountCents,
  effectiveFrom,
});

/** El ejemplo del ADR: CPL es el más barato en A1c, pero LabCorp gana en total; Quest no hace PSA. */
const COSTS = [
  cost('labcorp', 'a1c', 1200),
  cost('labcorp', 'tsh', 1500),
  cost('labcorp', 'psa', 1800),
  cost('cpl', 'a1c', 900),
  cost('cpl', 'tsh', 1900),
  cost('cpl', 'psa', 2100),
  cost('quest', 'a1c', 1100),
  cost('quest', 'tsh', 1400),
];

const suggest = (overrides: Partial<LabSuggestionInput> = {}) =>
  suggestLabs({ labTestIds: ['a1c', 'tsh', 'psa'], labs: LABS, costs: COSTS, date: '2026-11-01', coverage: 'self_pay', ...overrides });

describe('sugerencia de laboratorio', () => {
  it('A1c + tiroides + próstata: LabCorp gana en total aunque CPL sea más barato en A1c', () => {
    expect(suggest()).toEqual({
      kind: 'suggested',
      assignments: [{ labProviderId: 'labcorp', labTestIds: ['a1c', 'tsh', 'psa'], totalCents: 4500 }],
      totalCents: 4500,
      withoutLab: [],
    });
  });

  it('con membresía también sugiere; con seguro no sugiere por costo', () => {
    expect(suggest({ coverage: 'membership' })).toMatchObject({ kind: 'suggested', totalCents: 4500 });
    expect(suggest({ coverage: 'insurance' })).toEqual({ kind: 'insurance' });
  });

  it('empate en el total: gana el de mayor preferencia', () => {
    const tied = [...COSTS, cost('cpl', 'psa', 1700)]; // CPL: 900 + 1900 + 1700 = 4500, como LabCorp.
    expect(suggest({ costs: tied })).toMatchObject({ assignments: [{ labProviderId: 'labcorp' }] });
    // Si CPL fuera el preferido, ganaría él.
    expect(suggest({ costs: tied, labs: [{ ...CPL, preference: 1 }, { ...LABCORP, preference: 2 }, QUEST] })).toMatchObject({
      assignments: [{ labProviderId: 'cpl' }],
    });
    // Con la misma preferencia, desempata el nombre.
    expect(suggest({ costs: tied, labs: [{ ...CPL, preference: 1 }, LABCORP, QUEST] })).toMatchObject({ assignments: [{ labProviderId: 'cpl' }] });
  });

  it('un laboratorio que no hace una de las pruebas no se sugiere para todas, aunque sea más barato en las demás', () => {
    // Quest es el más barato en A1c + TSH (2500 frente a 2700 de LabCorp), pero no hace PSA.
    expect(suggest({ labTestIds: ['a1c', 'tsh'] })).toMatchObject({ assignments: [{ labProviderId: 'quest', totalCents: 2500 }] });
    expect(suggest()).toMatchObject({ assignments: [{ labProviderId: 'labcorp' }] });
  });

  it('si ninguno las hace todas: el menor número de laboratorios y, con ese número, el menor costo total', () => {
    const costs = [
      cost('labcorp', 'a1c', 1200),
      cost('labcorp', 'tsh', 1500),
      cost('cpl', 'psa', 2100),
      cost('cpl', 'a1c', 900),
      cost('quest', 'psa', 2000),
      cost('quest', 'tsh', 1400),
    ];
    // Parejas que cubren las tres: LabCorp+CPL (900+1500+2100=4500), LabCorp+Quest (1200+1400+2000=4600),
    // CPL+Quest (900+1400+2000=4300). Gana CPL+Quest, cada prueba en el más barato de los dos.
    expect(suggest({ costs })).toEqual({
      kind: 'suggested',
      assignments: [
        { labProviderId: 'quest', labTestIds: ['tsh', 'psa'], totalCents: 3400 },
        { labProviderId: 'cpl', labTestIds: ['a1c'], totalCents: 900 },
      ],
      totalCents: 4300,
      withoutLab: [],
    });
  });

  it('menos laboratorios gana aunque repartir entre más fuera más barato', () => {
    const costs = [cost('labcorp', 'a1c', 5000), cost('labcorp', 'tsh', 5000), cost('cpl', 'a1c', 100), cost('quest', 'tsh', 100)];
    expect(suggest({ labTestIds: ['a1c', 'tsh'], costs })).toMatchObject({ assignments: [{ labProviderId: 'labcorp' }], totalCents: 10_000 });
  });

  it('empate entre combinaciones: gana la que incluye el laboratorio más preferido, y así sucesivamente', () => {
    const fourth = { id: 'cuarto', name: 'Laboratorio Ficticio', preference: 4, active: true };
    const costs = [cost('labcorp', 'a1c', 1000), cost('cpl', 'a1c', 1000), cost('quest', 'tsh', 1000), cost('cuarto', 'tsh', 1000)];
    // LabCorp+Quest, LabCorp+Cuarto, CPL+Quest y CPL+Cuarto cuestan 2000; gana LabCorp (1) + Quest (2).
    expect(suggest({ labTestIds: ['a1c', 'tsh'], costs, labs: [...LABS, fourth] })).toMatchObject({
      assignments: [{ labProviderId: 'labcorp' }, { labProviderId: 'quest' }],
    });
    // Sin Quest: LabCorp (1) + Cuarto (4) gana a CPL (3) + Cuarto (4).
    expect(suggest({ labTestIds: ['a1c', 'tsh'], costs, labs: [LABCORP, CPL, { ...QUEST, active: false }, fourth] })).toMatchObject({
      assignments: [{ labProviderId: 'labcorp' }, { labProviderId: 'cuarto' }],
    });
  });

  it('un laboratorio inactivo no se considera', () => {
    expect(suggest({ labs: [CPL, QUEST, { ...LABCORP, active: false }] })).toMatchObject({
      assignments: [{ labProviderId: 'cpl', totalCents: 4900 }],
    });
  });

  it('un costo con vigencia futura todavía no cuenta; desde su fecha, sí', () => {
    const costs = [...COSTS, cost('cpl', 'tsh', 1000, '2026-12-01')]; // CPL bajaría a 900 + 1000 + 2100 = 4000.
    expect(suggest({ costs })).toMatchObject({ assignments: [{ labProviderId: 'labcorp' }], totalCents: 4500 });
    expect(suggest({ costs, date: '2026-12-01' })).toMatchObject({ assignments: [{ labProviderId: 'cpl' }], totalCents: 4000 });
    // Con la misma fecha, cuenta la última registrada.
    expect(suggest({ costs: [...costs, cost('cpl', 'tsh', 2500, '2026-12-01')], date: '2026-12-01' })).toMatchObject({
      assignments: [{ labProviderId: 'labcorp' }],
    });
  });

  it('desmarcar un laboratorio en una prueba deja de considerarlo para ella, conservando su historial', () => {
    const costs = [...COSTS, cost('labcorp', 'psa', null, '2026-11-01')];
    // Desde el 1 de noviembre LabCorp no hace PSA: el único que hace las tres es CPL.
    expect(suggest({ costs })).toEqual({
      kind: 'suggested',
      assignments: [{ labProviderId: 'cpl', labTestIds: ['a1c', 'tsh', 'psa'], totalCents: 4900 }],
      totalCents: 4900,
      withoutLab: [],
    });
    // Sin CPL, se reparten entre LabCorp y Quest… y nadie hace PSA.
    expect(suggest({ costs, labs: [LABCORP, QUEST] })).toMatchObject({
      assignments: [{ labProviderId: 'quest', labTestIds: ['a1c', 'tsh'], totalCents: 2500 }],
      withoutLab: ['psa'],
    });
    // El día anterior todavía la hacía; y volver a marcarlo lo considera de nuevo.
    expect(suggest({ costs, date: '2026-10-31' })).toMatchObject({ assignments: [{ labProviderId: 'labcorp' }] });
    expect(suggest({ costs: [...costs, cost('labcorp', 'psa', 1800, '2026-11-02')], date: '2026-11-02' })).toMatchObject({
      assignments: [{ labProviderId: 'labcorp' }],
    });
  });

  it('avisa de las pruebas sin laboratorio y sugiere para las demás', () => {
    expect(suggest({ labTestIds: ['a1c', 'strep'] })).toEqual({
      kind: 'suggested',
      assignments: [{ labProviderId: 'cpl', labTestIds: ['a1c'], totalCents: 900 }],
      totalCents: 900,
      withoutLab: ['strep'],
    });
    expect(suggest({ labTestIds: ['strep'] })).toEqual({ kind: 'suggested', assignments: [], totalCents: 0, withoutLab: ['strep'] });
    // Si su único laboratorio está inactivo, también queda sin laboratorio.
    expect(suggest({ labTestIds: ['psa'], labs: [LABCORP, { ...CPL, active: false }, QUEST], costs: [cost('cpl', 'psa', 2100)] })).toMatchObject({
      withoutLab: ['psa'],
    });
  });

  it('una prueba repetida cuenta una vez', () => {
    expect(suggest({ labTestIds: ['a1c', 'a1c'] })).toMatchObject({ totalCents: 900, assignments: [{ labTestIds: ['a1c'] }] });
  });
});

describe('laboratorios', () => {
  it('se ordenan por preferencia (1 primero) y, con la misma, por nombre', () => {
    expect([CPL, QUEST, LABCORP, { ...CPL, name: 'Alfa', preference: 3 }].sort(compareLabProviders).map((l) => l.name)).toEqual([
      'LabCorp',
      'Quest Diagnostics',
      'Alfa',
      'CPL',
    ]);
  });

  it('un guardado no repite laboratorio en los cambios de costos', () => {
    const id = '019a2000-0000-7000-8000-000000000999';
    expect(labCostChangesSchema.safeParse([{ labProviderId: id, amountCents: 100, effectiveFrom: '2026-11-01' }]).success).toBe(true);
    expect(labCostChangesSchema.safeParse([{ labProviderId: id, amountCents: null, effectiveFrom: '2026-11-01' }]).success).toBe(true);
    expect(
      labCostChangesSchema.safeParse([
        { labProviderId: id, amountCents: 100, effectiveFrom: '2026-11-01' },
        { labProviderId: id, amountCents: null, effectiveFrom: '2026-11-02' },
      ]).success,
    ).toBe(false);
    expect(labCostChangesSchema.safeParse([{ labProviderId: id, amountCents: -1, effectiveFrom: '2026-11-01' }]).success).toBe(false);
  });
});
