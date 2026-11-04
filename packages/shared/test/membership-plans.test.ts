import { describe, expect, it } from 'vitest';
import { createCatalogItemSchema, updateCatalogItemSchema } from '../src/catalog.ts';
import {
  createMembershipBenefitSchema,
  createMembershipPlanSchema,
  formatPercentBp,
  parsePercentBp,
  updateMembershipBenefitSchema,
  updateMembershipPlanSchema,
} from '../src/membership-plans.ts';

// T-026b parte A: reglas de los planes de membresía que comparten la web y la API.

const ITEM = '019a2000-0000-7000-8000-0000000000aa';
const fee = { initialFeeCents: 10000, monthlyFeeCents: 3900, effectiveFrom: '2026-11-04' };
const plan = { nameEs: 'Plan', nameEn: 'Plan', descriptionEs: null, descriptionEn: null, maxMembers: 1, sortOrder: null };

describe('planes de membresía', () => {
  it('el plan exige código y cuotas al crear; al editar, las cuotas son opcionales; centavos enteros y de 1 a 1000 personas', () => {
    expect(createMembershipPlanSchema.safeParse({ ...plan, code: 'ESENCIAL', fee }).success).toBe(true);
    expect(createMembershipPlanSchema.safeParse({ ...plan, code: 'ESENCIAL' }).success).toBe(false);
    expect(createMembershipPlanSchema.safeParse({ ...plan, code: 'esencial', fee }).success).toBe(false);
    expect(createMembershipPlanSchema.safeParse({ ...plan, code: 'ESENCIAL', fee: { ...fee, monthlyFeeCents: 39.5 } }).success).toBe(false);
    expect(createMembershipPlanSchema.safeParse({ ...plan, code: 'ESENCIAL', maxMembers: 0, fee }).success).toBe(false);
    expect(createMembershipPlanSchema.safeParse({ ...plan, code: 'ESENCIAL', maxMembers: 1001, fee }).success).toBe(false);
    expect(updateMembershipPlanSchema.safeParse({ ...plan, expectedVersion: 1 }).success).toBe(true);
    expect(updateMembershipPlanSchema.safeParse({ ...plan, expectedVersion: 1, fee }).success).toBe(true);
  });

  it('cada tipo de beneficio con sus campos: el incluido, con uno o más servicios sin repetir; el descuento, de 0 a 100 %', () => {
    const included = { type: 'included', nameEs: 'Consulta', nameEn: 'Visit', quantityPerYear: 3, includesSameVisitLabs: false, sortOrder: null };
    expect(createMembershipBenefitSchema.safeParse({ ...included, items: [{ kind: 'consultations', id: ITEM }] }).success).toBe(true);
    expect(createMembershipBenefitSchema.safeParse({ ...included, items: [] }).success).toBe(false);
    expect(
      createMembershipBenefitSchema.safeParse({
        ...included,
        items: [
          { kind: 'consultations', id: ITEM },
          { kind: 'consultations', id: ITEM },
        ],
      }).success,
    ).toBe(false);
    expect(createMembershipBenefitSchema.safeParse({ ...included, quantityPerYear: 0, items: [{ kind: 'lab-tests', id: ITEM }] }).success).toBe(false);
    expect(createMembershipBenefitSchema.safeParse({ ...included, items: [{ kind: 'referral-sources', id: ITEM }] }).success).toBe(false);
    const discount = { type: 'discount', category: 'lab', discountBp: 2500, sortOrder: null };
    expect(createMembershipBenefitSchema.safeParse(discount).success).toBe(true);
    expect(createMembershipBenefitSchema.safeParse({ ...discount, discountBp: 10_001 }).success).toBe(false);
    expect(createMembershipBenefitSchema.safeParse({ ...discount, discountBp: 12.5 }).success).toBe(false);
    expect(createMembershipBenefitSchema.safeParse({ ...discount, category: 'otra' }).success).toBe(false);
    expect(updateMembershipBenefitSchema.safeParse({ ...discount, expectedVersion: 2 }).success).toBe(true);
    expect(updateMembershipBenefitSchema.safeParse(discount).success).toBe(false);
  });

  it('el porcentaje se escribe con hasta dos decimales y se guarda en centésimas de punto, sin coma flotante', () => {
    expect(parsePercentBp('25')).toBe(2500);
    expect(parsePercentBp('12.5')).toBe(1250);
    expect(parsePercentBp('15.00')).toBe(1500);
    expect(parsePercentBp(' 0.07 ')).toBe(7);
    expect(parsePercentBp('100')).toBe(10_000);
    for (const bad of ['100.01', '101', '-5', '12,5', '1.234', '', 'abc', '5%']) expect(parsePercentBp(bad), bad).toBeNull();
    expect(formatPercentBp(1500)).toBe('15.00 %');
    expect(formatPercentBp(1250)).toBe('12.50 %');
    expect(formatPercentBp(7)).toBe('0.07 %');
    expect(formatPercentBp(10_000)).toBe('100.00 %');
  });

  it('las consultas tienen precio; la categoría de membresía, solo en procedimientos y pruebas, es opcional y de la lista', () => {
    const generalPrice = { amountCents: 6000, effectiveFrom: '2026-11-04' };
    expect(createCatalogItemSchema('consultations').safeParse({ code: 'CONS-1', name: 'Consulta', sortOrder: null, generalPrice }).success).toBe(true);
    expect(createCatalogItemSchema('consultations').safeParse({ code: 'CONS-1', name: 'Consulta', sortOrder: null }).success).toBe(false);
    const procedure = { code: 'P-1', name: 'P', sortOrder: null, kind: 'procedure', generalPrice };
    expect(createCatalogItemSchema('procedures').safeParse(procedure).success).toBe(true);
    expect(createCatalogItemSchema('procedures').safeParse({ ...procedure, membershipCategory: 'minor_procedure' }).success).toBe(true);
    expect(createCatalogItemSchema('procedures').safeParse({ ...procedure, membershipCategory: null }).success).toBe(true);
    expect(createCatalogItemSchema('procedures').safeParse({ ...procedure, membershipCategory: 'otra' }).success).toBe(false);
    expect(updateCatalogItemSchema('lab-tests').safeParse({ name: 'L', sortOrder: null, expectedVersion: 1, membershipCategory: 'lab' }).success).toBe(true);
    // Las consultas no llevan categoría editable: el campo se descarta.
    expect(createCatalogItemSchema('consultations').safeParse({ code: 'CONS-1', name: 'C', sortOrder: null, generalPrice, membershipCategory: 'lab' }).data).not.toHaveProperty(
      'membershipCategory',
    );
  });
});
