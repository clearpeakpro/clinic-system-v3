// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { errorMessage } from '../src/errors.ts';

// S-GEN-28: el texto sale del código y del estado, nunca del mensaje técnico.

describe('errorMessage', () => {
  it('por código', () => {
    expect(errorMessage({ status: 401, code: 'session_expired' })).toBe('Su sesión expiró. Inicie sesión de nuevo.');
    expect(errorMessage({ status: 403, code: 'not_a_member' })).toBe('No está autorizado para esta sede.');
    expect(errorMessage({ status: 409, code: 'account_exists' })).toBe('Este registro ya existe.');
  });

  it('por estado', () => {
    expect(errorMessage({ status: 400, code: 'invalid_request' })).toBe('Algunos campos no son válidos. Revíselos.');
    expect(errorMessage({ status: 403, code: 'forbidden' })).toBe('No tiene permiso para realizar esta acción.');
    expect(errorMessage({ status: 404, code: 'not_found' })).toBe('No se encontró el registro solicitado.');
    expect(errorMessage({ status: 409, code: 'http_409' })).toBe('Este registro fue actualizado por otro usuario. Actualice para continuar.');
    expect(errorMessage({ status: 503, code: 'http_503' })).toBe(
      'Un servicio del sistema no está disponible temporalmente. Intente de nuevo en un momento.',
    );
    expect(errorMessage({ status: 500, code: 'internal_error' })).toBe('Ocurrió un error inesperado. Intente de nuevo.');
  });

  it('límite de intentos con y sin Retry-After', () => {
    expect(errorMessage({ status: 429, code: 'too_many_attempts', retryAfterSeconds: 12 })).toBe('Demasiados intentos. Intente de nuevo en 12 segundos.');
    expect(errorMessage({ status: 429, code: 'too_many_attempts' })).toBe('Demasiados intentos. Intente de nuevo en unos segundos.');
  });

  it('sin red y desconocidos, sin mostrar el mensaje técnico', () => {
    expect(errorMessage(new TypeError('fetch failed'))).toBe('No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.');
    expect(errorMessage(new Error('stack técnico con datos'))).toBe('Ocurrió un error inesperado. Intente de nuevo.');
  });
});
