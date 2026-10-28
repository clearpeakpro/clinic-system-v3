// Genera src/palette.generated.css (T-004).
//
//  - Modo claro: los 47 roles de color del bloque YAML de DESIGN.md de Stitch,
//    tal cual (decisión: el YAML manda sobre la prosa del documento).
//  - Modo oscuro: Stitch no trae paleta oscura. Se DERIVA con
//    material-color-utilities desde la semilla #0F766E: se prueban las
//    variantes de esquema de Material 3, se elige la que mejor reproduce el
//    YAML claro y se toma su versión oscura con los mismos nombres de rol.
//  - Estados de la visita: solo están en la prosa de DESIGN.md (claro). El
//    oscuro se deriva de la paleta tonal de cada color.
//
// Uso: pnpm --filter @clinic/ui tokens:palette  (no se edita el CSS a mano)

import { readFileSync } from 'node:fs';
import {
  argbFromHex,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeContent,
  SchemeFidelity,
  SchemeNeutral,
  SchemeTonalSpot,
  SchemeVibrant,
  TonalPalette,
} from '@material/material-color-utilities';
import { parse } from 'yaml';

export const SEED = '#0f766e';
export const DESIGN_MD = new URL('../../../design/stitch/generales/S-GEN-03_iniciar_sesion/DESIGN.md', import.meta.url);

/** Colores de estado de la visita: prosa de DESIGN.md, «Status Badges & Chips». */
export const STATUS_LIGHT = {
  waiting: { fg: '#b54708', bg: '#fef0c7', border: '#fedf89' },
  'in-care': { fg: '#175cd3', bg: '#eff8ff', border: '#b2ddff' },
  checkout: { fg: '#6941c6', bg: '#f9f5ff', border: '#e9d7fe' },
  completed: { fg: '#067647', bg: '#ecfdf3', border: '#a6f4c5' },
  registered: { fg: '#475467', bg: '#f2f4f7', border: '#eaecf0' },
  // La prosa no da borde para «Se retiró»: se usa el de «Registrado».
  departed: { fg: '#667085', bg: '#f8f9fa', border: '#eaecf0' },
} as const;

interface TypeStyle {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing?: string;
}

export interface StitchDesign {
  colors: Record<string, string>;
  typography: Record<string, TypeStyle>;
  spacing: Record<string, string>;
}

export function readStitchDesign(): StitchDesign {
  const text = readFileSync(DESIGN_MD, 'utf8');
  const front = text.split(/^---\s*$/m)[1];
  if (!front) throw new Error('DESIGN.md sin bloque YAML');
  const data = parse(front) as StitchDesign;
  return {
    colors: Object.fromEntries(Object.entries(data.colors).map(([k, v]) => [k, v.toLowerCase()])),
    typography: data.typography,
    spacing: data.spacing,
  };
}

export function readStitchColors(): Record<string, string> {
  return readStitchDesign().colors;
}

const camel = (role: string) => role.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Cualquiera de las variantes de esquema probadas. */
type Scheme = InstanceType<(typeof VARIANTS)[keyof typeof VARIANTS]>;

function roleHex(scheme: Scheme, role: string): string {
  const colors = new MaterialDynamicColors() as unknown as Record<string, (() => { getArgb(s: Scheme): number }) | undefined>;
  const fn = colors[camel(role)];
  if (typeof fn !== 'function') throw new Error(`Rol sin equivalente en Material: ${role}`);
  return hexFromArgb(fn.call(colors).getArgb(scheme));
}

function distance(a: string, b: string): number {
  const pa = argbFromHex(a);
  const pb = argbFromHex(b);
  let d = 0;
  for (const shift of [16, 8, 0]) d += Math.abs(((pa >> shift) & 255) - ((pb >> shift) & 255));
  return d;
}

const VARIANTS = {
  tonalSpot: SchemeTonalSpot,
  content: SchemeContent,
  fidelity: SchemeFidelity,
  vibrant: SchemeVibrant,
  neutral: SchemeNeutral,
} as const;

