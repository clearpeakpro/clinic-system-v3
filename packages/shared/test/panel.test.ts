import { describe, expect, it } from 'vitest';
import { DEFAULT_WAIT_ALERT_MINUTES, DEFAULT_WAIT_CRITICAL_MINUTES, WAIT_ALERT_STATUSES, waitLevel } from '../src/panel.ts';
import { VISIT_STATUSES } from '../src/visit.ts';

// ADR 0039: «Alerta» a los 5 min y «Crítico» a los 10 min en un estado de
// espera, desde que la visita entró en su estado actual. Reloj fijado justo
// antes y justo después de cada umbral.

const since = '2026-11-02T15:00:00.000Z';
const at = (minutes: number, seconds = 0) => new Date(since).getTime() + minutes * 60_000 + seconds * 1000;
const defaults = { alertMinutes: DEFAULT_WAIT_ALERT_MINUTES, criticalMinutes: DEFAULT_WAIT_CRITICAL_MINUTES };

describe('waitLevel', () => {
  it('usa 5 y 10 minutos por defecto', () => {
    expect(defaults).toEqual({ alertMinutes: 5, criticalMinutes: 10 });
  });

  it.each(WAIT_ALERT_STATUSES)('%s: sin marca, «Alerta» y «Crítico» en los umbrales', (status) => {
    const row = { status, statusSince: since };
    expect(waitLevel(row, at(0), defaults)).toBe('none');
    expect(waitLevel(row, at(4, 59), defaults)).toBe('none');
    expect(waitLevel(row, at(5), defaults)).toBe('alert');
    expect(waitLevel(row, at(5, 1), defaults)).toBe('alert');
    expect(waitLevel(row, at(9, 59), defaults)).toBe('alert');
    expect(waitLevel(row, at(10), defaults)).toBe('critical');
    expect(waitLevel(row, at(10, 1), defaults)).toBe('critical');
    expect(waitLevel(row, at(180), defaults)).toBe('critical');
  });

  it('no aplica en estados en atención, en Caja ni en visitas cerradas', () => {
    const others = VISIT_STATUSES.filter((s) => !WAIT_ALERT_STATUSES.includes(s));
    expect(others).toEqual(['WITH_NURSE', 'WITH_PROVIDER', 'PROCEDURE_PENDING', 'READY_FOR_CHECKOUT', 'CHECKOUT', 'COMPLETED', 'LEFT_EARLY', 'CANCELLED']);
    for (const status of others) expect(waitLevel({ status, statusSince: since }, at(60), defaults)).toBe('none');
  });

  it('respeta la configuración de la organización', () => {
    const row = { status: 'WAITING_FOR_PROVIDER' as const, statusSince: since };
    const custom = { alertMinutes: 15, criticalMinutes: 30 };
    expect(waitLevel(row, at(14, 59), custom)).toBe('none');
    expect(waitLevel(row, at(15), custom)).toBe('alert');
    expect(waitLevel(row, at(29, 59), custom)).toBe('alert');
    expect(waitLevel(row, at(30), custom)).toBe('critical');
  });

  it('un reloj del dispositivo atrasado no da tiempos negativos ni marcas', () => {
    expect(waitLevel({ status: 'CHECKED_IN', statusSince: since }, at(-3), defaults)).toBe('none');
  });
});
