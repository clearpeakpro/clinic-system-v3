// @vitest-environment node
import { readFileSync } from 'node:fs';
import { argbFromHex, Contrast, Hct } from '@material/material-color-utilities';
import { describe, expect, it } from 'vitest';
import { AGENDA_LIGHT, readStitchDesign, render, STATUS_LIGHT } from '../scripts/derive-dark.ts';

// T-004. Los tokens no se desvían de Stitch, el archivo generado está al día y
// los pares de texto cumplen contraste WCAG AA (4.5:1) en claro y oscuro.

const generated = readFileSync(new URL('../src/palette.generated.css', import.meta.url), 'utf8');

function blockOf(selector: ':root' | '.dark'): Record<string, string> {
  const start = generated.indexOf(`${selector} {`);
  const body = generated.slice(start, generated.indexOf('}', start));
  const result: Record<string, string> = {};
  for (const [, name, hex] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/g)) {
    if (name && hex) result[name] = hex;
  }
  return result;
}

const ratio = (a: string | undefined, b: string | undefined) => {
  if (!a || !b) throw new Error('color ausente');
  return Contrast.ratioOfTones(Hct.fromInt(argbFromHex(a)).tone, Hct.fromInt(argbFromHex(b)).tone);
};

describe('tokens de diseño', () => {
  it('palette.generated.css está al día (regenerar con pnpm --filter @clinic/ui tokens:palette)', () => {
    expect(generated.replace(/\r\n/g, '\n')).toBe(render());
  });

  it('el modo claro es exactamente el YAML de DESIGN.md', () => {
    const light = blockOf(':root');
    const { colors } = readStitchDesign();
    expect(Object.keys(colors)).toHaveLength(47);
    for (const [role, hex] of Object.entries(colors)) expect(light[`md-${role}`], role).toBe(hex);
  });

  it('el modo oscuro tiene los mismos roles', () => {
    const dark = blockOf('.dark');
    for (const role of Object.keys(readStitchDesign().colors)) expect(dark[`md-${role}`], role).toMatch(/^#[0-9a-f]{6}$/);
  });

  const TEXT_PAIRS = [
    ['on-surface', 'surface'],
    ['on-surface-variant', 'surface'],
    ['on-surface', 'surface-container-lowest'],
    ['on-primary', 'primary'],
    ['on-primary-container', 'primary-container'],
    ['on-secondary', 'secondary'],
    ['on-error', 'error'],
    ['on-error-container', 'error-container'],
    ['inverse-on-surface', 'inverse-surface'],
  ] as const;

  for (const mode of [':root', '.dark'] as const) {
    it(`contraste AA de los pares de texto (${mode === ':root' ? 'claro' : 'oscuro'})`, () => {
      const c = blockOf(mode);
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(ratio(c[`md-${fg}`], c[`md-${bg}`]), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const name of Object.keys(STATUS_LIGHT)) {
        expect(ratio(c[`status-${name}`], c[`status-${name}-container`]), `estado ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  // T-011: la franja de color de la agenda es un elemento gráfico (WCAG 1.4.11):
  // 3:1 contra las superficies de las tarjetas, en claro y en oscuro.
  for (const mode of [':root', '.dark'] as const) {
    it(`contraste 3:1 de los colores de la agenda (${mode === ':root' ? 'claro' : 'oscuro'})`, () => {
      const c = blockOf(mode);
      for (const name of Object.keys(AGENDA_LIGHT)) {
        for (const surface of ['surface-container-lowest', 'surface-container-low', 'surface']) {
          expect(ratio(c[`agenda-${name}`], c[`md-${surface}`]), `${name} sobre ${surface}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
});
