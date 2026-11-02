import {
  appointmentTypes,
  encounterAssessments,
  encounterEvents,
  encounters,
  encounterVitals,
  locations,
  memberships,
  organizations,
  patientHistories,
  patients,
  user as userTable,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  bmiOf,
  cleanText,
  EMPTY_VITALS,
  hasRequiredVitals,
  HISTORY_FIELDS,
  nursingLock,
  nursingSendSteps,
  saveAssessmentSchema,
  saveVitalsSchema,
  sendToProviderSchema,
  VISIT_ASSESSMENT_FIELDS,
  VITAL_FIELDS,
  vitalError,
  vitalsCrossErrors,
  visitTransition,
  waitLevel,
  type AllergyNotice,
  type AllergyStatus,
  type HistoryField,
  type NursingAbilities,
  type NursingQueue,
  type NursingQueueRow,
  type NursingSaved,
  type NursingSection,
  type NursingVitals,
  type PatientHistoryView,
  type VisitAssessmentField,
  type VisitAssessmentView,
  type VisitRoute,
  type VisitStatus,
  type VitalField,
  type VitalsValues,
} from '@clinic/shared';
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import type { EncounterService, LockedEncounter } from './encounters.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Enfermería (T-022; S-CLI-01, S-CLI-13 a 16).
//  - Cola de enfermería de la sede activa, con la hora del reloj inyectable.
//  - Sección Enfermería: vista completa (Enfermería y Proveedor: nursing.view)
//    o limitada (Recepción: solo fechas, nunca valores). Lectura auditada.
//  - Signos vitales (Enfermería y Proveedor) y valoración (solo Enfermería,
//    ADR 0036): cada registro con su versión (409 si otra persona guardó
//    antes), bloqueados en Caja y con la visita cerrada. El primer guardado de
//    Enfermería en «Esperando enfermería» inicia la enfermería por la máquina
//    de estados.
//  - Historia del paciente: una versión nueva por cambio, cifrada; las
//    alergias con su estado (ADR 0040).
//  - «Enviar al proveedor» (ADR 0003): exige peso o presión completa
//    guardados; la excepción, con motivo, del Propietario o el Administrador
//    con un rol clínico (ADR 0033).
//  - Auditoría con solo los nombres de los campos (ADR 0018); ni valores ni
//    textos clínicos en la auditoría, los logs ni los eventos en vivo.

const historyColumn: Record<HistoryField, keyof typeof patientHistories.$inferSelect> = {
  allergies: 'allergiesEnc',
  personalHistory: 'personalHistoryEnc',
  familyHistory: 'familyHistoryEnc',
  surgeries: 'surgeriesEnc',
  lifestyle: 'lifestyleEnc',
  reproductiveHistory: 'reproductiveHistoryEnc',
};
const historyContextColumn: Record<HistoryField, string> = {
  allergies: 'allergies',
  personalHistory: 'personal_history',
  familyHistory: 'family_history',
  surgeries: 'surgeries',
  lifestyle: 'lifestyle',
  reproductiveHistory: 'reproductive_history',
};
const assessmentColumn: Record<VisitAssessmentField, 'symptomsEnc' | 'nursingNotesEnc'> = { symptoms: 'symptomsEnc', nursingNotes: 'nursingNotesEnc' };
const assessmentContextColumn: Record<VisitAssessmentField, string> = { symptoms: 'symptoms', nursingNotes: 'nursing_notes' };

/** Enteros de la base (centésimas y décimas) ↔ números de la API. */
const VITAL_SCALE: Record<VitalField, number> = {
  weightLb: 100,
  heightIn: 100,
  systolic: 1,
  diastolic: 1,
  pulse: 1,
  respirations: 1,
  temperatureF: 10,
  spo2: 1,
  glucose: 1,
  pain: 1,
};
const vitalColumn: Record<VitalField, keyof typeof encounterVitals.$inferSelect> = {
  weightLb: 'weightLbX100',
  heightIn: 'heightInX100',
  systolic: 'systolic',
  diastolic: 'diastolic',
  pulse: 'pulse',
  respirations: 'respirations',
  temperatureF: 'temperatureFX10',
  spo2: 'spo2',
  glucose: 'glucose',
  pain: 'pain',
};

function vitalsOf(row: typeof encounterVitals.$inferSelect | undefined): VitalsValues | null {
  if (!row) return null;
  const values = { ...EMPTY_VITALS };
  for (const field of VITAL_FIELDS) {
    const raw = row[vitalColumn[field]] as number | null;
    values[field] = raw === null ? null : raw / VITAL_SCALE[field];
  }
  return values;
}

