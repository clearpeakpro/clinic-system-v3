import { createTenantDb, DEMO, membershipRoles, memberships, user as userTable } from '@clinic/db';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { ClinicApp } from './app.ts';

// Primer Propietario de cada organización ficticia (T-003). Es la ÚNICA vía
// para crear un Propietario en la fase 1: ningún endpoint lo hace (regla
// escalonada de packages/shared/src/permissions.ts). En producción lo hará el
// operador con `pnpm org:create` (T-007).

export const DEV_OWNERS = [
  { org: DEMO.norte, email: 'propietario.norte@example.test', name: 'Propietaria Norte (ficticia)' },
  { org: DEMO.sur, email: 'propietario.sur@example.test', name: 'Propietario Sur (ficticio)' },
] as const;

/** Crea (si no existen) los dos Propietarios ficticios con rol de toda la organización. Idempotente. */
export async function seedDevOwners(app: Pick<ClinicApp, 'auth' | 'pool'>, password: string): Promise<void> {
  const plain = drizzle({ client: app.pool });
  const tenantDb = createTenantDb(app.pool);
  for (const owner of DEV_OWNERS) {
    const existing = await plain.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, owner.email));
    const userId =
      existing[0]?.id ??
      (await app.auth.api.signUpEmail({ body: { name: owner.name, email: owner.email, password } })).user.id;
    await tenantDb.withTenant(owner.org.id, async (tx) => {
      const [membership] = await tx
        .insert(memberships)
        .values({ organizationId: owner.org.id, userId })
        .onConflictDoUpdate({ target: [memberships.organizationId, memberships.userId], set: { status: 'active' } })
        .returning({ id: memberships.id });
      if (!membership) throw new Error('No se creó la membresía del Propietario');
      await tx
        .insert(membershipRoles)
        .values({ organizationId: owner.org.id, membershipId: membership.id, locationId: null, role: 'propietario' })
        .onConflictDoNothing();
    });
  }
}
