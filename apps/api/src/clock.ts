// Reloj inyectable (reglas de la fase 3, docs/tasks/FASE-3.md): la API lee la
// hora de aquí y las pruebas lo fijan. Desde T-017 lo usan la llegada y la
// visita; el código anterior sigue usando la hora de Postgres o de Node.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Reloj de prueba: fijo, y se puede mover. */
export class FixedClock implements Clock {
  #now: Date;
  constructor(now: Date | string) {
    this.#now = new Date(now);
  }
  now(): Date {
    return new Date(this.#now);
  }
  set(now: Date | string): void {
    this.#now = new Date(now);
  }
}
