// Reloj de inactividad (S-GEN-20). Lógica pura, sin DOM, para poder probarla.
//
//  - Solo cuenta la interacción real del usuario (la registra el componente).
//  - El aviso aparece 60 s antes del límite; con el aviso abierto solo cuentan
//    sus botones.
//  - El tiempo en segundo plano cuenta: el estado se calcula con la hora real
//    cada vez que se consulta.

export const WARNING_SECONDS = 60;

export type IdlePhase = { phase: 'active' } | { phase: 'warning'; secondsLeft: number } | { phase: 'expired' };

export class IdleClock {
  readonly #limitMs: number;
  #lastActivity: number;

  constructor(limitSeconds: number, now: number) {
    this.#limitMs = limitSeconds * 1000;
    this.#lastActivity = now;
  }

  /** Interacción real. No cuenta si el aviso ya está abierto (solo sus botones). */
  activity(now: number): void {
    if (this.state(now).phase === 'active') this.#lastActivity = now;
  }

  /** «Mantener la sesión»: reinicia el periodo aunque el aviso esté abierto. */
  keepAlive(now: number): void {
    if (this.state(now).phase !== 'expired') this.#lastActivity = now;
  }

  state(now: number): IdlePhase {
    const remainingMs = this.#lastActivity + this.#limitMs - now;
    if (remainingMs <= 0) return { phase: 'expired' };
    if (remainingMs <= WARNING_SECONDS * 1000) return { phase: 'warning', secondsLeft: Math.ceil(remainingMs / 1000) };
    return { phase: 'active' };
  }
}

/** «Su sesión se cerrará en {N} segundos» (singular «1 segundo»). */
export function secondsText(n: number): string {
  return n === 1 ? '1 segundo' : `${String(n)} segundos`;
}
