import { describe, expect, it } from 'vitest';
import { ApiError } from './api.ts';
import { failureKind, failureMessage } from './errors.ts';

describe('failureMessage', () => {
  it('distingue la falta de conexión, el límite de intentos y el error del servidor', () => {
    expect(failureKind(new TypeError('Failed to fetch'))).toBe('network');
    expect(failureKind(new ApiError(429, 'too_many_attempts'))).toBe('rate_limited');
    expect(failureKind(new ApiError(500, 'http_500'))).toBe('server');
    expect(failureKind(new ApiError(502, 'http_502'))).toBe('unavailable');
    expect(failureKind(new ApiError(400, 'invalid_input'))).toBe('other');

    expect(failureMessage(new TypeError('Failed to fetch'), 'iniciar sesión')).toMatch(/Revise su conexión/);
    expect(failureMessage(new ApiError(500, 'http_500'), 'iniciar sesión')).toBe(
      'El servidor tuvo un error y no se pudo iniciar sesión. Inténtelo de nuevo; si se repite, avise al soporte.',
    );
    expect(failureMessage(new ApiError(500, 'http_500'), 'iniciar sesión')).not.toMatch(/conexión/);
    expect(failureMessage(new ApiError(429, 'x', 30), 'iniciar sesión')).toBe('Demasiados intentos. Inténtelo de nuevo en 30 segundos.');
    expect(failureMessage(new ApiError(429, 'x'), 'iniciar sesión')).toMatch(/^Demasiados intentos/);
  });
});
