import { and, eq, isNull, sql } from 'drizzle-orm';
import pg from 'pg';
import { appointmentTypes, labProviders, labTestCosts, labTests, prices, procedures, referralSources } from './catalog-schema.ts';
import { locations, organizations, patients } from './schema.ts';
import { createTenantDb, type Tx } from './with-tenant.ts';

// Datos ficticios. Los ids son fijos para que las pruebas puedan referirse a ellos.
// Las direcciones son de ejemplo (calles inventadas en ciudades de Texas).

/** Todas las sedes de demostración están en la hora Central (Texas). */
export const DEMO_TIMEZONE = 'America/Chicago';

export const DEMO = {
  norte: {
    id: '019a2000-0000-7000-8000-000000000001',
    name: 'Clínica Demo Norte',
    locations: [
      { id: '019a2000-0000-7000-8000-000000000011', code: 'NOR1', name: 'Norte Centro', address: '1200 Avenida Ejemplo Norte, Dallas, TX 75201' },
      { id: '019a2000-0000-7000-8000-000000000012', code: 'NOR2', name: 'Norte Oeste', address: '450 Calle Ficticia 12, Fort Worth, TX 76102' },
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
      { id: '019a2000-0000-7000-8000-000000000021', code: 'SUR1', name: 'Sur Centro', address: '88 Avenida Demo Sur, San Antonio, TX 78205' },
      { id: '019a2000-0000-7000-8000-000000000022', code: 'SUR2', name: 'Sur Este', address: '2500 Calle Ejemplo Este, Houston, TX 77002' },
    ],
    patients: [
      { id: '019a2000-0000-7000-8000-000000000201', locationId: '019a2000-0000-7000-8000-000000000021', firstName: 'Diego', lastName: 'Ficticio Cuatro' },
      { id: '019a2000-0000-7000-8000-000000000202', locationId: '019a2000-0000-7000-8000-000000000022', firstName: 'Elena', lastName: 'Ficticia Cinco' },
      { id: '019a2000-0000-7000-8000-000000000203', locationId: '019a2000-0000-7000-8000-000000000021', firstName: 'Fabio', lastName: 'Ficticio Seis' },
    ],
  },
} as const;

/**
 * Catálogo básico ficticio (T-011), el mismo en las dos organizaciones. Cada
 * ítem con precio tiene su precio general (en centavos, vigente desde el 1 de
 * enero de 2026); en Norte, algunos tienen además una excepción en NOR2.
 */
export const DEMO_CATALOG = {
  appointmentTypes: [
    { code: 'CONSULTA', name: 'Consulta general', defaultDurationMinutes: 20, suggestedRoute: 'STANDARD', color: 'teal', sortOrder: 10 },
    { code: 'SEGUIMIENTO', name: 'Seguimiento', defaultDurationMinutes: 15, suggestedRoute: 'STANDARD', color: 'blue', sortOrder: 20 },
  ],
  procedures: [
    { code: 'INJ-B12', name: 'Inyección de vitamina B12', kind: 'injection', sortOrder: 10 },
    { code: 'PROC-LAVOT', name: 'Lavado ótico', kind: 'procedure', sortOrder: 20 },
  ],
  labTests: [
    { code: 'LAB-STREP', name: 'Prueba rápida de estreptococo', sortOrder: 10 },
    // T-011b: las tres del ejemplo de la sugerencia de laboratorio (ADR 0028).
    { code: 'LAB-A1C', name: 'Hemoglobina A1c', sortOrder: 20 },
    { code: 'LAB-TSH', name: 'Perfil tiroideo (TSH)', sortOrder: 30 },
    { code: 'LAB-PSA', name: 'Antígeno prostático (PSA)', sortOrder: 40 },
  ],
  referralSources: [
    { code: 'RECOMENDACION', name: 'Recomendación de un conocido', sortOrder: 10 },
    { code: 'REDES', name: 'Redes sociales', sortOrder: 20 },
    { code: 'LETRERO', name: 'Vio el letrero de la clínica', sortOrder: 30 },
  ],
  /** Por organización y código de ítem: `general` y, opcional, la excepción por código de sede. */
  prices: {
    norte: {
      'INJ-B12': { general: 2000, NOR2: 2200 },
      'PROC-LAVOT': { general: 3000 },
      'LAB-STREP': { general: 2800, NOR2: 3000 },
      'LAB-A1C': { general: 3500 },
      'LAB-TSH': { general: 4500 },
      'LAB-PSA': { general: 5000 },
    },
    sur: {
      'INJ-B12': { general: 1800 },
      'PROC-LAVOT': { general: 2800 },
      'LAB-STREP': { general: 2500 },
      'LAB-A1C': { general: 3200 },
      'LAB-TSH': { general: 4200 },
      'LAB-PSA': { general: 4800 },
    },
  } as Record<'norte' | 'sur', Record<string, Record<string, number>>>,
  pricesEffectiveFrom: '2026-01-01',
} as const;

/**
 * Laboratorios ficticios (T-011b, ADR 0028) y su costo para la clínica, en
 * centavos, vigente desde el 1 de enero de 2026. Distintos en cada
 * organización. Con A1c + TSH + PSA gana LabCorp en total aunque CPL sea más
 * barato en A1c; Quest no hace PSA; la prueba de estreptococo no tiene
 * laboratorio («Sin laboratorio asignado»).
 */
