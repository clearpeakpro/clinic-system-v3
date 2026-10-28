import { readFileSync } from 'node:fs';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@clinic/shared';

// Política de contraseñas (ADR 0023):
//  - longitud de 12 a 128 caracteres;
//  - sin reglas de composición (mayúsculas, números, símbolos);
//  - se rechazan las contraseñas comunes de una lista local (data/README.md);
//  - sin caducidad periódica.

const COMMON = new Set(
  readFileSync(new URL('../data/common-passwords.txt', import.meta.url), 'utf8')
    // Tolera CRLF (una copia de trabajo de antes de .gitattributes, en Windows).
    .split(/\r?\n/)
    .filter((line) => line.length > 0),
);

export type PasswordProblem = 'password_too_short' | 'password_too_long' | 'password_too_common';

export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'password_too_short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'password_too_long';
  if (COMMON.has(password.toLowerCase())) return 'password_too_common';
  return null;
}

/** Tamaño de la lista cargada (para las pruebas). */
export const COMMON_PASSWORD_COUNT = COMMON.size;
