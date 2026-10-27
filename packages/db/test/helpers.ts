import { expect } from 'vitest';

/** SQLSTATE de los errores que interesan en estas pruebas. */
export const SQLSTATE = {
  insufficientPrivilege: '42501', // permisos y violaciones de política RLS
  foreignKeyViolation: '23503',
} as const;

/** Comprueba que la promesa falla con el SQLSTATE indicado. */
export async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `se esperaba un error ${code}`).toBeDefined();
  // drizzle envuelve el error de pg en `cause`.
  const pgError = (error as { cause?: unknown }).cause ?? error;
  expect((pgError as { code?: string }).code).toBe(code);
}
