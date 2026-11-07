import {
  appointments,
  CLOSED_VISIT_STATUS_VALUES,
  charges,
  encounters,
  kioskCheckins,
  locations,
  notifyRealtime,
  orders,
  patientHistories,
  patientMembershipMembers,
  patientMemberships,
  patients,
  settleMembership,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  combineHistories,
  HISTORY_FIELDS,
  type AllergyStatus,
  type HistoryField,
  type MergeBlocker,
  type MergeCandidate,
  type MergeCounts,
  type MergePatientsData,
  type MergePreview,
  type MergeResult,
  type MembershipMemberRole,
  type PatientMembershipStatus,
  type PatientStatus,
} from '@clinic/shared';
import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import type { IdempotencyService } from './idempotency.ts';
import { latestHistory } from './nursing.ts';
import { myMembership } from './payments.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Fusionar pacientes (T-030; S-PAC-13 y 14; ADR 0032). Lo hacen el
// Propietario o el Administrador con un rol clínico en la sede (el controlador
// exige patients.access y patients.merge). Todo en una sola transacción, con
// Idempotency-Key y la versión de los dos pacientes:
//  - bloqueos: los dos activos, distintos y sin fusionar; ninguna sede con
//    visita abierta de los dos; no los dos en una membresía en curso;
//  - citas, visitas (y con ellas órdenes, cargos, cobertura, enfermería y
//    estado de cuenta) y registros del kiosco pasan al principal;
//  - pagos, recibos y membresías, con app.merge_patient_rows() (decisión 1):
//    la aplicación no puede cambiar esas filas;
//  - la historia: una versión nueva del principal que combina las dos
//    (combineHistories, decisión 3); las versiones del duplicado se quedan;
//  - el duplicado queda con merged_into; su código lleva al principal;
//  - auditoría patient.merge con ids, sede, motivo y conteos, sin nombres;
//  - evento patient.changed (solo ids) a todas las sedes de la organización.
// Todo con el reloj inyectable.

/**
 * Cómo trata la fusión cada tabla con una clave foránea hacia app.patients.
 * Una prueba (apps/api/test/patient-merge.test.ts) falla si aparece una tabla
 * nueva que no está aquí (ADR 0032, «Consecuencias»).
 */
export const MERGE_PATIENT_TABLES = {
  appointments: 'se mueve',
  encounters: 'se mueve (con órdenes, cargos, cobertura, enfermería y estado de cuenta)',
  kiosk_checkins: 'se mueve',
  payments: 'se mueve con app.merge_patient_rows()',
  receipts: 'se mueve con app.merge_patient_rows(); la instantánea no cambia',
  patient_memberships: 'el titular, con app.merge_patient_rows()',
  patient_membership_members: 'se mueve con app.merge_patient_rows()',
  patient_membership_events: 'se mueve con app.merge_patient_rows()',
  patient_histories: 'versión combinada nueva del principal; las del duplicado se quedan',
  patients: 'merged_into del duplicado (y de los que ya apuntaban a él)',
} as const;

