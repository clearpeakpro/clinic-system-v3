import {
  appointments,
  appointmentTypes,
  createLocalFieldCipher,
  createTenantDb,
  DEMO,
  locations,
  membershipRoles,
  memberships,
  nextAppointmentCode,
  user as userTable,
  type FieldCipher,
} from '@clinic/db';
import type { AppointmentStatus, Role } from '@clinic/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { ClinicApp } from './app.ts';

// Usuarios ficticios de desarrollo (T-003, T-004; completos en T-010): los
// cinco roles en cada organización y una persona de las dos. Ninguno con MFA:
// Propietarios y Administradores lo inscriben al entrar (S-GEN-07). La semilla
// es la ÚNICA vía para crear un Propietario en desarrollo: ningún endpoint lo
// hace (regla escalonada de packages/shared/src/permissions.ts). En producción
// lo hace el operador con `pnpm org:create` (T-007).

type Org = typeof DEMO.norte | typeof DEMO.sur;

interface DevUser {
  email: string;
  name: string;
  /** Índice de la sede, o null para toda la organización. */
  roles: { org: Org; location: 0 | 1 | null; role: Role }[];
}

export const DEV_OWNERS = [
  { org: DEMO.norte, email: 'propietario.norte@example.test', name: 'Propietaria Norte (ficticia)' },
  { org: DEMO.sur, email: 'propietario.sur@example.test', name: 'Propietario Sur (ficticio)' },
] as const;

export const DEV_USERS: readonly DevUser[] = [
  ...DEV_OWNERS.map((o) => ({ email: o.email, name: o.name, roles: [{ org: o.org, location: null, role: 'propietario' as const }] })),
  // Sin MFA al crearse: al entrar queda obligado a inscribirse (S-GEN-07).
  // Clínica Demo Norte
  { email: 'admin.norte@example.test', name: 'Adriana Admin (ficticia)', roles: [{ org: DEMO.norte, location: null, role: 'administrador' }] },
  { email: 'recepcion.norte@example.test', name: 'Rosa Recepción (ficticia)', roles: [{ org: DEMO.norte, location: 0, role: 'recepcion' }] },
  { email: 'enfermeria.norte@example.test', name: 'Nora Enfermería (ficticia)', roles: [{ org: DEMO.norte, location: 0, role: 'enfermeria' }] },
  { email: 'proveedor.norte@example.test', name: 'Pablo Proveedor (ficticio)', roles: [{ org: DEMO.norte, location: 1, role: 'proveedor' }] },
  // T-014: la agenda de NOR1 necesita un proveedor (el de arriba está en NOR2).
  { email: 'proveedora.nor1@example.test', name: 'Diana Doctora (ficticia)', roles: [{ org: DEMO.norte, location: 0, role: 'proveedor' }] },
  // Clínica Demo Sur
  { email: 'admin.sur@example.test', name: 'Sergio Admin (ficticio)', roles: [{ org: DEMO.sur, location: null, role: 'administrador' }] },
  { email: 'recepcion.sur@example.test', name: 'Raúl Recepción (ficticio)', roles: [{ org: DEMO.sur, location: 0, role: 'recepcion' }] },
  { email: 'enfermeria.sur@example.test', name: 'Elena Enfermería (ficticia)', roles: [{ org: DEMO.sur, location: 1, role: 'enfermeria' }] },
  { email: 'proveedor.sur@example.test', name: 'Sofía Proveedora (ficticia)', roles: [{ org: DEMO.sur, location: 1, role: 'proveedor' }] },
  // De las dos organizaciones.
  {
    email: 'multi@example.test',
    name: 'Mario Dos Clínicas (ficticio)',
    roles: [
      { org: DEMO.norte, location: 0, role: 'recepcion' },
      { org: DEMO.sur, location: 0, role: 'enfermeria' },
    ],
  },
];

