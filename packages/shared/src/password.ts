// Política de contraseñas (ADR 0023). Sin reglas de composición ni caducidad
// periódica: longitud y rechazo de contraseñas comunes (lista local en la API).

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
