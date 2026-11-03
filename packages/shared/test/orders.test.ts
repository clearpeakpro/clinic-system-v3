import { describe, expect, it } from 'vitest';
import {
  autoReadyForCheckout,
  canCancelOrder,
  canChangeOrderLab,
  canOrderIn,
  createOrderSchema,
  labOrderGroups,
  linesTotalCents,
  orderPreviewSchema,
  VISIT_STATUSES,
  type LabCostRecord,
} from '../src/index.ts';

// T-025: órdenes con su cargo y laboratorio sugerido. Reglas puras.

const A1C = '00000000-0000-4000-8000-0000000000a1';
const TSH = '00000000-0000-4000-8000-0000000000a2';
const PSA = '00000000-0000-4000-8000-0000000000a3';
const STREP = '00000000-0000-4000-8000-0000000000a4';
const LABCORP = '00000000-0000-4000-8000-0000000000b1';
const QUEST = '00000000-0000-4000-8000-0000000000b2';
const CPL = '00000000-0000-4000-8000-0000000000b3';

const labs = [
  { id: LABCORP, name: 'LabCorp', preference: 1, active: true },
  { id: QUEST, name: 'Quest Diagnostics', preference: 2, active: true },
  { id: CPL, name: 'CPL', preference: 3, active: true },
];
const cost = (labTestId: string, labProviderId: string, amountCents: number | null, effectiveFrom = '2026-01-01'): LabCostRecord => ({
  labTestId,
  labProviderId,
  amountCents,
  effectiveFrom,
});
// Los de la semilla de Norte (ADR 0028): LabCorp gana el total aunque CPL sea más barato en A1c; Quest no hace PSA.
const costs = [
  cost(A1C, LABCORP, 1200),
  cost(TSH, LABCORP, 1500),
  cost(PSA, LABCORP, 1800),
  cost(A1C, CPL, 900),
  cost(TSH, CPL, 1900),
  cost(PSA, CPL, 2100),
  cost(A1C, QUEST, 1100),
  cost(TSH, QUEST, 1400),
];
const base = { labs, costs, date: '2026-11-05' };

describe('estados que aceptan órdenes (S-CLI-17)', () => {
  it('Esperando proveedor, Con proveedor y Procedimiento pendiente; Registrado solo en rutas directas', () => {
    const ok = (route: 'STANDARD' | 'LAB_ONLY') => VISIT_STATUSES.filter((s) => canOrderIn(s, route));
    expect(ok('STANDARD')).toEqual(['WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING']);
    expect(ok('LAB_ONLY')).toEqual(['CHECKED_IN', 'WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING']);
  });
});

describe('reparto en órdenes de laboratorio (ADR 0028)', () => {
  it('tres pruebas en una sola orden con el laboratorio de menor costo total', () => {
    expect(labOrderGroups({ ...base, labTestIds: [A1C, TSH, PSA], coverage: 'self_pay' })).toEqual([
      { labTestIds: [A1C, TSH, PSA], suggestedId: LABCORP, optionIds: [LABCORP, CPL] },
    ]);
  });

  it('membresía: también se sugiere', () => {
    expect(labOrderGroups({ ...base, labTestIds: [A1C], coverage: 'membership' })[0]?.suggestedId).toBe(CPL);
  });

  it('una prueba sin laboratorio va en una orden aparte, sin sugerido ni opciones («Sin laboratorio asignado»)', () => {
    expect(labOrderGroups({ ...base, labTestIds: [STREP, A1C, TSH], coverage: 'self_pay' })).toEqual([
      { labTestIds: [STREP], suggestedId: null, optionIds: [] },
      { labTestIds: [A1C, TSH], suggestedId: QUEST, optionIds: [LABCORP, QUEST, CPL] },
    ]);
  });

  it('si ninguno las hace todas, una orden por laboratorio', () => {
    const only = [cost(A1C, CPL, 900), cost(PSA, LABCORP, 1800)];
    expect(labOrderGroups({ ...base, costs: only, labTestIds: [A1C, PSA], coverage: 'self_pay' })).toEqual([
      { labTestIds: [A1C], suggestedId: CPL, optionIds: [CPL] },
      { labTestIds: [PSA], suggestedId: LABCORP, optionIds: [LABCORP] },
    ]);
  });

  it('seguro: sin sugerencia; una orden si alguno las hace todas, con esas opciones', () => {
    expect(labOrderGroups({ ...base, labTestIds: [A1C, TSH, PSA], coverage: 'insurance' })).toEqual([
      { labTestIds: [A1C, TSH, PSA], suggestedId: null, optionIds: [LABCORP, CPL] },
    ]);
  });

  it('seguro: si ninguno las hace todas, una orden por prueba', () => {
    const only = [cost(A1C, CPL, 900), cost(PSA, LABCORP, 1800)];
    expect(labOrderGroups({ ...base, costs: only, labTestIds: [A1C, PSA, STREP], coverage: 'insurance' })).toEqual([
      { labTestIds: [A1C], suggestedId: null, optionIds: [CPL] },
      { labTestIds: [PSA], suggestedId: null, optionIds: [LABCORP] },
      { labTestIds: [STREP], suggestedId: null, optionIds: [] },
    ]);
  });

  it('cuentan los costos vigentes el día de la orden y solo los laboratorios activos', () => {
    const later = [...costs, cost(A1C, CPL, null, '2026-11-06')];
    expect(labOrderGroups({ ...base, costs: later, labTestIds: [A1C], coverage: 'self_pay' })[0]?.suggestedId).toBe(CPL);
    expect(labOrderGroups({ ...base, costs: later, date: '2026-11-06', labTestIds: [A1C], coverage: 'self_pay' })[0]?.suggestedId).toBe(QUEST);
    const inactive = labs.map((l) => (l.id === CPL ? { ...l, active: false } : l));
    expect(labOrderGroups({ ...base, labs: inactive, labTestIds: [A1C], coverage: 'self_pay' })[0]).toEqual({
      labTestIds: [A1C],
      suggestedId: QUEST,
      optionIds: [LABCORP, QUEST],
    });
  });
});

