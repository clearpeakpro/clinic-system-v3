import type { LabGroupPreview, OrderView } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api.ts';
import { chosenLab, filterOrderables, isNotOrderable, labChanged, labGroupsInput, orderMessage, personText, quantityError, visibleOrders } from './orders.ts';

// T-025: textos y borrador de «Nueva orden» (S-CLI-18) y la sección Órdenes (S-CLI-17).

describe('cantidad (S-CLI-18)', () => {
  it('entero de 1 a 1000, con los textos del manual', () => {
    expect(quantityError('1')).toBeNull();
    expect(quantityError('1000')).toBeNull();
    expect(quantityError('1.5')).toBe('Ingrese un número entero.');
    expect(quantityError('')).toBe('Ingrese un número entero.');
    expect(quantityError('0')).toBe('La cantidad debe estar entre 1 y 1000.');
    expect(quantityError('1001')).toBe('La cantidad debe estar entre 1 y 1000.');
  });
});

describe('buscador', () => {
  const items = [
    { id: '1', code: 'LAB-A1C', name: 'Hemoglobina A1c', unitPriceCents: 3500 },
    { id: '2', code: 'LAB-TSH', name: 'Perfil tiroideo (TSH)', unitPriceCents: null },
    { id: '3', code: 'PROC-LAVOT', name: 'Lavado ótico', unitPriceCents: 3000 },
  ];
  it('por código o nombre, sin mayúsculas ni acentos', () => {
    expect(filterOrderables(items, 'tsh').map((i) => i.id)).toEqual(['2']);
    expect(filterOrderables(items, 'OTICO').map((i) => i.id)).toEqual(['3']);
    expect(filterOrderables(items, '  ')).toHaveLength(3);
  });
});

describe('laboratorio del borrador (ADR 0028)', () => {
  const quest = { id: 'q', name: 'Quest Diagnostics' };
  const labcorp = { id: 'l', name: 'LabCorp' };
  const suggested: LabGroupPreview = { labTestIds: ['b', 'a'], suggested: quest, options: [labcorp, quest] };
  const insurance: LabGroupPreview = { labTestIds: ['c'], suggested: null, options: [labcorp] };
  it('sin elección, el sugerido; cambiarlo exige motivo; con seguro elegir no es cambiar', () => {
    expect(chosenLab(suggested, {})).toBe('q');
    expect(labChanged([suggested, insurance], {})).toBe(false);
    expect(labChanged([suggested, insurance], { 'a,b': 'l' })).toBe(true);
    expect(labChanged([suggested, insurance], { c: 'l' })).toBe(false);
    expect(labChanged([suggested], { 'a,b': null })).toBe(true);
    expect(labGroupsInput([suggested, insurance], { c: 'l' })).toEqual([
      { labTestIds: ['b', 'a'], labProviderId: 'q' },
      { labTestIds: ['c'], labProviderId: 'l' },
    ]);
  });
});

describe('sección Órdenes', () => {
  const order = (status: OrderView['status']) => ({ status }) as OrderView;
  it('las canceladas se ocultan salvo con el conmutador', () => {
    const list = [order('PENDING'), order('CANCELLED')];
    expect(visibleOrders(list, false)).toHaveLength(1);
    expect(visibleOrders(list, true)).toHaveLength(2);
  });
  it('quién: «Usted», el nombre o «Miembro del personal»; sin asignar', () => {
    expect(personText({ kind: 'me', name: null })).toBe('Usted');
    expect(personText({ kind: 'user', name: 'Dra. Ficticia' })).toBe('Dra. Ficticia');
    expect(personText({ kind: 'user', name: null })).toBe('Miembro del personal');
    expect(personText(null)).toBe('Sin asignar');
  });
  it('mensajes del servidor en «usted»', () => {
    expect(orderMessage(new ApiError(403, 'order_not_owned'))).toContain('Solo el proveedor');
    expect(isNotOrderable(new ApiError(409, 'encounter_not_orderable'))).toBe(true);
  });
});
