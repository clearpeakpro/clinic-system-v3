import { createTenantDb, DEMO, encounters, kioskDevices, locations, user as userTable } from '@clinic/db';
import {
  permissionsFor,
  type AllergyStatus,
  type ArrivalCoverageInput,
  type FixedClock,
  type VisitRoute,
} from '@clinic/shared';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { ClinicApp } from './app.ts';
import { DEMO_VISIT_SITES, demoAppointmentId, TODAY_ARRIVED } from './dev-seed.ts';
import { rolesAt, type Principal } from './principal.ts';
import type { RequestMeta } from './services.ts';

// Visitas y tabletas ficticias de la demo 3A (T-024; docs/DEMO-FASE-3A.md).
//
// Nada se escribe a mano: cada paso lo da el servicio real (llegada,
// transiciones, enfermería, consulta, kiosco) como el usuario ficticio que le
// corresponde, con el reloj inyectable puesto en el minuto de ese paso. Así
// pasa por la máquina de estados, queda en encounter_events y en la auditoría,
// y las esperas son reales: a la hora del reinicio hay visitas con «Alerta»
// (más de 5 min) y con «Crítico» (más de 10 min) (ADR 0039).
//
// Solo en la primera sede de cada organización (DEMO_VISIT_SITES): NOR2 y SUR2
// no tienen Recepción ni Enfermería en la semilla.

type Org = typeof DEMO.norte | typeof DEMO.sur;
type Step = 'send_to_nurse' | 'send_to_procedure' | 'nursing' | 'send_to_provider' | 'start_consult' | 'ready_for_checkout';

interface DemoNursing {
  /** Con signos vitales completos (peso y presión): «Enviar al proveedor» sin excepción. */
  vitals: boolean;
  allergyStatus: AllergyStatus;
  allergies?: string;
  symptoms: string;
}

export interface DemoVisit {
  /** Nombre y apellidos del paciente de la semilla (DEMO). */
  patient: string;
  /** Índice de DEMO_AGENDA: la cita «Llegó» de hoy de la que viene. */
  appointment?: number;
  route: VisitRoute;
  coverage: ArrivalCoverageInput;
  /** Minutos antes del reinicio en que llegó. */
  arrivedAgo: number;
  /** Pasos siguientes, en orden, con sus minutos antes del reinicio. */
  steps: readonly { step: Step; ago: number }[];
  nursing?: DemoNursing;
}

interface DemoSiteVisits {
  org: Org;
  site: 0 | 1;
  recepcion: string;
  enfermeria: string;
  proveedor: string | null;
  visits: readonly DemoVisit[];
}

const insurance = (insurerName: string, memberId: string, term: 'copay' | 'coinsurance', value: string): ArrivalCoverageInput => ({
  type: 'insurance',
  insurerName,
  memberId,
  term,
  value,
});
const selfPay: ArrivalCoverageInput = { type: 'self_pay' };
function arrivedIndex(position: 0 | 1): number {
  const index = TODAY_ARRIVED[position];
  if (index === undefined) throw new Error('DEMO_AGENDA sin las dos citas «Llegó» de hoy');
  return index;
}
const ARRIVED_0830 = arrivedIndex(0);
const ARRIVED_0900 = arrivedIndex(1);

/**
 * Visitas abiertas a la hora del reinicio. NOR1 tiene un paciente en cada
 * estado de 3A y los tres casos de alergias (ADR 0040); SUR1, unas pocas para
 * comprobar el aislamiento. Ninguna usa a los pacientes de los guiones.
 */
