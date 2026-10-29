import { createTenantDb, DEMO, membershipRoles, memberships, user as userTable } from '@clinic/db';
import type { Role } from '@clinic/shared';
import { eq } from 'drizzle-orm';
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
