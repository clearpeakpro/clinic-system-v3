import { and, eq, isNull, sql } from 'drizzle-orm';
import pg from 'pg';
import { appointmentTypes, labProviders, labTestCosts, labTests, prices, procedures, referralSources } from './catalog-schema.ts';
import { patients } from './patients-schema.ts';
import { locations, organizations } from './schema.ts';
import { nextCode } from './codes.ts';
import { createLocalFieldCipher, type FieldCipher } from './field-cipher.ts';
import { createTenantDb, type Tx } from './with-tenant.ts';

// Datos ficticios. Los ids son fijos para que las pruebas puedan referirse a ellos.
// Las direcciones son de ejemplo (calles inventadas en ciudades de Texas).

/** Todas las sedes de demostración están en la hora Central (Texas). */
export const DEMO_TIMEZONE = 'America/Chicago';

const N1 = '019a2000-0000-7000-8000-000000000011';
const N2 = '019a2000-0000-7000-8000-000000000012';
const S1 = '019a2000-0000-7000-8000-000000000021';
const S2 = '019a2000-0000-7000-8000-000000000022';

/** Paciente ficticio de la semilla (T-012): teléfono de la serie 555-01xx, reservada para ficción. */
export interface DemoPatient {
  id: string;
  locationId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string | null;
  /** Código de la fuente de referido del catálogo. */
  referralSource?: string;
  /** Se guarda cifrado; solo si la semilla recibe la clave de cifrado de campos. */
  referralDetails?: string;
}