export const DEMO_VISITS: readonly DemoSiteVisits[] = [
  {
    org: DEMO.norte,
    site: 0,
    recepcion: 'recepcion.norte@example.test',
    enfermeria: 'enfermeria.norte@example.test',
    proveedor: 'proveedora.nor1@example.test',
    visits: [
      // Cita de las 8:30 → Listo para caja.
      {
        patient: 'Sofía Navarro Morales',
        appointment: ARRIVED_0830,
        route: 'STANDARD',
        coverage: insurance('Seguro Ficticio Azul', 'FIC-000109', 'copay', '25.00'),
        arrivedAgo: 95,
        steps: [
          { step: 'send_to_nurse', ago: 94 },
          { step: 'nursing', ago: 85 },
          { step: 'send_to_provider', ago: 75 },
          { step: 'start_consult', ago: 60 },
          { step: 'ready_for_checkout', ago: 40 },
        ],
        nursing: { vitals: true, allergyStatus: 'none_known', symptoms: 'Control de presión arterial (ficticio).' },
      },
      // Cita de las 9:00 → Con proveedor, con alergias registradas.
      {
        patient: 'Valentina Castillo Ríos',
        appointment: ARRIVED_0900,
        route: 'STANDARD',
        coverage: selfPay,
        arrivedAgo: 70,
        steps: [
          { step: 'send_to_nurse', ago: 69 },
          { step: 'nursing', ago: 60 },
          { step: 'send_to_provider', ago: 50 },
          { step: 'start_consult', ago: 30 },
        ],
        nursing: { vitals: true, allergyStatus: 'recorded', allergies: 'Penicilina (ficticia).', symptoms: 'Dolor de cabeza desde hace dos días (ficticio).' },
      },
      // Esperando proveedor hace 15 min → «Crítico»; sin asignar; sin alergias conocidas.
      {
        patient: 'Raúl Ortiz Fuentes',
        route: 'STANDARD',
        coverage: selfPay,
        arrivedAgo: 40,
        steps: [
          { step: 'send_to_nurse', ago: 39 },
          { step: 'nursing', ago: 30 },
          { step: 'send_to_provider', ago: 15 },
        ],
        nursing: { vitals: true, allergyStatus: 'none_known', symptoms: 'Tos leve desde hace una semana (ficticia).' },
      },
      // Con enfermería, sin signos vitales y con las alergias sin registrar (la demo prueba aquí la excepción).
      {
        patient: 'Ángel Domínguez Vega',
        route: 'STANDARD',
        coverage: selfPay,
        arrivedAgo: 25,
        steps: [
          { step: 'send_to_nurse', ago: 24 },
          { step: 'nursing', ago: 20 },
        ],
        nursing: { vitals: false, allergyStatus: 'not_recorded', symptoms: 'Dolor de garganta (ficticio).' },
      },
      // Ruta directa → Procedimiento pendiente.
      {
        patient: 'Óscar Delgado Núñez',
        route: 'INJECTION_ONLY',
        coverage: selfPay,
        arrivedAgo: 20,
        steps: [{ step: 'send_to_procedure', ago: 19 }],
      },
      // Registrado hace 12 min → «Crítico».
      {
        patient: 'Gabriela Jiménez Soto',
        route: 'STANDARD',
        coverage: insurance('Seguro Ficticio Verde', 'FIC-000113', 'coinsurance', '20'),
        arrivedAgo: 12,
        steps: [],
      },
      // Esperando enfermería hace 6 min → «Alerta».
      {
        patient: 'Tomás Gutiérrez León',
        route: 'STANDARD',
        coverage: selfPay,
        arrivedAgo: 9,
        steps: [{ step: 'send_to_nurse', ago: 6 }],
      },
    ],
  },
  {
    org: DEMO.sur,
    site: 0,
    recepcion: 'recepcion.sur@example.test',
    // Mario Dos Clínicas: Enfermería en SUR1.
    enfermeria: 'multi@example.test',
    proveedor: null,
    visits: [
      {
        patient: 'Camila Álvarez Ponce',
        appointment: ARRIVED_0830,
        route: 'STANDARD',
        coverage: selfPay,
        arrivedAgo: 80,
        steps: [
          { step: 'send_to_nurse', ago: 79 },
          { step: 'nursing', ago: 70 },
          { step: 'send_to_provider', ago: 60 },
        ],
        nursing: { vitals: true, allergyStatus: 'none_known', symptoms: 'Revisión anual (ficticia).' },
      },
      {
        patient: 'Jorge Mendoza Ibarra',
        appointment: ARRIVED_0900,
        route: 'STANDARD',
        coverage: selfPay,
        arrivedAgo: 50,
        steps: [
          { step: 'send_to_nurse', ago: 49 },
          { step: 'nursing', ago: 45 },
        ],
        nursing: { vitals: true, allergyStatus: 'not_recorded', symptoms: 'Dolor de espalda (ficticio).' },
      },
      { patient: 'Emilio Cabrera Solís', route: 'STANDARD', coverage: selfPay, arrivedAgo: 10, steps: [{ step: 'send_to_nurse', ago: 8 }] },
      { patient: 'Ramón Acosta Lara', route: 'STANDARD', coverage: selfPay, arrivedAgo: 3, steps: [] },
    ],
  },
];