/** Crea (si no existen) los usuarios ficticios con sus roles. Idempotente. */
export async function seedDevUsers(app: Pick<ClinicApp, 'auth' | 'pool'>, password: string): Promise<void> {
  const plain = drizzle({ client: app.pool });
  const tenantDb = createTenantDb(app.pool);
  for (const devUser of DEV_USERS) {
    const existing = await plain.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, devUser.email));
    const userId =
      existing[0]?.id ??
      (await app.auth.api.signUpEmail({ body: { name: devUser.name, email: devUser.email, password } })).user.id;
    for (const assignment of devUser.roles) {
      const orgId = assignment.org.id;
      await tenantDb.withTenant(orgId, async (tx) => {
        const [membership] = await tx
          .insert(memberships)
          .values({ organizationId: orgId, userId })
          .onConflictDoUpdate({ target: [memberships.organizationId, memberships.userId], set: { status: 'active' } })
          .returning({ id: memberships.id });
        if (!membership) throw new Error('No se creó la membresía');
        await tx
          .insert(membershipRoles)
          .values({
            organizationId: orgId,
            membershipId: membership.id,
            locationId: assignment.location === null ? null : assignment.org.locations[assignment.location].id,
            role: assignment.role,
          })
          .onConflictDoNothing();
      });
    }
  }
}

// --- Citas ficticias (T-014) -----------------------------------------------
//
// En cada sede: ayer, hoy y los tres días siguientes, con todos los estados,
// con y sin proveedor, y algunas con notas o motivo de cancelación (cifrados).
// Las fechas son relativas al día en que se siembra (hoy en la sede) y las
// horas, locales de la sede: el instante se calcula en SQL con su zona
// horaria. Ids fijos: al repetirse no duplica nada.

/** Proveedor de cada sede (índice de la sede → correo); sin él, las citas quedan «Sin asignar». */
const SITE_PROVIDERS: Record<string, readonly (string | null)[]> = {
  [DEMO.norte.id]: ['proveedora.nor1@example.test', 'proveedor.norte@example.test'],
  [DEMO.sur.id]: [null, 'proveedor.sur@example.test'],
};

interface DemoAppointment {
  day: number;
  time: string;
  minutes: number;
  type: 'CONSULTA' | 'SEGUIMIENTO';
  status: AppointmentStatus;
  /** Falso: «Sin asignar». */
  withProvider: boolean;
  notes?: string;
  cancelReason?: string;
}

/** Plantilla de cada sede (20 citas). */
export const DEMO_AGENDA: readonly DemoAppointment[] = [
  { day: -1, time: '09:00', minutes: 20, type: 'CONSULTA', status: 'ARRIVED', withProvider: true },
  { day: -1, time: '09:40', minutes: 15, type: 'SEGUIMIENTO', status: 'NO_SHOW', withProvider: true },
  { day: -1, time: '10:20', minutes: 20, type: 'CONSULTA', status: 'CANCELLED', withProvider: false, cancelReason: 'El paciente avisó por teléfono que no podía venir.' },
  { day: -1, time: '11:00', minutes: 30, type: 'CONSULTA', status: 'ARRIVED', withProvider: true },
  { day: 0, time: '08:30', minutes: 20, type: 'CONSULTA', status: 'ARRIVED', withProvider: true },
  { day: 0, time: '09:00', minutes: 15, type: 'SEGUIMIENTO', status: 'ARRIVED', withProvider: true },
  { day: 0, time: '09:20', minutes: 20, type: 'CONSULTA', status: 'NO_SHOW', withProvider: true },
  { day: 0, time: '10:00', minutes: 30, type: 'CONSULTA', status: 'CONFIRMED', withProvider: true, notes: 'Traerá los resultados de su último análisis.' },
  { day: 0, time: '10:40', minutes: 20, type: 'SEGUIMIENTO', status: 'CANCELLED', withProvider: true, cancelReason: 'Canceló el paciente vía llamada.' },
  { day: 0, time: '11:00', minutes: 20, type: 'CONSULTA', status: 'SCHEDULED', withProvider: false },
  { day: 0, time: '11:30', minutes: 15, type: 'SEGUIMIENTO', status: 'CONFIRMED', withProvider: true },
  { day: 0, time: '14:00', minutes: 20, type: 'CONSULTA', status: 'SCHEDULED', withProvider: true },
  { day: 0, time: '15:15', minutes: 30, type: 'CONSULTA', status: 'SCHEDULED', withProvider: false },
  { day: 1, time: '09:00', minutes: 20, type: 'CONSULTA', status: 'CONFIRMED', withProvider: true },
  { day: 1, time: '10:30', minutes: 15, type: 'SEGUIMIENTO', status: 'SCHEDULED', withProvider: true, notes: 'Prefiere que lo llamen por la tarde.' },
  { day: 1, time: '13:00', minutes: 20, type: 'CONSULTA', status: 'SCHEDULED', withProvider: false },
  { day: 2, time: '09:30', minutes: 20, type: 'CONSULTA', status: 'SCHEDULED', withProvider: true },
  { day: 2, time: '11:00', minutes: 15, type: 'SEGUIMIENTO', status: 'CONFIRMED', withProvider: true },
  { day: 3, time: '10:00', minutes: 20, type: 'CONSULTA', status: 'SCHEDULED', withProvider: true },
  { day: 3, time: '16:00', minutes: 20, type: 'CONSULTA', status: 'CANCELLED', withProvider: true, cancelReason: 'Reprogramará cuando regrese de viaje.' },
];