/** La historia vigente del paciente (la versión mayor), descifrada. Nula si aún no hay. */
export async function latestHistory(tx: Tx, cipher: FieldCipher, organizationId: string, patientId: string): Promise<PatientHistoryView | null> {
  const [row] = await tx.select().from(patientHistories).where(eq(patientHistories.patientId, patientId)).orderBy(desc(patientHistories.version)).limit(1);
  if (!row) return null;
  const fields = Object.fromEntries(HISTORY_FIELDS.map((f) => [f, null])) as Record<HistoryField, string | null>;
  for (const field of HISTORY_FIELDS) {
    const value = row[historyColumn[field]] as string | null;
    fields[field] = value ? await cipher.decrypt(value, { organizationId, table: 'patient_histories', column: historyContextColumn[field], recordId: row.id }) : null;
  }
  return { allergyStatus: row.allergyStatus as AllergyStatus, fields, version: row.version, recordedAt: row.recordedAt.toISOString() };
}

/** Aviso de alergias del encabezado (ADR 0040): sin historia, «no registradas». */
export function allergyNotice(history: PatientHistoryView | null): AllergyNotice {
  if (!history) return { status: 'not_recorded', text: null };
  return { status: history.allergyStatus, text: history.allergyStatus === 'recorded' ? history.fields.allergies : null };
}

