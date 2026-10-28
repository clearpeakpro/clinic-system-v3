// ADR 0023, condición 2. Falla si el contexto RLS (app.org_id, app.user_id) se
// fija fuera de withTenant / withUser, o sin que sea local a la transacción.
//
// Reglas:
//  1. set_config('app.org_id' | 'app.user_id', …) solo en
//     packages/db/src/with-tenant.ts: app.org_id dentro de withTenant,
//     app.user_id dentro de withUser, y siempre con el tercer argumento `true`.
//  2. Un set_config cuyo primer argumento no es un literal no se puede
//     comprobar: se rechaza en cualquier archivo.
//  3. SET [LOCAL|SESSION] app.org_id / app.user_id se rechaza en cualquier archivo.
//
// Uso: node packages/db/scripts/check-rls-context.ts [raíz]

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_FILE = 'packages/db/src/with-tenant.ts';
/** Este mismo script define la regla y nombra las llamadas prohibidas en sus mensajes. */
const SELF = 'packages/db/scripts/check-rls-context.ts';
const SETTINGS = new Map([
  ['app.org_id', 'withTenant'],
  ['app.user_id', 'withUser'],
]);
const EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs|sql)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'playwright-report', 'test-results']);

export interface Violation {
  file: string;
  line: number;
  message: string;
}

/** Argumentos de nivel superior de una llamada, desde el paréntesis de apertura. */
function callArguments(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = open + 1; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quote) {
      current += ch;
      if (ch === '\\') {
        current += text.charAt(i + 1);
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      current += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) {
        args.push(current.trim());
        return args;
      }
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  args.push(current.trim());
  return args;
}

function literal(arg: string | undefined): string | null {
  const match = arg?.match(/^(['"`])([^'"`$]*)\1$/);
  return match ? (match[2] ?? null) : null;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

export function checkSource(file: string, text: string): Violation[] {
  const violations: Violation[] = [];
  const allowedFile = file === ALLOWED_FILE;

  for (const match of text.matchAll(/\bset_config\s*\(/gi)) {
    const open = match.index + match[0].length - 1;
    const line = lineOf(text, match.index);
    const [nameArg, , localArg] = callArguments(text, open);
    const name = literal(nameArg);
    if (name === null) {
      violations.push({ file, line, message: 'set_config con un nombre que no es literal: no se puede comprobar' });
      continue;
    }
    const owner = SETTINGS.get(name);
    if (!owner) continue; // otros parámetros no son contexto RLS
    if (!allowedFile) {
      violations.push({ file, line, message: `set_config('${name}') fuera de ${ALLOWED_FILE} (usar ${owner})` });
      continue;
    }
    if (localArg !== 'true') {
      violations.push({ file, line, message: `set_config('${name}') sin true como tercer argumento (debe ser local a la transacción)` });
    }
    const before = text.slice(0, match.index);
    const enclosing = [...before.matchAll(/\b(withTenant|withUser)\s*\(/g)].at(-1)?.[1];
    if (enclosing !== owner) {
      violations.push({ file, line, message: `set_config('${name}') fuera de ${owner}` });
    }
  }

  for (const match of text.matchAll(/\bSET\s+(?:LOCAL\s+|SESSION\s+)?app\.(?:org_id|user_id)\b/gi)) {
    violations.push({ file, line: lineOf(text, match.index), message: `${match[0]}: el contexto RLS solo se fija con withTenant / withUser` });
  }
  return violations;
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (EXTENSIONS.test(entry)) yield path;
  }
}

export function checkTree(root: string): Violation[] {
  const violations: Violation[] = [];
  for (const path of sourceFiles(root)) {
    const file = relative(root, path).split(sep).join('/');
    if (file === SELF) continue;
    violations.push(...checkSource(file, readFileSync(path, 'utf8')));
  }
  return violations;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.argv[2] ?? join(fileURLToPath(import.meta.url), '../../../..');
  const violations = checkTree(root);
  for (const v of violations) console.error(`${v.file}:${String(v.line)}: ${v.message}`);
  if (violations.length > 0) {
    console.error(`\n${String(violations.length)} problema(s) de contexto RLS (ADR 0023, condición 2).`);
    process.exit(1);
  }
  console.log('Contexto RLS: correcto (ADR 0023, condición 2).');
}