export const DEMO = {
  norte: {
    id: '019a2000-0000-7000-8000-000000000001',
    name: 'Clínica Demo Norte',
    locations: [
      { id: N1, code: 'NOR1', name: 'Norte Centro', address: '1200 Avenida Ejemplo Norte, Dallas, TX 75201' },
      { id: N2, code: 'NOR2', name: 'Norte Oeste', address: '450 Calle Ficticia 12, Fort Worth, TX 76102' },
    ],
    /** 20 pacientes: tildes, homónimos, un posible duplicado y madre e hijo con el mismo teléfono. */
    patients: [
      { id: '019a2000-0000-7000-8000-000000000101', locationId: N1, firstName: 'María', lastName: 'López García', birthDate: '1985-02-03', phone: '2145550101', referralSource: 'RECOMENDACION', referralDetails: 'Recomendada por una vecina' },
      { id: '019a2000-0000-7000-8000-000000000102', locationId: N2, firstName: 'José', lastName: 'Ramírez Santos', birthDate: '1978-11-22', phone: '8175550102' },
      { id: '019a2000-0000-7000-8000-000000000103', locationId: N1, firstName: 'Carmen', lastName: 'Ruiz Ortega', birthDate: '1992-06-05', phone: '2145550103', referralSource: 'REDES' },
      // Posible duplicado de María López García: misma fecha, nombre parecido.
      { id: '019a2000-0000-7000-8000-000000000104', locationId: N2, firstName: 'Maria', lastName: 'Lopez', birthDate: '1985-02-03', phone: '2145550199' },
      // Madre e hijo con el mismo teléfono: no son duplicados.
      { id: '019a2000-0000-7000-8000-000000000105', locationId: N2, firstName: 'Lucía', lastName: 'Hernández Díaz', birthDate: '1970-08-18', phone: '8175550105', referralSource: 'LETRERO' },
      { id: '019a2000-0000-7000-8000-000000000106', locationId: N2, firstName: 'Mateo', lastName: 'Hernández Díaz', birthDate: '2012-04-09', phone: '8175550105' },
      // Homónimos con distinta fecha.
      { id: '019a2000-0000-7000-8000-000000000107', locationId: N1, firstName: 'Juan', lastName: 'Pérez Gómez', birthDate: '1965-01-30', phone: '2145550107' },
      { id: '019a2000-0000-7000-8000-000000000108', locationId: N1, firstName: 'Juan', lastName: 'Pérez Gómez', birthDate: '1990-09-14', phone: '2145550108' },
      { id: '019a2000-0000-7000-8000-000000000109', locationId: N1, firstName: 'Sofía', lastName: 'Navarro Morales', birthDate: '1965-08-18', phone: '9725550109' },
      { id: '019a2000-0000-7000-8000-000000000110', locationId: N2, firstName: 'Andrés', lastName: 'Muñoz Peña', birthDate: '2001-01-30', phone: null },
      { id: '019a2000-0000-7000-8000-000000000111', locationId: N1, firstName: 'Valentina', lastName: 'Castillo Ríos', birthDate: '1999-12-01', phone: '2145550111', referralSource: 'REDES', referralDetails: 'Vio una publicación de la clínica' },
      { id: '019a2000-0000-7000-8000-000000000112', locationId: N2, firstName: 'Ángel', lastName: 'Domínguez Vega', birthDate: '1958-03-27', phone: '8175550112' },
      { id: '019a2000-0000-7000-8000-000000000113', locationId: N1, firstName: 'Gabriela', lastName: 'Jiménez Soto', birthDate: '1988-07-07', phone: '2145550113' },
      { id: '019a2000-0000-7000-8000-000000000114', locationId: N2, firstName: 'Raúl', lastName: 'Ortiz Fuentes', birthDate: '1974-10-10', phone: '8175550114' },
      { id: '019a2000-0000-7000-8000-000000000115', locationId: N1, firstName: 'Isabel', lastName: 'Moreno Cruz', birthDate: '1995-05-21', phone: '2145550115' },
      { id: '019a2000-0000-7000-8000-000000000116', locationId: N1, firstName: 'Tomás', lastName: 'Gutiérrez León', birthDate: '1983-11-02', phone: '9725550116' },
      { id: '019a2000-0000-7000-8000-000000000117', locationId: N1, firstName: 'Natalia', lastName: 'Vargas Rojas', birthDate: '2005-02-14', phone: '2145550117' },
      { id: '019a2000-0000-7000-8000-000000000118', locationId: N2, firstName: 'Héctor', lastName: 'Medina Salas', birthDate: '1949-06-30', phone: '8175550118' },
      { id: '019a2000-0000-7000-8000-000000000119', locationId: N1, firstName: 'Paula', lastName: 'Romero Aguilar', birthDate: '1991-09-09', phone: '2145550119' },
      { id: '019a2000-0000-7000-8000-000000000120', locationId: N2, firstName: 'Óscar', lastName: 'Delgado Núñez', birthDate: '1980-04-04', phone: '8175550120' },
    ],
  },
  sur: {
    id: '019a2000-0000-7000-8000-000000000002',
    name: 'Clínica Demo Sur',
    locations: [
      { id: S1, code: 'SUR1', name: 'Sur Centro', address: '88 Avenida Demo Sur, San Antonio, TX 78205' },
      { id: S2, code: 'SUR2', name: 'Sur Este', address: '2500 Calle Ejemplo Este, Houston, TX 77002' },
    ],
    patients: [
      { id: '019a2000-0000-7000-8000-000000000201', locationId: S1, firstName: 'Diego', lastName: 'Torres Campos', birthDate: '1987-03-12', phone: '2105550131' },
      { id: '019a2000-0000-7000-8000-000000000202', locationId: S2, firstName: 'Elena', lastName: 'Sánchez Mejía', birthDate: '1993-08-25', phone: '7135550132', referralSource: 'RECOMENDACION', referralDetails: 'Recomendada por su hermana' },
      { id: '019a2000-0000-7000-8000-000000000203', locationId: S1, firstName: 'Fabio', lastName: 'Reyes Paredes', birthDate: '1979-12-30', phone: '2105550133' },
      // Madre e hijo con el mismo teléfono.
      { id: '019a2000-0000-7000-8000-000000000204', locationId: S2, firstName: 'Rosa', lastName: 'Martínez Flores', birthDate: '1960-05-05', phone: '7135550134' },
      { id: '019a2000-0000-7000-8000-000000000205', locationId: S2, firstName: 'Daniel', lastName: 'Martínez Flores', birthDate: '2010-10-10', phone: '7135550134' },
      // Posible duplicado: misma fecha, nombre parecido.
      { id: '019a2000-0000-7000-8000-000000000206', locationId: S1, firstName: 'María Fernanda', lastName: 'Castro', birthDate: '1984-02-29', phone: '2105550136', referralSource: 'REDES' },
      { id: '019a2000-0000-7000-8000-000000000207', locationId: S1, firstName: 'Maria Fernanda', lastName: 'Castro Luna', birthDate: '1984-02-29', phone: '2105550198' },
      // Homónimos con distinta fecha.
      { id: '019a2000-0000-7000-8000-000000000208', locationId: S2, firstName: 'Luis', lastName: 'García Herrera', birthDate: '1972-07-17', phone: '7135550138' },
      { id: '019a2000-0000-7000-8000-000000000209', locationId: S2, firstName: 'Luis', lastName: 'García Herrera', birthDate: '1999-01-01', phone: '7135550139' },
      { id: '019a2000-0000-7000-8000-000000000210', locationId: S1, firstName: 'Camila', lastName: 'Álvarez Ponce', birthDate: '2000-06-06', phone: '2105550140' },
      { id: '019a2000-0000-7000-8000-000000000211', locationId: S1, firstName: 'Jorge', lastName: 'Mendoza Ibarra', birthDate: '1955-09-19', phone: null },
      { id: '019a2000-0000-7000-8000-000000000212', locationId: S2, firstName: 'Adriana', lastName: 'Silva Cortés', birthDate: '1989-11-11', phone: '7135550142', referralSource: 'LETRERO' },
      { id: '019a2000-0000-7000-8000-000000000213', locationId: S1, firstName: 'Ramón', lastName: 'Acosta Lara', birthDate: '1968-02-02', phone: '2105550143' },
      { id: '019a2000-0000-7000-8000-000000000214', locationId: S2, firstName: 'Patricia', lastName: 'Guzmán Vela', birthDate: '1976-04-24', phone: '7135550144' },
      { id: '019a2000-0000-7000-8000-000000000215', locationId: S1, firstName: 'Emilio', lastName: 'Cabrera Solís', birthDate: '1997-08-08', phone: '2105550145' },
      { id: '019a2000-0000-7000-8000-000000000216', locationId: S2, firstName: 'Teresa', lastName: 'Ibáñez Quiroga', birthDate: '1950-12-12', phone: '7135550146' },
      { id: '019a2000-0000-7000-8000-000000000217', locationId: S1, firstName: 'Nicolás', lastName: 'Rivas Molina', birthDate: '2003-03-03', phone: '2105550147' },
      { id: '019a2000-0000-7000-8000-000000000218', locationId: S2, firstName: 'Mónica', lastName: 'Herrera Báez', birthDate: '1986-10-30', phone: '7135550148' },
      { id: '019a2000-0000-7000-8000-000000000219', locationId: S1, firstName: 'Iván', lastName: 'Peña Villalobos', birthDate: '1994-01-15', phone: '2105550149' },
      { id: '019a2000-0000-7000-8000-000000000220', locationId: S2, firstName: 'Lourdes', lastName: 'Campos Zúñiga', birthDate: '1962-07-04', phone: '7135550150' },
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
 * Pacientes ficticios (T-012), idempotente: solo inserta los que faltan, cada
 * uno con su código del contador. Los detalles del referido van cifrados y
 * solo si hay clave.
 */
async function seedPatients(tx: Tx, organizationId: string, list: readonly DemoPatient[], cipher: FieldCipher | null): Promise<void> {
  const existing = new Set((await tx.select({ id: patients.id }).from(patients)).map((p) => p.id));
  const sources = new Map((await tx.select({ id: referralSources.id, code: referralSources.code }).from(referralSources)).map((r) => [r.code, r.id]));
  for (const p of list) {
    if (existing.has(p.id)) continue;
    const referralSourceId = p.referralSource ? (sources.get(p.referralSource) ?? null) : null;
    const details =
      cipher && referralSourceId && p.referralDetails
        ? await cipher.encrypt(p.referralDetails, { organizationId, table: 'patients', column: 'referral_details', recordId: p.id })
        : null;
    await tx.insert(patients).values({
      id: p.id,
      organizationId,
      registeredLocationId: p.locationId,
      code: await nextCode(tx, organizationId, 'patient'),
      firstName: p.firstName,
      lastName: p.lastName,
      birthDate: p.birthDate,
      phone: p.phone,
      referralSourceId,
      referralDetailsEnc: details,
    });
  }
}

/**
 * Carga la semilla como clinic_migrator con SET ROLE clinic_owner (solo en
 * desarrollo y pruebas). FORCE RLS aplica también al dueño, así que cada
 * organización se inserta dentro de su propio contexto. Es idempotente.
 */
export async function seed(
  migratorUrl: string,
  options: {
    /** Solo organizaciones y sedes, para una base con migraciones antiguas (prueba de T-008). */
    minimal?: boolean;
    /** FIELD_ENCRYPTION_KEY: sin ella, los pacientes se siembran sin detalles del referido. */
    fieldKey?: string;
  } = {},
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
        if (options.minimal) return;
        const key = org.id === DEMO.norte.id ? 'norte' : 'sur';
        await seedCatalog(tx, org.id, org.locations, DEMO_CATALOG.prices[key]);
        await seedLabs(tx, org.id, DEMO_LABS.costs[key]);
        await seedPatients(tx, org.id, org.patients, options.fieldKey ? createLocalFieldCipher(options.fieldKey) : null);
      });
    }
  } finally {
    await client.end();
  }
}
