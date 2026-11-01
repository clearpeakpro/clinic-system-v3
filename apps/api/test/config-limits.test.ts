import { describe, expect, it } from 'vitest';
import { loadConfig, PRODUCTION_IP_LIMIT_MAX } from '../src/config.ts';

// ADR 0023: en producción la API no arranca con un límite por IP mayor que
// 100 (inicio de sesión o /two-factor/*). Solo las E2E usan uno holgado.
// Valores ficticios.

const SECRET = 'x'.repeat(32);
const base = {
  DATABASE_APP_URL: 'postgres://clinic_app:ficticia@127.0.0.1:5432/clinic',
  BETTER_AUTH_SECRET: SECRET,
  AUDIT_HMAC_KEY: SECRET,
  OUTBOX_KEY: SECRET,
  FIELD_ENCRYPTION_KEY: SECRET,
};
const production = { ...base, NODE_ENV: 'production', BASE_URL: 'https://clinica.example.test' };

describe('límites por IP en producción', () => {
  it('los valores por defecto y el tope arrancan', () => {
    expect(loadConfig(production).signInIpMaxAttempts).toBe(30);
    const atMax = String(PRODUCTION_IP_LIMIT_MAX);
    const config = loadConfig({ ...production, SIGN_IN_IP_MAX_ATTEMPTS: atMax, TWO_FACTOR_IP_MAX_ATTEMPTS: atMax });
    expect(config.signInIpMaxAttempts).toBe(100);
    expect(config.twoFactorIpMaxAttempts).toBe(100);
  });

  it('el de inicio de sesión mayor que 100 no arranca, con un mensaje claro', () => {
    expect(() => loadConfig({ ...production, SIGN_IN_IP_MAX_ATTEMPTS: '101' })).toThrow(
      'Configuración inválida: SIGN_IN_IP_MAX_ATTEMPTS no puede ser mayor que 100 en producción (ADR 0023). Un límite holgado solo se usa en las pruebas E2E.',
    );
  });

  it('el de /two-factor/* mayor que 100 no arranca; con los dos, los nombra a ambos', () => {
    expect(() => loadConfig({ ...production, TWO_FACTOR_IP_MAX_ATTEMPTS: '1000' })).toThrow(/^Configuración inválida: TWO_FACTOR_IP_MAX_ATTEMPTS no puede/);
    expect(() => loadConfig({ ...production, SIGN_IN_IP_MAX_ATTEMPTS: '1000', TWO_FACTOR_IP_MAX_ATTEMPTS: '1000' })).toThrow(
      'Configuración inválida: SIGN_IN_IP_MAX_ATTEMPTS y TWO_FACTOR_IP_MAX_ATTEMPTS no pueden ser mayor que 100 en producción',
    );
  });

  it('fuera de producción (E2E) se permite un límite holgado', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'test', BASE_URL: 'http://127.0.0.1:4173', SIGN_IN_IP_MAX_ATTEMPTS: '1000', TWO_FACTOR_IP_MAX_ATTEMPTS: '1000' });
    expect(config.signInIpMaxAttempts).toBe(1000);
  });

  it('el mensaje nombra la variable, nunca su valor', () => {
    let message = '';
    try {
      loadConfig({ ...production, SIGN_IN_IP_MAX_ATTEMPTS: '98765' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SIGN_IN_IP_MAX_ATTEMPTS');
    expect(message).not.toContain('98765');
  });
});