export class NursingService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #clock: Clock;
  readonly #encounters: EncounterService;

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, clock: Clock, encounters: EncounterService) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#cipher = cipher;
    this.#clock = clock;
    this.#encounters = encounters;
  }

  /**
   * S-CLI-01 Cola de enfermería: «Esperando enfermería» y «Con enfermería» de
   * cualquier ruta, y «Procedimiento pendiente» solo de las rutas directas;
   * la llegada más antigua primero. Lectura auditada (con el número de filas).
   */
  async queue(actor: Principal, meta: RequestMeta): Promise<NursingQueue> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [site] = await tx.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, ctx.locationId));
      const [org] = await tx
        .select({ alertMinutes: organizations.waitAlertMinutes, criticalMinutes: organizations.waitCriticalMinutes })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      if (!site || !org) throw new HttpError(403, 'no_active_context');
      const rows = await tx
        .select({
          id: encounters.id,
          code: encounters.code,
          status: encounters.status,
          route: encounters.route,
          version: encounters.version,
          arrivedAt: encounters.arrivedAt,
          providerMembershipId: encounters.providerMembershipId,
          statusSince: sql<Date | string | null>`(select ${encounterEvents.occurredAt} from ${encounterEvents} where ${encounterEvents.encounterId} = ${encounters.id} order by ${encounterEvents.encounterVersion} desc, ${encounterEvents.occurredAt} desc limit 1)`,
          patientId: patients.id,
          patientCode: patients.code,
          firstName: patients.firstName,
          lastName: patients.lastName,
          typeName: appointmentTypes.name,
        })
        .from(encounters)
        .innerJoin(patients, eq(patients.id, encounters.patientId))
        .leftJoin(appointmentTypes, eq(appointmentTypes.id, encounters.appointmentTypeId))
        .where(
          and(
            eq(encounters.locationId, ctx.locationId),
            or(inArray(encounters.status, ['WAITING_FOR_NURSE', 'WITH_NURSE']), and(eq(encounters.status, 'PROCEDURE_PENDING'), ne(encounters.route, 'STANDARD'))),
          ),
        )
        .orderBy(asc(encounters.arrivedAt), asc(encounters.code));
      const providerIds = [...new Set(rows.map((r) => r.providerMembershipId).filter((id): id is string => id !== null))];
      const providers = providerIds.length > 0 ? await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, providerIds)) : [];
      const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, actor.userId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'encounter.nursing_queue',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'encounter',
        ...meta,
        metadata: { results: rows.length },
      });
      return { site, org, rows, providers, me: mine?.id ?? '' };
    });
    const names = await this.#names(data.providers.map((m) => m.userId));
    const thresholds = { alertMinutes: data.org.alertMinutes, criticalMinutes: data.org.criticalMinutes };
    return {
      serverNow: now.toISOString(),
      timeZone: data.site.timezone,
      myMembershipId: data.me,
      waitThresholds: thresholds,
      canStart: actor.roles.includes('enfermeria'),
      rows: data.rows.map((r): NursingQueueRow => {
        const status = r.status as VisitStatus;
        const statusSince = (r.statusSince ? new Date(r.statusSince) : r.arrivedAt).toISOString();
        const member = data.providers.find((m) => m.id === r.providerMembershipId);
        return {
          id: r.id,
          code: r.code,
          status,
          route: r.route as VisitRoute,
          version: r.version,
          arrivedAt: r.arrivedAt.toISOString(),
          statusSince,
          patient: { id: r.patientId, code: r.patientCode, firstName: r.firstName, lastName: r.lastName },
          provider: r.providerMembershipId ? { membershipId: r.providerMembershipId, name: member ? (names.get(member.userId) ?? '') : '' } : null,
          appointmentType: r.typeName,
          // ADR 0039: en la cola, la marca solo en «Esperando enfermería».
          waitLevel: status === 'WAITING_FOR_NURSE' ? waitLevel({ status, statusSince }, now.getTime(), thresholds) : 'none',
        };
      }),
    };
  }

  /** S-CLI-13: la sección Enfermería de una visita de la sede activa. Lectura auditada. */
  async section(actor: Principal, encounterId: string, meta: RequestMeta): Promise<NursingSection> {
    const ctx = requireContext(actor);
    const full = actor.permissions.has('nursing.view');
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [e] = await tx
        .select({ id: encounters.id, status: encounters.status, route: encounters.route, version: encounters.version, patientId: encounters.patientId })
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, ctx.locationId)));
      if (!e) throw new HttpError(404, 'encounter_not_found');
      const status = e.status as VisitStatus;
      const route = e.route as VisitRoute;
      const [vitalsRow] = await tx.select().from(encounterVitals).where(eq(encounterVitals.encounterId, e.id));
      const [assessmentRow] = await tx.select().from(encounterAssessments).where(eq(encounterAssessments.encounterId, e.id));
      const [sent] = await tx
        .select({ at: encounterEvents.occurredAt })
        .from(encounterEvents)
        .where(and(eq(encounterEvents.encounterId, e.id), eq(encounterEvents.action, 'send_to_provider')))
        .orderBy(desc(encounterEvents.encounterVersion))
        .limit(1);
      const values = vitalsOf(vitalsRow);
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'encounter.nursing_view',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'encounter',
        entityId: e.id,
        ...meta,
        metadata: { view: full ? 'full' : 'limited' },
      });
      const vitals: NursingVitals | null =
        full && vitalsRow && values
          ? {
              values,
              bmi: vitalsRow.bmiX10 === null ? null : vitalsRow.bmiX10 / 10,
              recordedAt: vitalsRow.recordedAt.toISOString(),
              updatedAt: vitalsRow.updatedAt.toISOString(),
              version: vitalsRow.version,
            }
          : null;
      const history = full ? ((await latestHistory(tx, this.#cipher, ctx.organizationId, e.patientId)) ?? emptyHistory()) : null;
      const assessment = full ? await this.#assessmentView(ctx.organizationId, assessmentRow) : null;
      return {
        encounterId: e.id,
        status,
        route,
        encounterVersion: e.version,
        view: full ? 'full' : 'limited',
        summary: {
          vitalsAt: vitalsRow ? vitalsRow.updatedAt.toISOString() : null,
          assessmentAt: assessmentRow ? assessmentRow.updatedAt.toISOString() : null,
          completedAt: sent ? sent.at.toISOString() : null,
        },
        vitals,
        history,
        assessment,
        hasRequiredVitals: hasRequiredVitals(values),
        lock: nursingLock(status),
        abilities: this.#abilities(actor, status, route),
      };
    });
  }

  /** S-CLI-14 «Guardar signos vitales»: solo los campos cambiados; vaciar borra. */
  async saveVitals(actor: Principal, encounterId: string, raw: unknown, meta: RequestMeta): Promise<NursingSaved> {
    const input = saveVitalsSchema.parse(raw);
    if (!actor.permissions.has('nursing.vitals')) throw new HttpError(403, 'forbidden');
    for (const [field, value] of Object.entries(input.changes) as [VitalField, number | null][]) {
      if (value !== null && vitalError(field, value) !== null) throw new HttpError(400, 'invalid_vitals', { field });
    }
    const out: { saved?: NursingSaved } = {};
    await this.#encounters.change(actor, encounterId, async (tx, current, me, now) => {
      this.#requireWritable(current.status);
      const [row] = await tx.select().from(encounterVitals).where(eq(encounterVitals.encounterId, current.id)).for('update');
      if ((row?.version ?? 0) !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
      const before = vitalsOf(row) ?? { ...EMPTY_VITALS };
      const merged: VitalsValues = { ...before, ...input.changes };
      const cross = vitalsCrossErrors(merged);
      if (cross.diastolic) throw new HttpError(400, 'invalid_vitals', { field: 'diastolic' });
      if (cross.bmi) throw new HttpError(400, 'invalid_vitals', { field: 'bmi' });
      const changed = VITAL_FIELDS.filter((f) => merged[f] !== before[f]);
      const bmi = bmiOf(merged.weightLb, merged.heightIn);
      const columns = Object.fromEntries(
        VITAL_FIELDS.map((f) => {
          const value = merged[f];
          return [vitalColumn[f], value === null ? null : Math.round(value * VITAL_SCALE[f])];
        }),
      );
      let version = row?.version ?? 0;
      if (changed.length > 0 || !row) {
        version += 1;
        const values = { ...columns, bmiX10: bmi === null ? null : Math.round(bmi * 10), updatedByMembershipId: me, updatedAt: now, version };
        if (row) await tx.update(encounterVitals).set(values).where(eq(encounterVitals.id, row.id));
        else await tx.insert(encounterVitals).values({ organizationId: current.organizationId, encounterId: current.id, recordedByMembershipId: me, recordedAt: now, ...values });
        await this.#audit.inTx(tx, current.organizationId, {
          action: 'encounter.vitals_saved',
          ...this.#auditBase(actor, current, meta),
          // ADR 0018: solo los nombres de los campos.
          metadata: { code: current.code, fields: changed.join(','), version },
        });
      }
      out.saved = await this.#afterSave(tx, actor, current, me, now, meta, { version });
    });
    if (!out.saved) throw new HttpError(500, 'internal');
    return out.saved;
  }

  /**
   * S-CLI-15 «Guardar valoración»: la historia del paciente (una versión
   * nueva si cambió) y la valoración de la visita, en una transacción. Solo
   * Enfermería (ADR 0036).
   */
  async saveAssessment(actor: Principal, encounterId: string, raw: unknown, meta: RequestMeta): Promise<NursingSaved> {
    const input = saveAssessmentSchema.parse(raw);
    if (!actor.permissions.has('nursing.assessment')) throw new HttpError(403, 'forbidden');
    const out: { saved?: NursingSaved } = {};
    await this.#encounters.change(actor, encounterId, async (tx, current, me, now) => {
      this.#requireWritable(current.status);
      // La historia es del paciente: se serializan los guardados de distintas visitas.
      await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, current.patientId)).for('update');
      const history = await latestHistory(tx, this.#cipher, current.organizationId, current.patientId);
      if ((history?.version ?? 0) !== input.historyVersion) throw new HttpError(409, 'version_conflict');
      const [assessmentRow] = await tx.select().from(encounterAssessments).where(eq(encounterAssessments.encounterId, current.id)).for('update');
      if ((assessmentRow?.version ?? 0) !== input.assessmentVersion) throw new HttpError(409, 'version_conflict');

      // Historia del paciente: lo vigente más los cambios.
      const beforeHistory = history ?? emptyHistory();
      const nextFields = { ...beforeHistory.fields };
      for (const [field, value] of Object.entries(input.history) as [HistoryField, string | null][]) nextFields[field] = cleanText(value);
      // ADR 0040: con texto, «registradas»; si no, el estado que se envía (sin texto).
      const allergyStatus: AllergyStatus = nextFields.allergies !== null ? 'recorded' : input.allergyStatus === 'recorded' ? 'not_recorded' : input.allergyStatus;
      if (allergyStatus !== 'recorded') nextFields.allergies = null;
      const historyChanged = HISTORY_FIELDS.filter((f) => nextFields[f] !== beforeHistory.fields[f]);
      const statusChanged = allergyStatus !== beforeHistory.allergyStatus;
      let historyVersion = history?.version ?? 0;
      if (historyChanged.length > 0 || statusChanged) {
        historyVersion += 1;
        const id = uuidv7();
        const encrypted: Record<string, string | null> = {};
        for (const field of HISTORY_FIELDS) {
          const value = nextFields[field];
          encrypted[historyColumn[field]] = value
            ? await this.#cipher.encrypt(value, { organizationId: current.organizationId, table: 'patient_histories', column: historyContextColumn[field], recordId: id })
            : null;
        }
        await tx.insert(patientHistories).values({
          id,
          organizationId: current.organizationId,
          patientId: current.patientId,
          version: historyVersion,
          allergyStatus,
          ...encrypted,
          encounterId: current.id,
          locationId: current.locationId,
          recordedByMembershipId: me,
          recordedAt: now,
        });
        await this.#audit.inTx(tx, current.organizationId, {
          action: 'patient.history_saved',
          actorType: 'user',
          actorId: actor.userId,
          locationId: current.locationId,
          entityType: 'patient',
          entityId: current.patientId,
          ...meta,
          metadata: { encounter: current.code, fields: (statusChanged ? [...historyChanged, 'allergyStatus'] : historyChanged).join(','), version: historyVersion },
        });
      }

      // Valoración de la visita.
      const beforeVisit = await this.#assessmentView(current.organizationId, assessmentRow);
      const nextVisit = { ...beforeVisit.fields };
      for (const [field, value] of Object.entries(input.visit) as [VisitAssessmentField, string | null][]) nextVisit[field] = cleanText(value);
      const visitChanged = VISIT_ASSESSMENT_FIELDS.filter((f) => nextVisit[f] !== beforeVisit.fields[f]);
      let version = assessmentRow?.version ?? 0;
      // Cualquier guardado deja constancia en la visita («Actualizado …», S-CLI-13).
      if (visitChanged.length > 0 || historyChanged.length > 0 || statusChanged || !assessmentRow) {
        version += 1;
        const id = assessmentRow?.id ?? uuidv7();
        const encrypted: Record<string, string | null> = {};
        for (const field of VISIT_ASSESSMENT_FIELDS) {
          const value = nextVisit[field];
          encrypted[assessmentColumn[field]] = value
            ? await this.#cipher.encrypt(value, { organizationId: current.organizationId, table: 'encounter_assessments', column: assessmentContextColumn[field], recordId: id })
            : null;
        }
        if (assessmentRow) await tx.update(encounterAssessments).set({ ...encrypted, updatedByMembershipId: me, updatedAt: now, version }).where(eq(encounterAssessments.id, id));
        else
          await tx.insert(encounterAssessments).values({
            id,
            organizationId: current.organizationId,
            encounterId: current.id,
            ...encrypted,
            recordedByMembershipId: me,
            recordedAt: now,
            updatedByMembershipId: me,
            updatedAt: now,
            version,
          });
        if (visitChanged.length > 0 || !assessmentRow) {
          await this.#audit.inTx(tx, current.organizationId, {
            action: 'encounter.assessment_saved',
            ...this.#auditBase(actor, current, meta),
            metadata: { code: current.code, fields: visitChanged.join(','), version },
          });
        }
      }
      out.saved = await this.#afterSave(tx, actor, current, me, now, meta, { version, historyVersion });
    });
    if (!out.saved) throw new HttpError(500, 'internal');
    return out.saved;
  }

  /**
   * S-CLI-16 «Enviar al proveedor» (ADR 0003): Esperando enfermería o Con
   * enfermería, ruta Estándar. Regular: el rol dueño (Enfermería) y peso o
   * presión guardados. Con motivo: la excepción del ADR 0033.
   */
  async sendToProvider(actor: Principal, encounterId: string, raw: unknown, meta: RequestMeta): Promise<NursingSaved> {
    const input = sendToProviderSchema.parse(raw);
    const exception = input.reason !== undefined;
    if (exception && !this.#canException(actor)) throw new HttpError(403, 'forbidden');
    const out: { saved?: NursingSaved } = {};
    await this.#encounters.change(actor, encounterId, async (tx, current, me, now) => {
      if (current.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
      if (current.closedAt !== null) throw new HttpError(409, 'encounter_closed');
      const steps = nursingSendSteps(current.status, current.route);
      if (!steps) throw new HttpError(409, 'not_with_nurse');
      // El primer paso decide quién puede (antes de mirar los signos vitales); los siguientes se comprueban al darlos.
      const [first] = steps;
      const check = first ? visitTransition(current.status, first, { route: current.route, roles: actor.roles, asOwner: exception }) : null;
      if (check && !check.ok) throw check.reason === 'forbidden' ? new HttpError(403, 'transition_not_owned') : new HttpError(409, check.reason);
      if (!exception) {
        const [row] = await tx.select().from(encounterVitals).where(eq(encounterVitals.encounterId, current.id));
        if (!hasRequiredVitals(vitalsOf(row))) throw new HttpError(409, 'vitals_required');
      }
      let state = current;
      for (const action of steps) {
        const step = visitTransition(state.status, action, { route: state.route, roles: actor.roles, asOwner: exception });
        if (!step.ok) throw new HttpError(409, step.reason === 'forbidden' ? 'transition_not_owned' : step.reason);
        const last = action === 'send_to_provider';
        await this.#encounters.move(tx, actor, state, me, now, meta, {
          action,
          to: step.to,
          forced: false,
          reason: exception && last ? (input.reason ?? null) : null,
          audit: exception && last ? 'encounter.nursing_exception' : 'encounter.transitioned',
        });
        state = { ...state, status: step.to, version: state.version + 1 };
      }
      out.saved = { version: state.version, encounterStatus: state.status, encounterVersion: state.version, startedNursing: steps.includes('start_nursing') };
    });
    if (!out.saved) throw new HttpError(500, 'internal');
    return out.saved;
  }

  // --- Ayudas ----------------------------------------------------------------

  #abilities(actor: Principal, status: VisitStatus, route: VisitRoute): NursingAbilities {
    const writable = nursingLock(status) === null;
    const steps = nursingSendSteps(status, route);
    const first = steps?.[0];
    return {
      editVitals: writable && actor.permissions.has('nursing.vitals'),
      editAssessment: writable && actor.permissions.has('nursing.assessment'),
      sendToProvider: first !== undefined && visitTransition(status, first, { route, roles: actor.roles }).ok,
      sendException: first !== undefined && this.#canException(actor),
    };
  }

  /** ADR 0033: nursing.send_exception y además patients.access (un rol clínico en la sede). */
  #canException(actor: Principal): boolean {
    return actor.permissions.has('nursing.send_exception') && actor.permissions.has('patients.access');
  }

  #requireWritable(status: VisitStatus): void {
    const lock = nursingLock(status);
    if (lock === 'checkout') throw new HttpError(409, 'nursing_locked');
    if (lock === 'closed') throw new HttpError(409, 'encounter_closed');
  }

  /**
   * Tras guardar: el primer guardado de Enfermería en «Esperando enfermería»
   * inicia la enfermería por la máquina de estados (con su fila del
   * historial); si no, solo el evento en vivo para las demás ventanas.
   */
  async #afterSave(
    tx: Tx,
    actor: Principal,
    current: LockedEncounter,
    me: string,
    now: Date,
    meta: RequestMeta,
    saved: { version: number; historyVersion?: number },
  ): Promise<NursingSaved> {
    const start = current.status === 'WAITING_FOR_NURSE' ? visitTransition(current.status, 'start_nursing', { route: current.route, roles: actor.roles }) : null;
    if (start?.ok) {
      await this.#encounters.move(tx, actor, current, me, now, meta, { action: 'start_nursing', to: start.to, forced: false, reason: null, audit: 'encounter.transitioned' });
      return { ...saved, encounterStatus: start.to, encounterVersion: current.version + 1, startedNursing: true };
    }
    await this.#encounters.changed(tx, current, current.status);
    return { ...saved, encounterStatus: current.status, encounterVersion: current.version, startedNursing: false };
  }

  async #assessmentView(organizationId: string, row: typeof encounterAssessments.$inferSelect | undefined): Promise<VisitAssessmentView> {
    const fields: Record<VisitAssessmentField, string | null> = { symptoms: null, nursingNotes: null };
    if (!row) return { fields, version: 0, updatedAt: null };
    for (const field of VISIT_ASSESSMENT_FIELDS) {
      const value = row[assessmentColumn[field]];
      fields[field] = value ? await this.#cipher.decrypt(value, { organizationId, table: 'encounter_assessments', column: assessmentContextColumn[field], recordId: row.id }) : null;
    }
    return { fields, version: row.version, updatedAt: row.updatedAt.toISOString() };
  }

  #auditBase(actor: Principal, current: LockedEncounter, meta: RequestMeta) {
    return { actorType: 'user' as const, actorId: actor.userId, locationId: current.locationId, entityType: 'encounter', entityId: current.id, ...meta };
  }

  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

function emptyHistory(): PatientHistoryView {
  return { allergyStatus: 'not_recorded', fields: Object.fromEntries(HISTORY_FIELDS.map((f) => [f, null])) as Record<HistoryField, string | null>, version: 0, recordedAt: null };
}
