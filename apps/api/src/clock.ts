// El reloj inyectable vive en @clinic/shared (T-020): lo comparten la API y el worker.
export { FixedClock, systemClock, type Clock } from '@clinic/shared';
