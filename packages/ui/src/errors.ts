// Texto de error uniforme (S-GEN-28). Nunca se muestra el mensaje técnico del
// servidor: el texto sale del código (`code`) y del estado HTTP.

interface ErrorLike {
  status: number;
  code: string;
  retryAfterSeconds?: number | undefined;
}

function isErrorLike(error: unknown): error is ErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { status?: unknown }).status === 'number' &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

const BY_CODE: Record<string, string> = {
  unauthenticated: 'Su sesión expiró. Inicie sesión de nuevo.',
  session_expired: 'Su sesión expiró. Inicie sesión de nuevo.',
  not_a_member: 'No está autorizado para esta sede.',
  no_active_context: 'No está autorizado para esta sede.',
  invalid_location: 'No está autorizado para esta sede.',
  account_exists: 'Este registro ya existe.',
  membership_not_active: 'Esta acción no está permitida en el estado actual.',
};

export function errorMessage(error: unknown): string {
  // fetch rechaza con TypeError cuando no hay red.
  if (error instanceof TypeError) return 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.';
  if (error instanceof DOMException && error.name === 'AbortError') return 'La solicitud fue cancelada.';
  if (!isErrorLike(error)) return 'Ocurrió un error inesperado. Intente de nuevo.';
  const byCode = BY_CODE[error.code];
  if (byCode) return byCode;
  switch (error.status) {
    case 400:
      return 'Algunos campos no son válidos. Revíselos.';
    case 401:
      return 'Su sesión expiró. Inicie sesión de nuevo.';
    case 403:
      return 'No tiene permiso para realizar esta acción.';
    case 404:
    case 410:
      return 'No se encontró el registro solicitado.';
    case 409:
      // Regla 7 de CLAUDE.md: 409 es el conflicto de versión (concurrencia optimista).
      return 'Este registro fue actualizado por otro usuario. Actualice para continuar.';
    case 429:
      return error.retryAfterSeconds
        ? `Demasiados intentos. Intente de nuevo en ${String(error.retryAfterSeconds)} segundos.`
        : 'Demasiados intentos. Intente de nuevo en unos segundos.';
    case 502:
    case 503:
    case 504:
      return 'Un servicio del sistema no está disponible temporalmente. Intente de nuevo en un momento.';
    default:
      return 'Ocurrió un error inesperado. Intente de nuevo.';
  }
}