export function chooseVariant(light: Record<string, string>) {
  const source = Hct.fromInt(argbFromHex(SEED));
  const scores = Object.entries(VARIANTS).map(([name, Ctor]) => {
    const scheme = new Ctor(source, false, 0);
    const total = Object.entries(light).reduce((sum, [role, hex]) => sum + distance(roleHex(scheme, role), hex), 0);
    return { name, Ctor, score: total };
  });
  scores.sort((a, b) => a.score - b.score);
  const best = scores[0];
  if (!best) throw new Error('sin variantes');
  return { best, scores };
}

export function deriveDark(light: Record<string, string>) {
  const { best, scores } = chooseVariant(light);
  const dark = new best.Ctor(Hct.fromInt(argbFromHex(SEED)), true, 0);
  const colors = Object.fromEntries(Object.keys(light).map((role) => [role, roleHex(dark, role)]));
  return { variant: best.name, scores: scores.map((s) => `${s.name}=${String(s.score)}`), colors };
}

/** Estados en oscuro: misma tonalidad, tonos de Material (texto claro sobre fondo oscuro). */
export function deriveStatusDark() {
  return Object.fromEntries(
    Object.entries(STATUS_LIGHT).map(([name, c]) => {
      const palette = TonalPalette.fromInt(argbFromHex(c.fg));
      return [name, { fg: hexFromArgb(palette.tone(80)), bg: hexFromArgb(palette.tone(20)), border: hexFromArgb(palette.tone(35)) }];
    }),
  ) as Record<keyof typeof STATUS_LIGHT, { fg: string; bg: string; border: string }>;
}

function block(selector: string, colors: Record<string, string>, status: Record<string, { fg: string; bg: string; border: string }>) {
  const lines = Object.entries(colors).map(([role, hex]) => `  --md-${role}: ${hex};`);
  for (const [name, c] of Object.entries(status)) {
    lines.push(`  --status-${name}: ${c.fg};`, `  --status-${name}-container: ${c.bg};`, `  --status-${name}-border: ${c.border};`);
  }
  return `${selector} {\n${lines.join('\n')}\n}`;
}

/** Mapeo a Tailwind 4: bg-primary, text-on-surface, text-headline-lg, p-space-md… */
function themeBlock(design: StitchDesign): string {
  const lines: string[] = [];
  for (const role of Object.keys(design.colors)) lines.push(`  --color-${role}: var(--md-${role});`);
  for (const name of Object.keys(STATUS_LIGHT)) {
    for (const suffix of ['', '-container', '-border']) lines.push(`  --color-status-${name}${suffix}: var(--status-${name}${suffix});`);
  }
  for (const [name, t] of Object.entries(design.typography)) {
    lines.push(`  --text-${name}: ${t.fontSize};`, `  --text-${name}--line-height: ${t.lineHeight};`, `  --text-${name}--font-weight: ${t.fontWeight};`);
    if (t.letterSpacing) lines.push(`  --text-${name}--letter-spacing: ${t.letterSpacing};`);
  }
  for (const [name, value] of Object.entries(design.spacing)) lines.push(`  --spacing-${name}: ${value};`);
  return `@theme inline {\n${lines.join('\n')}\n}`;
}

export function render(): string {
  const design = readStitchDesign();
  const dark = deriveDark(design.colors);
  const statusDark = deriveStatusDark();
  return [
    '/* GENERADO por packages/ui/scripts/derive-dark.ts. No editar a mano. */',
    '/* Claro: YAML de design/stitch/.../DESIGN.md. Oscuro: DERIVADO (no de Stitch), */',
    `/* esquema Material «${dark.variant}» desde ${SEED} (ajuste al claro: ${dark.scores.join(', ')}). */`,
    '',
    block(':root', design.colors, STATUS_LIGHT),
    '',
    block('.dark', dark.colors, statusDark),
    '',
    '/* Tipografía y espaciado: YAML de DESIGN.md. */',
    themeBlock(design),
    '',
  ].join('\n');
}
