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

export const createInvitationSchema = z.object({
  email: z.email().max(254),
  role: z.enum(ROLES),
  locationId: uuid.nullable(),
});

export const acceptInvitationSchema = z.object({
  organizationId: uuid,
  token: z.string().min(20).max(200),
  /** Solo si la persona aún no tiene cuenta. */
  name: z.string().trim().min(1).max(200).optional(),
  /**
   * La política (longitud y lista de contraseñas comunes) la aplica la API con
   * códigos de error propios; aquí solo un tope para no procesar textos enormes.
   */
  password: z.string().max(1024).optional(),
});

export const deactivateMembershipSchema = z.object({ reason });

export const changeRolesSchema = z.object({
  roles: z.array(roleAssignmentSchema).min(1).max(20),
  reason,
});

export type SelectContextInput = z.infer<typeof selectContextSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type ChangeRolesInput = z.infer<typeof changeRolesSchema>;