/** Id fijo de la cita `index` de la sede `site` (0 o 1) de una organización. */
export function demoAppointmentId(org: Org, site: 0 | 1, index: number): string {
  const prefix = org.id === DEMO.norte.id ? '3' : '4';
  return `019a2000-0000-7000-8000-00000000${prefix}${String(site)}${String(index).padStart(2, '0')}`;
}

/** Crea (si no existen) las citas ficticias de las cuatro sedes. Idempotente. Necesita los usuarios. */
export async function seedDevAppointments(app: Pick<ClinicApp, 'pool'>, fieldKey: string): Promise<void> {
  const plain = drizzle({ client: app.pool });
  const tenantDb = createTenantDb(app.pool);
  const cipher: FieldCipher = createLocalFieldCipher(fieldKey);
  const emails = Object.values(SITE_PROVIDERS).flat().filter((e): e is string => e !== null);
  const users = await plain.select({ id: userTable.id, email: userTable.email }).from(userTable).where(inArray(userTable.email, emails));
  for (const org of [DEMO.norte, DEMO.sur]) {
    await tenantDb.withTenant(org.id, async (tx) => {
      const existing = new Set((await tx.select({ id: appointments.id }).from(appointments)).map((a) => a.id));
      const types = new Map((await tx.select({ id: appointmentTypes.id, code: appointmentTypes.code }).from(appointmentTypes)).map((t) => [t.code, t.id]));
      const members = await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships);
      for (const [siteIndex, site] of org.locations.entries()) {
        const [row] = await tx
          .select({ timezone: locations.timezone, today: sql<string>`((now() at time zone ${locations.timezone})::date)::text` })
          .from(locations)
          .where(eq(locations.id, site.id));
        if (!row) continue;
        const email = SITE_PROVIDERS[org.id]?.[siteIndex] ?? null;
        const userId = users.find((u) => u.email === email)?.id;
        const providerId = members.find((m) => m.userId === userId)?.id ?? null;
        const sitePatients = org.patients.filter((p) => p.locationId === site.id);
        for (const [index, a] of DEMO_AGENDA.entries()) {
          const id = demoAppointmentId(org, siteIndex as 0 | 1, index);
          const patient = sitePatients[index % sitePatients.length];
          const typeId = types.get(a.type);
          if (existing.has(id) || !patient || !typeId) continue;
          const context = (column: string) => ({ organizationId: org.id, table: 'appointments', column, recordId: id });
          await tx.insert(appointments).values({
            id,
            organizationId: org.id,
            locationId: site.id,
            patientId: patient.id,
            appointmentTypeId: typeId,
            providerMembershipId: a.withProvider ? providerId : null,
            code: await nextAppointmentCode(tx, org.id, site),
            startsAt: sql`((${row.today}::date + ${a.day}::int) + ${a.time}::time) at time zone ${row.timezone}`,
            durationMinutes: a.minutes,
            status: a.status,
            notesEnc: a.notes ? await cipher.encrypt(a.notes, context('notes')) : null,
            cancelReasonEnc: a.cancelReason ? await cipher.encrypt(a.cancelReason, context('cancel_reason')) : null,
          });
        }
      }
    });
  }
}
