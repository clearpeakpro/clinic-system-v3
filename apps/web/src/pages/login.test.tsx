import { cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api.ts';
import { MfaEnroll } from './login.tsx';

// Fallo encontrado en la demo de la fase 1: en desarrollo, React monta dos
// veces la pantalla de inscripción (S-GEN-07) y se pedían dos inscripciones a
// la vez, con secretos distintos. Debe pedirse una sola.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('inscripción del MFA (S-GEN-07)', () => {
  it('pide una sola inscripción aunque React monte la pantalla dos veces', () => {
    const enable = vi.spyOn(api, 'enableTotp').mockReturnValue(new Promise(() => undefined));
    render(
      <StrictMode>
        <MfaEnroll password={{ current: 'una contraseña ficticia' }} onEnrolled={vi.fn()} />
      </StrictMode>,
    );
    expect(enable).toHaveBeenCalledTimes(1);
  });
});