const historyColumn: Record<HistoryField, 'allergiesEnc' | 'personalHistoryEnc' | 'familyHistoryEnc' | 'surgeriesEnc' | 'lifestyleEnc' | 'reproductiveHistoryEnc'> = {
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

const openVisit = notInArray(encounters.status, [...CLOSED_VISIT_STATUS_VALUES]);

/** Violación de un índice único, con el nombre de la restricción. */
function uniqueViolation(error: unknown): string | null {
  const pgError = ((error as { cause?: unknown }).cause ?? error) as { code?: string; constraint?: string };
  return pgError.code === '23505' ? (pgError.constraint ?? '') : null;
}

type PatientRow = typeof patients.$inferSelect;

interface Facts {
  row: PatientRow;
  openVisitLocations: { id: string; code: string }[];
  membership: MergeCandidate['membership'];
}

/** Lo que impide fusionar a los dos, sin importar la dirección. */
export function mergeBlockers(a: Facts, b: Facts): MergeBlocker[] {
  const blockers: MergeBlocker[] = [];
  if (a.row.id === b.row.id) return ['same_patient'];
  if (a.row.mergedInto || b.row.mergedInto) blockers.push('patient_merged');
  if (a.row.status !== 'active' || b.row.status !== 'active') blockers.push('patient_not_active');
  const aLocations = new Set(a.openVisitLocations.map((l) => l.id));
  if (b.openVisitLocations.some((l) => aLocations.has(l.id))) blockers.push('open_visits_same_location');
  if (a.membership && b.membership) blockers.push('both_in_membership');
  return blockers;
}

export class PatientMergeService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #idempotency: IdempotencyService;
  readonly #clock: Clock;

  constructor(tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, idempotency: IdempotencyService, clock: Clock) {
    this.#tenantDb = tenantDb;
    this.#audit = audit;
    this.#cipher = cipher;
    this.#idempotency = idempotency;
    this.#clock = clock;
  }

  /** S-PAC-13: las dos tarjetas y lo que impide fusionar. La lectura se audita (muestra datos de los dos). */
  async preview(actor: Principal, patientId: string, otherId: string, meta: RequestMeta): Promise<MergePreview> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const now = this.#clock.now();
      const a = await this.#facts(tx, patientId, now);
      const b = await this.#facts(tx, otherId, now);
      if (!a || !b) throw new HttpError(404, 'patient_not_found');
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'patient.merge_preview',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        entityId: patientId,
        ...meta,
        metadata: { other: otherId },
      });
      return { patients: [await this.#candidate(tx, a), await this.#candidate(tx, b)], blockers: mergeBlockers(a, b) };
    });
  }

  /** S-PAC-14 «Fusionar»: `duplicateId` se fusiona con `input.principalId`. Irreversible. */
  async merge(actor: Principal, duplicateId: string, input: MergePatientsData, idempotencyKey: string, meta: RequestMeta): Promise<MergeResult> {
    const ctx = requireContext(actor);
    const { principalId } = input;
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/patients/${duplicateId}/merge`, body: input },
      async (tx) => {
        const now = this.#clock.now();
        if (principalId === duplicateId) throw new HttpError(409, 'same_patient');
        // Los dos bloqueados, siempre en el mismo orden: dos fusiones cruzadas no se interbloquean.
        const locked = await tx
          .select()
          .from(patients)
          .where(inArray(patients.id, [principalId, duplicateId]))
          .orderBy(asc(patients.id))
          .for('update');
        const principal = locked.find((p) => p.id === principalId);
        const duplicate = locked.find((p) => p.id === duplicateId);
        if (!principal || !duplicate) throw new HttpError(404, 'patient_not_found');
        if (principal.version !== input.principalVersion || duplicate.version !== input.duplicateVersion) throw new HttpError(409, 'version_conflict');
        const a = await this.#facts(tx, principalId, now);
        const b = await this.#facts(tx, duplicateId, now);
        if (!a || !b) throw new HttpError(404, 'patient_not_found');
        const blockers = mergeBlockers(a, b);
        const [first] = blockers;
        if (first) {
          const shared = first === 'open_visits_same_location' ? a.openVisitLocations.filter((l) => b.openVisitLocations.some((o) => o.id === l.id)).map((l) => l.code) : [];
          throw new HttpError(409, first, shared.length > 0 ? { locations: shared } : undefined);
        }

        const me = await myMembership(tx, actor.userId);
        const dupEncounters = await tx.select({ id: encounters.id, locationId: encounters.locationId, status: encounters.status }).from(encounters).where(eq(encounters.patientId, duplicateId));
        const encounterIds = dupEncounters.map((e) => e.id);
        const [orderCount] = encounterIds.length > 0 ? await tx.select({ n: sql<number>`count(*)::int` }).from(orders).where(inArray(orders.encounterId, encounterIds)) : [{ n: 0 }];
        const [chargeCount] = encounterIds.length > 0 ? await tx.select({ n: sql<number>`count(*)::int` }).from(charges).where(inArray(charges.encounterId, encounterIds)) : [{ n: 0 }];

        // La historia combinada, antes de mover nada (decisión 3).
        const history = await this.#combinedHistory(tx, actor, ctx.locationId, me, principal, duplicate, now, meta);

        // El duplicado queda fusionado (y lo que ya estaba fusionado con él apunta al principal).
        await tx.update(patients).set({ mergedInto: principalId, version: duplicate.version + 1, updatedAt: now }).where(eq(patients.id, duplicateId));
        await tx
          .update(patients)
          .set({ mergedInto: principalId, version: sql`${patients.version} + 1`, updatedAt: now })
          .where(and(eq(patients.mergedInto, duplicateId), ne(patients.id, duplicateId)));
        await tx.update(patients).set({ version: principal.version + 1, updatedAt: now }).where(eq(patients.id, principalId));

        const moved = await tx
          .update(appointments)
          .set({ patientId: principalId, version: sql`${appointments.version} + 1`, updatedAt: now })
          .where(eq(appointments.patientId, duplicateId))
          .returning({ id: appointments.id });
        try {
          await tx
            .update(encounters)
            .set({ patientId: principalId, version: sql`${encounters.version} + 1`, updatedAt: now })
            .where(eq(encounters.patientId, duplicateId));
        } catch (error) {
          // Una visita abierta en la misma sede que se abrió mientras tanto.
          if (uniqueViolation(error) === 'encounters_open_patient_location_key') throw new HttpError(409, 'open_visits_same_location');
          throw error;
        }
        const kiosk = await tx
          .update(kioskCheckins)
          .set({ patientId: principalId, version: sql`${kioskCheckins.version} + 1`, updatedAt: now })
          .where(eq(kioskCheckins.patientId, duplicateId))
          .returning({ id: kioskCheckins.id });
        let rows: Record<string, number>;
        try {
          const executed = await tx.execute<{ moved: Record<string, number> }>(sql`select app.merge_patient_rows(${duplicateId}::uuid, ${principalId}::uuid) as moved`);
          rows = executed.rows[0]?.moved ?? {};
        } catch (error) {
          // Los dos en una membresía en curso (se cruzó con una inscripción).
          if (uniqueViolation(error) === 'patient_membership_members_current_key') throw new HttpError(409, 'both_in_membership');
          throw error;
        }

        const counts: MergeCounts = {
          appointments: moved.length,
          encounters: dupEncounters.length,
          orders: orderCount?.n ?? 0,
          charges: chargeCount?.n ?? 0,
          payments: rows.payments ?? 0,
          receipts: rows.receipts ?? 0,
          // Una por persona en la membresía (el titular también tiene su fila de persona).
          memberships: rows.membershipMembers ?? 0,
          kioskCheckins: kiosk.length,
          history,
        };
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'patient.merge',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'patient',
          entityId: duplicateId,
          reason: input.reason,
          ...meta,
          // Ids y conteos, nunca nombres ni datos clínicos (ADR 0032).
          metadata: { principal: principalId, duplicate: duplicateId, ...counts },
        });

        // En vivo: solo ids. Quien tenga abierto el duplicado ve el aviso; el principal relee sus listas.
        const sites = await tx.select({ id: locations.id }).from(locations).where(eq(locations.active, true));
        for (const site of sites) {
          await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: site.id, name: 'patient.changed', ids: { patient: duplicateId, mergedInto: principalId } });
          await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: site.id, name: 'patient.changed', ids: { patient: principalId } });
        }
        for (const e of dupEncounters.filter((v) => !(CLOSED_VISIT_STATUS_VALUES as readonly string[]).includes(v.status))) {
          await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: e.locationId, name: 'encounter.changed', ids: { encounter: e.id }, status: e.status });
        }
        return { status: 200, resourceIds: [principalId] };
      },
      async (ids) => Promise.resolve({ principalId: ids[0] ?? principalId }),
    );
    return result.body;
  }

  /** La versión combinada del principal, si hace falta. Devuelve 1 si la creó. */
  async #combinedHistory(tx: Tx, actor: Principal, locationId: string, me: string, principal: PatientRow, duplicate: PatientRow, now: Date, meta: RequestMeta): Promise<number> {
    const before = await latestHistory(tx, this.#cipher, principal.organizationId, principal.id);
    const other = await latestHistory(tx, this.#cipher, duplicate.organizationId, duplicate.id);
    const combined = combineHistories(before, other, duplicate.code);
    if (!combined) return 0;
    const id = uuidv7();
    const version = (before?.version ?? 0) + 1;
    const encrypted = {} as Record<(typeof historyColumn)[HistoryField], string | null>;
    for (const field of HISTORY_FIELDS) {
      const value = combined.fields[field];
      encrypted[historyColumn[field]] = value
        ? await this.#cipher.encrypt(value, { organizationId: principal.organizationId, table: 'patient_histories', column: historyContextColumn[field], recordId: id })
        : null;
    }
    await tx.insert(patientHistories).values({
      id,
      organizationId: principal.organizationId,
      patientId: principal.id,
      version,
      allergyStatus: combined.allergyStatus,
      ...encrypted,
      source: 'merge',
      encounterId: null,
      locationId,
      recordedByMembershipId: me,
      recordedAt: now,
    });
    const beforeStatus: AllergyStatus = before?.allergyStatus ?? 'not_recorded';
    const fields: string[] = HISTORY_FIELDS.filter((f) => combined.fields[f] !== (before?.fields[f] ?? null));
    if (combined.allergyStatus !== beforeStatus) fields.push('allergyStatus');
    await this.#audit.inTx(tx, principal.organizationId, {
      action: 'patient.history_saved',
      actorType: 'user',
      actorId: actor.userId,
      locationId,
      entityType: 'patient',
      entityId: principal.id,
      ...meta,
      // Solo los nombres de los campos (ADR 0018).
      metadata: { merge: true, duplicate: duplicate.id, fields: fields.join(','), version },
    });
    return 1;
  }

  /** El paciente, sus visitas abiertas y su membresía en curso (con el estado al día). */
  async #facts(tx: Tx, patientId: string, now: Date): Promise<Facts | null> {
    const [row] = await tx.select().from(patients).where(eq(patients.id, patientId));
    if (!row) return null;
    const open = await tx
      .select({ id: locations.id, code: locations.code })
      .from(encounters)
      .innerJoin(locations, eq(locations.id, encounters.locationId))
      .where(and(eq(encounters.patientId, patientId), openVisit))
      .orderBy(asc(locations.code));
    // El estado de la membresía según el reloj, como al leerla (ADR 0034).
    const current = await tx
      .select({ membershipId: patientMembershipMembers.membershipId })
      .from(patientMembershipMembers)
      .where(and(eq(patientMembershipMembers.patientId, patientId), isNull(patientMembershipMembers.removedAt)));
    for (const c of current) await settleMembership(tx, c.membershipId, now);
    const [membership] = await tx
      .select({ code: patientMemberships.code, role: patientMembershipMembers.role, status: patientMemberships.status })
      .from(patientMembershipMembers)
      .innerJoin(patientMemberships, eq(patientMemberships.id, patientMembershipMembers.membershipId))
      .where(and(eq(patientMembershipMembers.patientId, patientId), isNull(patientMembershipMembers.removedAt), ne(patientMemberships.status, 'cancelled')));
    return {
      row,
      openVisitLocations: open,
      membership: membership ? { code: membership.code, role: membership.role as MembershipMemberRole, status: membership.status as PatientMembershipStatus } : null,
    };
  }

  async #candidate(tx: Tx, f: Facts): Promise<MergeCandidate> {
    const [appointmentCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(appointments).where(eq(appointments.patientId, f.row.id));
    const [encounterCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(encounters).where(eq(encounters.patientId, f.row.id));
    return {
      id: f.row.id,
      code: f.row.code,
      firstName: f.row.firstName,
      lastName: f.row.lastName,
      birthDate: f.row.birthDate,
      phone: f.row.phone,
      status: f.row.status as PatientStatus,
      mergedInto: f.row.mergedInto,
      version: f.row.version,
      createdAt: f.row.createdAt.toISOString(),
      appointments: appointmentCount?.n ?? 0,
      encounters: encounterCount?.n ?? 0,
      openVisitLocations: [...new Set(f.openVisitLocations.map((l) => l.code))],
      membership: f.membership,
    };
  }
}
