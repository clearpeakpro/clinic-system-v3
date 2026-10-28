import { describe, expect, it } from 'vitest';
import { IdleClock, secondsText, WARNING_SECONDS } from './idle.ts';

// S-GEN-20: aviso 60 s antes del límite; con el aviso abierto solo cuentan sus botones.

const LIMIT = 15 * 60;
const t0 = 1_000_000;
const at = (seconds: number) => t0 + seconds * 1000;

describe('reloj de inactividad', () => {
  it('activo hasta 60 s antes del límite, aviso con cuenta regresiva y luego vencido', () => {
    const clock = new IdleClock(LIMIT, t0);
    expect(clock.state(at(LIMIT - WARNING_SECONDS - 1))).toEqual({ phase: 'active' });
    expect(clock.state(at(LIMIT - 60))).toEqual({ phase: 'warning', secondsLeft: 60 });
    expect(clock.state(at(LIMIT - 1))).toEqual({ phase: 'warning', secondsLeft: 1 });
    expect(clock.state(at(LIMIT))).toEqual({ phase: 'expired' });
  });

  it('la interacción reinicia el periodo', () => {
    const clock = new IdleClock(LIMIT, t0);
    clock.activity(at(600));
    expect(clock.state(at(600 + LIMIT - 61))).toEqual({ phase: 'active' });
  });

  it('con el aviso abierto, la interacción general no cuenta; «Mantener la sesión» sí', () => {
    const clock = new IdleClock(LIMIT, t0);
    clock.activity(at(LIMIT - 30));
    expect(clock.state(at(LIMIT - 30)).phase).toBe('warning');
    clock.keepAlive(at(LIMIT - 30));
    expect(clock.state(at(LIMIT - 30)).phase).toBe('active');
  });

  it('una vez vencido, nada lo reabre', () => {
    const clock = new IdleClock(LIMIT, t0);
    clock.keepAlive(at(LIMIT + 5));
    expect(clock.state(at(LIMIT + 5))).toEqual({ phase: 'expired' });
  });

  it('el tiempo en segundo plano cuenta (se calcula con la hora real al consultar)', () => {
    const clock = new IdleClock(LIMIT, t0);
    expect(clock.state(at(LIMIT * 3))).toEqual({ phase: 'expired' });
  });

  it('singular y plural', () => {
    expect(secondsText(1)).toBe('1 segundo');
    expect(secondsText(42)).toBe('42 segundos');
  });
});
