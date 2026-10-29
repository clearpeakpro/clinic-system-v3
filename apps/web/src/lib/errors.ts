import { ApiError } from './api.ts';

// Texto para los errores que una pantalla no prevé con un código propio.
// Distingue tres casos que antes se mostraban todos como «Revise su conexión»:
//  - sin conexión: fetch rechaza con TypeError y la petición no llegó;
//  - demasiados intentos: 429 (límite por IP o por cuenta);
//  - error del servidor: 5xx (la petición llegó y el servidor falló, o el
//    proxy no alcanzó la API: 502, 503 y 504).

export type FailureKind = 'network' | 'rate_limited' | 'unavailable' | 'server' | 'other';

export function failureKind(error: unknown): FailureKind {
  if (error instanceof TypeError) return 'network';
  if (!(error instanceof ApiError)) return 'other';
  if (error.status === 429) return 'rate_limited';
  if (error.status === 502 || error.status === 503 || error.status === 504) return 'unavailable';
  if (error.status >= 500) return 'server';
  return 'other';
}

/** `action` completa «No se pudo …» (p. ej. «iniciar sesión»). */
export function failureMessage(error: unknown, action: string): string {
  switch (failureKind(error)) {
    case 'network':
      return 'No se pudo conectar con el servidor. Revise su conexión e inténtelo de nuevo.';
    case 'rate_limited': {
      const seconds = error instanceof ApiError ? error.retryAfterSeconds : undefined;
      return seconds
        ? `Demasiados intentos. Inténtelo de nuevo en ${String(seconds)} segundos.`
        : 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.';
    }
    case 'unavailable':
      return 'El servidor no está disponible en este momento. Inténtelo de nuevo en unos minutos.';
    case 'server':
      return `El servidor tuvo un error y no se pudo ${action}. Inténtelo de nuevo; si se repite, avise al soporte.`;
    case 'other':
      return `No se pudo ${action}. Inténtelo de nuevo.`;
  }
}