/** Tableta ya vinculada en la primera sede de cada organización (la vincula su Propietario). */
export const DEMO_TABLET_NAME = 'Tableta recepción (demo)';
const OWNERS: Record<string, string> = {
  [DEMO.norte.id]: 'propietario.norte@example.test',
  [DEMO.sur.id]: 'propietario.sur@example.test',
};

const META: RequestMeta = { ip: null, requestId: 'semilla-demo' };
const VITALS = { weightLb: 160, heightIn: 66, systolic: 122, diastolic: 78, pulse: 72, temperatureF: 98.4, spo2: 98 };

/** El usuario ficticio, como si hubiera entrado y elegido esa sede. */
async function principalOf(app: Pick<ClinicApp, 'pool' | 'resolver'>, email: string, org: Org, site: 0 | 1): Promise<Principal> {
  const [found] = await drizzle({ client: app.pool })
    .select({ id: userTable.id, name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.email, email));
  if (!found) throw new Error(`Falta el usuario ficticio ${email}`);
  const assignments = await app.resolver.loadAssignments(found.id);
  const locationId = org.locations[site].id;
  const roles = rolesAt(assignments, org.id, locationId);
  if (roles.length === 0) throw new Error(`${email} no tiene rol en ${org.locations[site].code}`);
  return {
    userId: found.id,
    name: found.name,
    email: found.email,
    sessionId: 'semilla-demo',
    twoFactorEnabled: false,
    assignments,
    context: { organizationId: org.id, locationId },
    roles,
    permissions: permissionsFor(roles),
    mfaRequired: false,
  };
}

function patientId(org: Org, name: string): string {
  const found = org.patients.find((p) => `${p.firstName} ${p.lastName}` === name);
  if (!found) throw new Error(`Paciente ficticio desconocido: ${name}`);
  return found.id;
}

/** Inicio del día de la sede (para que las llegadas con cita no caigan en el día anterior). */
async function siteDayStart(app: Pick<ClinicApp, 'pool'>, org: Org, site: 0 | 1, now: Date): Promise<Date> {
  const [row] = await createTenantDb(app.pool).withTenant(org.id, (tx) =>
    tx.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, org.locations[site].id)),
  );
  if (!row) throw new Error('Sede desconocida');
  const { rows } = await app.pool.query<{ start: Date }>(
    `select ((($1::timestamptz at time zone $2)::date)::timestamp at time zone $2) as start`,
    [now.toISOString(), row.timezone],
  );
  return rows[0]?.start ?? now;
}

/**
 * Siembra las visitas de DEMO_VISITS y las tabletas vinculadas. Necesita los
 * usuarios y las citas. Idempotente: si la organización ya tiene visitas, no
 * hace nada. Al terminar, el reloj vuelve a la hora de partida.
 */
