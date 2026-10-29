import { describe, expect, it } from 'vitest';
import type { InvitationRow, MemberRow } from './api.ts';
import { lastAccessLabel, roleSummary, userCounts } from './users.ts';

const TZ = 'America/Chicago';

describe('usuarios', () => {
  it('«Último acceso»: hoy, ayer, otra fecha o nunca, en la zona de la sede', () => {
    // 28 oct 2026, 9:00 a. m. en Chicago (CDT, UTC-5).
    const now = Date.parse('2026-10-28T14:00:00Z');
    expect(lastAccessLabel(null, now, TZ)).toBe('Nunca');
    expect(lastAccessLabel('2026-10-28T12:45:00Z', now, TZ)).toBe('Hoy, 7:45 a. m.');
    expect(lastAccessLabel('2026-10-27T23:10:00Z', now, TZ)).toBe('Ayer, 6:10 p. m.');
    // 00:30 UTC del 28 es aún el 27 en Chicago: «Ayer».
    expect(lastAccessLabel('2026-10-28T00:30:00Z', now, TZ)).toBe('Ayer, 7:30 p. m.');
    expect(lastAccessLabel('2026-10-25T20:15:00Z', now, TZ)).toBe('25 oct 2026, 3:15 p. m.');
  });

  it('«Ayer» también el día después del cambio de hora', () => {
    // 2 nov 2026, 0:30 a. m. CST; el 1 de noviembre tuvo 25 horas.
    const now = Date.parse('2026-11-02T06:30:00Z');
    expect(lastAccessLabel('2026-11-01T05:30:00Z', now, TZ)).toBe('Ayer, 12:30 a. m.');
  });

  it('totales de la lista completa', () => {
    const member = (status: 'active' | 'inactive') => ({ kind: 'member', status }) as MemberRow;
    const invitation = { kind: 'invitation' } as InvitationRow;
    expect(userCounts([member('active'), member('active'), member('inactive'), invitation])).toEqual({ total: 4, active: 2, invited: 1, disabled: 1 });
  });

  it('roles bajo el nombre, en el orden del catálogo', () => {
    expect(
      roleSummary([
        { role: 'proveedor', locationId: 'a' },
        { role: 'recepcion', locationId: 'a' },
        { role: 'recepcion', locationId: 'b' },
      ]),
    ).toBe('Recepción · Proveedor');
  });
});