describe('esquemas', () => {
  const line = (itemId: string, quantity = 1) => ({ itemId, quantity });
  it('Procedimiento e Inyección, un solo ítem; Laboratorio, varias pruebas distintas', () => {
    expect(orderPreviewSchema.safeParse({ type: 'procedure', lines: [line(A1C), line(TSH)] }).success).toBe(false);
    expect(orderPreviewSchema.safeParse({ type: 'lab', lines: [line(A1C), line(TSH)] }).success).toBe(true);
    expect(orderPreviewSchema.safeParse({ type: 'lab', lines: [line(A1C), line(A1C)] }).success).toBe(false);
  });
  it('cantidad de 1 a 1000 y notas de hasta 4000', () => {
    expect(createOrderSchema.safeParse({ type: 'injection', lines: [line(A1C, 0)] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ type: 'injection', lines: [line(A1C, 1001)] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ type: 'injection', lines: [line(A1C, 1000)], notes: 'x'.repeat(4000) }).success).toBe(true);
    expect(createOrderSchema.safeParse({ type: 'injection', lines: [line(A1C)], notes: 'x'.repeat(4001) }).success).toBe(false);
  });
  it('los grupos y el motivo del laboratorio, solo en Laboratorio', () => {
    expect(createOrderSchema.safeParse({ type: 'procedure', lines: [line(A1C)], labChangeReason: 'Motivo' }).success).toBe(false);
    expect(
      createOrderSchema.safeParse({ type: 'lab', lines: [line(A1C)], labGroups: [{ labTestIds: [A1C], labProviderId: CPL }], labChangeReason: 'Motivo' }).success,
    ).toBe(true);
  });
});

describe('quién cancela y quién cambia el laboratorio', () => {
  const order = { status: 'PENDING' as const, visitStatus: 'WITH_PROVIDER' as const, isProvider: true, orderedByMe: false, visitProviderIsMe: false };
  it('el Proveedor que la ordenó o el de la visita, con la orden y la visita abiertas', () => {
    expect(canCancelOrder(order)).toBe(false);
    expect(canCancelOrder({ ...order, orderedByMe: true })).toBe(true);
    expect(canCancelOrder({ ...order, visitProviderIsMe: true })).toBe(true);
    expect(canCancelOrder({ ...order, orderedByMe: true, isProvider: false })).toBe(false);
    expect(canCancelOrder({ ...order, orderedByMe: true, status: 'CANCELLED' })).toBe(false);
    expect(canCancelOrder({ ...order, orderedByMe: true, visitStatus: 'COMPLETED' })).toBe(false);
  });
  it('«Cambiar laboratorio…»: quien ejecuta órdenes, en una de laboratorio abierta', () => {
    const lab = { type: 'lab' as const, status: 'PENDING' as const, visitStatus: 'PROCEDURE_PENDING' as const, canExecute: true };
    expect(canChangeOrderLab(lab)).toBe(true);
    expect(canChangeOrderLab({ ...lab, type: 'procedure' })).toBe(false);
    expect(canChangeOrderLab({ ...lab, canExecute: false })).toBe(false);
    expect(canChangeOrderLab({ ...lab, status: 'COMPLETED' })).toBe(false);
  });
});

describe('paso automático a «Listo para caja»', () => {
  it('solo desde «Procedimiento pendiente» y sin órdenes abiertas, en cualquier ruta', () => {
    expect(autoReadyForCheckout('PROCEDURE_PENDING', 'STANDARD', false)).toMatchObject({ ok: true, to: 'READY_FOR_CHECKOUT' });
    expect(autoReadyForCheckout('PROCEDURE_PENDING', 'LAB_ONLY', false)).toMatchObject({ ok: true, to: 'READY_FOR_CHECKOUT' });
    expect(autoReadyForCheckout('PROCEDURE_PENDING', 'STANDARD', true)).toBeNull();
    expect(autoReadyForCheckout('WITH_PROVIDER', 'STANDARD', false)).toBeNull();
  });
});

describe('totales', () => {
  it('suma en centavos; nulo si alguna línea no tiene precio', () => {
    expect(linesTotalCents([{ amountCents: 3500 }, { amountCents: 4500 }])).toBe(8000);
    expect(linesTotalCents([{ amountCents: 3500 }, { amountCents: null }])).toBeNull();
  });
});
