import type { PatientMembershipView } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api.ts';
import { firstDueText, MEMBERSHIP_STATUS_TONES, membershipMessage, membershipNotice, membershipStatusDetail } from './memberships.ts';

// T-026b: textos de la tarjeta «Membresía» (S-PAC-22) y de la inscripción (S-PAC-23).

const base = {
  status: 'active',
  suspendedSince: null,
  overdueDueDate: null,
  benefitsEndDate: null,
  cancelledOn: null,
  cancellation: null,
} as unknown as PatientMembershipView;

describe('membresía en la web', () => {
  it('cada estado con su tono y su explicación', () => {
    expect(MEMBERSHIP_STATUS_TONES).toEqual({ pending_payment: 'warning', active: 'success', suspended: 'danger', cancelled: 'neutral' });
    expect(membershipStatusDetail(base)).toBeNull();
    expect(membershipStatusDetail({ ...base, status: 'pending_payment' })).toBe('Sin beneficios hasta que se pague la cuota inicial en Caja.');
    expect(membershipStatusDetail({ ...base, status: 'suspended', suspendedSince: '2026-12-16', overdueDueDate: '2026-12-15' })).toContain('la mensualidad del 15 dic 2026 no se ha pagado');
    expect(membershipStatusDetail({ ...base, benefitsEndDate: '2026-12-14' })).toBe('Aviso de cancelación registrado: beneficios hasta el 14 dic 2026.');
    expect(membershipStatusDetail({ ...base, status: 'cancelled', cancelledOn: '2027-01-14', cancellation: 'non_payment' })).toBe('Cancelada el 14 ene 2027: mensualidad sin pagar 30 días.');
  });

  it('la primera mensualidad y el aviso de la llegada', () => {
    expect(firstDueText('2026-11-03', 15)).toBe('Primera mensualidad: 15 dic 2026. La cuota inicial cubre hasta el día anterior.');
    expect(membershipNotice({ id: 'x', code: 'NOR1-M-000001', planName: 'Plan Esencial', startDate: '2026-11-05' })).toBe('Membresía activa: Plan Esencial (desde 5 nov 2026)');
  });

  it('mensajes de error propios', () => {
    expect(membershipMessage(new ApiError(409, 'patient_in_membership'))).toBe('Este paciente ya está en una membresía en curso.');
  });
});