export const DEMO_LABS = {
  providers: [
    { name: 'LabCorp', preference: 1 },
    { name: 'Quest Diagnostics', preference: 2 },
    { name: 'CPL', preference: 3 },
  ],
  /** Por organización, laboratorio y código de prueba. */
  costs: {
    norte: {
      LabCorp: { 'LAB-A1C': 1200, 'LAB-TSH': 1500, 'LAB-PSA': 1800 },
      CPL: { 'LAB-A1C': 900, 'LAB-TSH': 1900, 'LAB-PSA': 2100 },
      'Quest Diagnostics': { 'LAB-A1C': 1100, 'LAB-TSH': 1400 },
    },
    sur: {
      LabCorp: { 'LAB-A1C': 1300, 'LAB-TSH': 1600, 'LAB-PSA': 1900 },
      CPL: { 'LAB-A1C': 1000, 'LAB-TSH': 2000, 'LAB-PSA': 2200 },
      'Quest Diagnostics': { 'LAB-A1C': 1150, 'LAB-TSH': 1450 },
    },
  } as Record<'norte' | 'sur', Record<string, Record<string, number>>>,
  effectiveFrom: '2026-01-01',
} as const;

/** Laboratorios y costos de una organización (idempotente: no toca lo que ya existe). */
async function seedLabs(tx: Tx, organizationId: string, orgCosts: Record<string, Record<string, number>>): Promise<void> {
  await tx
    .insert(labProviders)
    .values(DEMO_LABS.providers.map((p) => ({ ...p, organizationId })))
    .onConflictDoNothing();
  const providers = await tx.select({ id: labProviders.id, name: labProviders.name }).from(labProviders);
  const tests = await tx.select({ id: labTests.id, code: labTests.code }).from(labTests);
  for (const provider of providers) {
    for (const test of tests) {
      const amountCents = orgCosts[provider.name]?.[test.code];
      if (amountCents === undefined) continue;
      const existing = await tx
        .select({ id: labTestCosts.id })
        .from(labTestCosts)
        .where(and(eq(labTestCosts.labProviderId, provider.id), eq(labTestCosts.labTestId, test.id)))
        .limit(1);
      if (existing.length > 0) continue;
      await tx.insert(labTestCosts).values({
        organizationId,
        labTestId: test.id,
        labProviderId: provider.id,
        amountCents,
        effectiveFrom: DEMO_LABS.effectiveFrom,
      });
    }
  }
}

/** Catálogo y precios de una organización (idempotente: no toca lo que ya existe). */
async function seedCatalog(
  tx: Tx,
  organizationId: string,
  sites: readonly { id: string; code: string }[],
  orgPrices: Record<string, Record<string, number>>,
): Promise<void> {
  const c = DEMO_CATALOG;
  await tx.insert(appointmentTypes).values(c.appointmentTypes.map((a) => ({ ...a, organizationId }))).onConflictDoNothing();
  await tx.insert(procedures).values(c.procedures.map((p) => ({ ...p, organizationId }))).onConflictDoNothing();
  await tx.insert(labTests).values(c.labTests.map((l) => ({ ...l, organizationId }))).onConflictDoNothing();
  await tx.insert(referralSources).values(c.referralSources.map((r) => ({ ...r, organizationId }))).onConflictDoNothing();
  const items = [
    ...(await tx.select({ id: procedures.id, code: procedures.code }).from(procedures)).map((p) => ({ ...p, column: 'procedureId' as const })),
    ...(await tx.select({ id: labTests.id, code: labTests.code }).from(labTests)).map((l) => ({ ...l, column: 'labTestId' as const })),
  ];
  for (const item of items) {
    const itemColumn = item.column === 'procedureId' ? prices.procedureId : prices.labTestId;
    // null: precio general; con sede: excepción.
    const targets = [{ id: null, code: 'general' }, ...sites];
    for (const target of targets) {
      const amountCents = orgPrices[item.code]?.[target.code];
      if (amountCents === undefined) continue;
      const existing = await tx
        .select({ id: prices.id })
        .from(prices)
        .where(and(target.id === null ? isNull(prices.locationId) : eq(prices.locationId, target.id), eq(itemColumn, item.id)))
        .limit(1);
      if (existing.length > 0) continue;
      await tx.insert(prices).values({
        organizationId,
        locationId: target.id,
        [item.column]: item.id,
        amountCents,
        effectiveFrom: c.pricesEffectiveFrom,
      });
    }
  }
}

/**
 * Carga la semilla como clinic_migrator con SET ROLE clinic_owner (solo en
 * desarrollo y pruebas). FORCE RLS aplica también al dueño, así que cada
 * organización se inserta dentro de su propio contexto. Es idempotente.
 */
export async function seed(
  migratorUrl: string,
  /** `catalog: false`: sin catálogo ni laboratorios, para una base con migraciones anteriores a T-011. */
  options: { catalog?: boolean } = {},
): Promise<void> {
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
              timezone: DEMO_TIMEZONE,
            })),
          )
          // Al volver a sembrar se actualizan zona horaria y dirección.
          .onConflictDoUpdate({
            target: locations.id,
            set: { timezone: sql`excluded.timezone`, address: sql`excluded.address` },
          });
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
        if (options.catalog !== false) {
          const key = org.id === DEMO.norte.id ? 'norte' : 'sur';
          await seedCatalog(tx, org.id, org.locations, DEMO_CATALOG.prices[key]);
          await seedLabs(tx, org.id, DEMO_LABS.costs[key]);
        }
      });
    }
  } finally {
    await client.end();
  }
}