export async function seedDevEncounters(app: Pick<ClinicApp, 'pool' | 'resolver' | 'services'>, clock: FixedClock): Promise<void> {
  const start = clock.now();
  const tenantDb = createTenantDb(app.pool);
  const s = app.services;
  try {
    for (const siteVisits of DEMO_VISITS) {
      const { org, site } = siteVisits;
      const existing = await tenantDb.withTenant(org.id, (tx) => tx.select({ id: encounters.id }).from(encounters).limit(1));
      if (existing.length > 0) continue;
      const recepcion = await principalOf(app, siteVisits.recepcion, org, site);
      const enfermeria = await principalOf(app, siteVisits.enfermeria, org, site);
      const proveedor = siteVisits.proveedor ? await principalOf(app, siteVisits.proveedor, org, site) : null;
      const dayStart = await siteDayStart(app, org, site, start);
      for (const [index, visit] of siteVisits.visits.entries()) {
        // Con cita, nunca antes del inicio del día de la sede (la llegada exige
        // una cita de hoy): poco después de medianoche, los pasos se apiñan al
        // empezar el día, un segundo uno tras otro y en el mismo orden.
        const at = (ago: number) => {
          const instant = start.getTime() - ago * 60_000;
          const earliest = dayStart.getTime() + (1 + visit.arrivedAgo - ago) * 1000;
          clock.set(new Date(visit.appointment === undefined ? instant : Math.max(instant, earliest)));
        };
        at(visit.arrivedAgo);
        const key = `semilla-demo-${org.locations[site].code}-${String(index)}`;
        let version: number;
        let id: string;
        if (visit.appointment !== undefined) {
          const appointmentId = demoAppointmentId(org, site, visit.appointment);
          const context = await s.encounters.appointmentContext(recepcion, appointmentId, META);
          const result = await s.encounters.arrive(
            recepcion,
            { source: 'appointment', appointmentId, expectedVersion: context.appointment?.version ?? 1, route: visit.route, coverage: visit.coverage },
            key,
            META,
          );
          ({ id, version } = result.encounter);
        } else {
          const result = await s.encounters.arrive(
            recepcion,
            { source: 'walk_in', patientId: patientId(org, visit.patient), appointmentTypeId: null, route: visit.route, coverage: visit.coverage },
            key,
            META,
          );
          ({ id, version } = result.encounter);
        }
        for (const { step, ago } of visit.steps) {
          at(ago);
          switch (step) {
            case 'send_to_nurse':
            case 'send_to_procedure':
              version = (await s.encounters.transition(recepcion, id, { action: step, expectedVersion: version }, META)).version;
              break;
            case 'nursing': {
              const nursing = visit.nursing;
              if (!nursing) throw new Error('Falta la enfermería de la visita');
              if (nursing.vitals) {
                version = (await s.nursing.saveVitals(enfermeria, id, { changes: VITALS, expectedVersion: 0 }, META)).encounterVersion;
              }
              version = (
                await s.nursing.saveAssessment(
                  enfermeria,
                  id,
                  {
                    allergyStatus: nursing.allergyStatus,
                    history: nursing.allergies ? { allergies: nursing.allergies } : {},
                    visit: { symptoms: nursing.symptoms },
                    historyVersion: 0,
                    assessmentVersion: 0,
                  },
                  META,
                )
              ).encounterVersion;
              break;
            }
            case 'send_to_provider':
              version = (await s.nursing.sendToProvider(enfermeria, id, { expectedVersion: version }, META)).encounterVersion;
              break;
            case 'start_consult':
            case 'ready_for_checkout': {
              if (!proveedor) throw new Error('La sede no tiene proveedor en la semilla');
              version =
                step === 'start_consult'
                  ? (await s.encounters.startConsult(proveedor, id, { expectedVersion: version }, META)).version
                  : (await s.encounters.transition(proveedor, id, { action: step, expectedVersion: version }, META)).version;
              break;
            }
          }
        }
      }
    }

    // Tabletas: la vincula el Propietario con un código de un solo uso, como en Sedes.
    clock.set(start);
    for (const { org, site } of DEMO_VISIT_SITES) {
      const locationId = org.locations[site].id;
      const existing = await tenantDb.withTenant(org.id, (tx) =>
        tx.select({ id: kioskDevices.id }).from(kioskDevices).where(and(eq(kioskDevices.organizationId, org.id), eq(kioskDevices.locationId, locationId))).limit(1),
      );
      if (existing.length > 0) continue;
      const owner = await principalOf(app, OWNERS[org.id] ?? '', org, site);
      const pairing = await s.kioskAdmin.createPairing(owner, locationId, { name: DEMO_TABLET_NAME }, META);
      await s.kiosk.link({ locationCode: org.locations[site].code, code: pairing.code }, META);
    }
  } finally {
    clock.set(start);
  }
}
