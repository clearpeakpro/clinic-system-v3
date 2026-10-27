import pg from 'pg';
import { locations, organizations, patients } from './schema.ts';
import { createTenantDb } from './with-tenant.ts';

// Datos ficticios. Los ids son fijos para que las pruebas puedan referirse a ellos.

export const DEMO = {
  norte: {
    id: '019a2000-0000-7000-8000-000000000001',
    name: 'Clínica Demo Norte',
    locations: [
      { id: '019a2000-0000-7000-8000-000000000011', code: 'NOR1', name: 'Norte Centro' },
      { id: '019a2000-0000-7000-8000-000000000012', code: 'NOR2', name: 'Norte Oeste' },
    ],
    patients: [
      { id: '019a2000-0000-7000-8000-000000000101', locationId: '019a2000-0000-7000-8000-000000000011', firstName: 'Ana', lastName: 'Ficticia Uno' },
      { id: '019a2000-0000-7000-8000-000000000102', locationId: '019a2000-0000-7000-8000-000000000012', firstName: 'Bruno', lastName: 'Ficticio Dos' },
      { id: '019a2000-0000-7000-8000-000000000103', locationId: '019a2000-0000-7000-8000-000000000011', firstName: 'Carla', lastName: 'Ficticia Tres' },
    ],
  },
  sur: {
    id: '019a2000-0000-7000-8000-000000000002',
    name: 'Clínica Demo Sur',
    locations: [
      { id: '019a2000-0000-7000-8000-000000000021', code: 'SUR1', name: 'Sur Centro' },
      { id: '019a2000-0000-7000-8000-000000000022', code: 'SUR2', name: 'Sur Este' },
    ],
    patients: [
      { id: '019a2000-0000-7000-8000-000000000201', locationId: '019a2000-0000-7000-8000-000000000021', firstName: 'Diego', lastName: 'Ficticio Cuatro' },
      { id: '019a2000-0000-7000-8000-000000000202', locationId: '019a2000-0000-7000-8000-000000000022', firstName: 'Elena', lastName: 'Ficticia Cinco' },
      { id: '019a2000-0000-7000-8000-000000000203', locationId: '019a2000-0000-7000-8000-000000000021', firstName: 'Fabio', lastName: 'Ficticio Seis' },
    ],
  },
} as const;

/**
 * Carga la semilla como clinic_migrator con SET ROLE clinic_owner (solo en
 * desarrollo y pruebas). FORCE RLS aplica también al dueño, así que cada
 * organización se inserta dentro de su propio contexto. Es idempotente.
 */
export async function seed(migratorUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query('SET ROLE clinic_owner');
    const { withTenant } = createTenantDb(client);
    for (const org of [DEMO.norte, DEMO.sur]) {
      await withTenant(org.id, async (tx) => {
        await tx.insert(organizations).values({ id: org.id, name: org.name }).onConflictDoNothing();
        await tx
          .insert(locations)
          .values(
            org.locations.map((l) => ({
              ...l,
              organizationId: org.id,
              timezone: 'America/New_York',
            })),
          )
          .onConflictDoNothing();
        await tx
          .insert(patients)
          .values(
            org.patients.map(({ locationId, ...p }) => ({
              ...p,
              organizationId: org.id,
              registeredLocationId: locationId,
              birthDate: '1990-01-01',
            })),
          )
          .onConflictDoNothing();
      });
    }
  } finally {
    await client.end();
  }
}
