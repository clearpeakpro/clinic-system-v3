import { z } from 'zod';
import { ROLES } from './permissions.ts';

// Esquemas de entrada de la API de identidad. Los mismos sirven en la web.

const uuid = z.uuid();
/** Motivo obligatorio de toda escritura administrativa (CLAUDE.md, regla 6). */
export const reasonSchema = z.string().trim().min(1).max(500);
const reason = reasonSchema;

export const selectContextSchema = z.object({
  organizationId: uuid,
  locationId: uuid,
});

export const roleAssignmentSchema = z.object({
  role: z.enum(ROLES),
  /** Nulo = toda la organización (solo Propietario y Administrador). */
  locationId: uuid.nullable(),
});

/** Versión de la fila que se muestra (concurrencia optimista, regla 7): si cambió, 409. */
export const expectedVersionSchema = z.number().int().positive();
const expectedVersion = expectedVersionSchema;

/** Nombre para mostrar del personal (S-ADM-03, S-ADM-05, S-GEN-09). */
export const displayNameSchema = z.string().trim().min(1).max(120);

/**
 * S-ADM-03. Los roles clínicos se asignan en cada sede elegida; los
 * administrativos, en toda la organización (ver assignmentsFor).
 */
export const createInvitationSchema = z.object({
  email: z.email().max(254),
  name: displayNameSchema,
  roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
  locationIds: z.array(uuid).max(100),
});

export const acceptInvitationSchema = z.object({
  /** Token del enlace /invitacion/<token> (lleva dentro la organización). */
  token: z.string().min(20).max(200),
  /** Solo si la persona aún no tiene cuenta. */
  name: displayNameSchema.optional(),
  /**
   * La política (longitud y lista de contraseñas comunes) la aplica la API con
   * códigos de error propios; aquí solo un tope para no procesar textos enormes.
   */
  password: z.string().max(1024).optional(),
});

export const revokeInvitationSchema = z.object({ reason });

export const renameMemberSchema = z.object({ name: displayNameSchema, expectedVersion });

export const deactivateMembershipSchema = z.object({ reason, expectedVersion });

export const reactivateMembershipSchema = z.object({ reason, expectedVersion });

export const changeRolesSchema = z.object({
  roles: z.array(roleAssignmentSchema).min(1).max(100),
  reason,
  expectedVersion,
});

/** Restablecimiento de contraseña (S-ADM-02) y del MFA (S-ADM-08): con motivo. */
export const credentialResetSchema = z.object({ reason });

/**
 * Perfil (T-006b): cambiar la propia contraseña. La longitud y la lista de
 * contraseñas comunes las comprueba la API (ADR 0023); aquí solo se acota.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

/** S-GEN-24: un código actual de la aplicación de autenticación confirma la acción. */
export const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

// --- Sedes (S-ADM-10 a 12, T-007) -----------------------------------------

/** De 2 a 8 caracteres, empieza por letra, solo A–Z y dígitos (decisión de T-007; el manual pedía solo letras). */
export const LOCATION_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,7}$/;

/** Zona IANA que conoce el motor de JavaScript (Node en la API, el navegador en la web). */
export function isIanaTimeZone(value: string): boolean {
  // Sin desfases sueltos («+05:00»), que Intl también acepta.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

const locationFields = {
  name: z.string().trim().min(1).max(120),
  timezone: z.string().refine(isIanaTimeZone),
  address: optionalText(250),
  phone: optionalText(30),
};

export const createLocationSchema = z.object({
  code: z.string().regex(LOCATION_CODE_PATTERN),
  ...locationFields,
});

/** El código no se envía: es inmutable (aparece en las URL y en los códigos humanos). */
export const updateLocationSchema = z.object({ ...locationFields, expectedVersion });

export const setLocationActiveSchema = z.object({ expectedVersion });

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export type SelectContextInput = z.infer<typeof selectContextSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type ChangeRolesInput = z.infer<typeof changeRolesSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;
