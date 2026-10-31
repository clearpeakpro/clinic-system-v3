import { locations, nextCode, patients, referralSources, type FieldCipher, type TenantDb, type Tx } from '@clinic/db';
import {
  PATIENT_PAGE_SIZE,
  PHONE_MATCHES_SHOWN,
  parsePatientQuery,
  type CreatedPatient,
  type CreatePatientData,
  type DuplicateCandidate,
  type PatientProfile,
  type PatientQuery,
  type PatientSearchResult,
  type PatientStatus,
  type PatientStatusChangeInput,
  type PatientSummary,
  type UpdatePatientData,
} from '@clinic/shared';
import { and, eq, ne, sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Pacientes (T-012 y T-013; S-PAC-01 a 05 y 11). Son de toda la organización: todo va con
// withTenant y la organización de la sesión, nunca la que mande el cliente.
//  - Búsqueda en un solo campo (ADR 0030), parcial y sin tildes con pg_trgm +
//    unaccent (ADR 0007 y 0026). Cada búsqueda se audita en la misma
//    transacción con el criterio como HMAC, nunca sus valores.
//  - Alta con detección de duplicados: misma fecha de nacimiento y nombre
//    completo parecido (similitud ≥ 0.6). Sin duplicado, el mismo teléfono da
//    un aviso suave que se confirma; el teléfono solo va a la auditoría como HMAC.
//  - Los detalles del referido se guardan cifrados (FieldCipher) y nunca se
//    devuelven en la búsqueda ni van a la auditoría o a los logs.
//  - Edición (T-013) con la versión leída (409 version_conflict): Recepción
//    cambia nombre, apellidos, teléfono y referido; el Proveedor, solo el
//    teléfono; la fecha de nacimiento, el Propietario o el Administrador con
//    rol clínico y motivo (ADR 0009). La auditoría lleva solo los nombres de
//    los campos cambiados (ADR 0018).

/** Similitud de trigramas del nombre completo para «Posible paciente existente» (ADR 0030). */
export const DUPLICATE_SIMILARITY = 0.6;
const MAX_CANDIDATES = 5;

const fullName = sql`app.search_text(${patients.firstName} || ' ' || ${patients.lastName})`;

function summary(row: typeof patients.$inferSelect): PatientSummary {
  return {
    id: row.id,
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
    phone: row.phone,
    status: row.status as PatientStatus,
  };
}

const referralContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'patients', column: 'referral_details', recordId });

/** Sin tildes ni mayúsculas, para el hash del criterio. */
function normalized(query: PatientQuery): string {
  const words = query.words.map((w) => w.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase());
  return JSON.stringify({ code: query.code ?? null, birthDate: query.birthDate ?? null, phone: query.phone ?? null, words });
}

export class PatientService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;

  constructor(tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher) {
    this.#tenantDb = tenantDb;
    this.#audit = audit;
    this.#cipher = cipher;
  }

  /** S-PAC-01: la búsqueda, por páginas de 20. */
  async search(actor: Principal, input: { q: string; offset: number; includeInactive: boolean }, meta: RequestMeta): Promise<PatientSearchResult> {
    const ctx = requireContext(actor);
    const parsed = parsePatientQuery(input.q);
    if (!parsed.ok) throw new HttpError(400, parsed.error);
    const query = parsed.query;
    const conditions: SQL[] = [sql`${patients.mergedInto} is null`];
    // Por código se encuentra siempre, también inactivo; lo demás, solo activos
    // salvo con «Incluir inactivos» (T-013).
    if (query.code) {
      conditions.push(eq(patients.code, query.code));
    } else {
      if (!input.includeInactive) conditions.push(eq(patients.status, 'active'));
      if (query.birthDate) conditions.push(eq(patients.birthDate, query.birthDate));
      if (query.phone) conditions.push(sql`(${patients.phone} = ${query.phone} or ${patients.phone} = ${`1${query.phone}`})`);
      for (const word of query.words) conditions.push(sql`${fullName} like '%' || app.search_text(${word}) || '%'`);
    }
    const where = and(...conditions);
    const criteria: string[] = [];
    if (query.code) criteria.push('code');
    if (query.birthDate) criteria.push('birthDate');
    if (query.phone) criteria.push('phone');
    if (query.words.length > 0) criteria.push('name');
    // Relevancia: con código o fecha todos coinciden exactamente; después, el nombre.
    const relevance = query.words.length > 0 ? sql`ext.word_similarity(app.search_text(${query.words.join(' ')}), ${fullName}) desc,` : sql``;

    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const today = await this.#today(tx, ctx.locationId);
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(patients).where(where);
      const rows = await tx
        .select()
        .from(patients)
        .where(where)
        .orderBy(sql`${relevance} ${patients.createdAt} desc, ${patients.id} desc`)
        .limit(PATIENT_PAGE_SIZE)
        .offset(input.offset);
      const total = count?.n ?? 0;
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'patient.search',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        ...meta,
        // Los tipos de criterio y su HMAC, nunca los valores (ADR 0018).
        metadata: {
          criteria: criteria.join(','),
          queryHash: this.#audit.hmac(normalized(query)),
          offset: input.offset,
          includeInactive: input.includeInactive,
          results: rows.length,
          total,
          patientIds: rows.map((r) => r.id).join(','),
        },
      });
      const nextOffset = input.offset + rows.length < total ? input.offset + rows.length : null;
      return { patients: rows.map(summary), total, nextOffset, today };
    });
  }

  /** S-PAC-05 Perfil del paciente. Cada apertura se audita como lectura de PHI. */
  async get(actor: Principal, patientId: string, meta: RequestMeta): Promise<PatientProfile> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [found] = await tx
        .select({ patient: patients, sourceName: referralSources.name })
        .from(patients)
        .leftJoin(referralSources, eq(referralSources.id, patients.referralSourceId))
        .where(eq(patients.id, patientId));
      if (!found) throw new HttpError(404, 'patient_not_found');
      const row = found.patient;
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'patient.read',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        entityId: patientId,
        ...meta,
      });
      return {
        ...summary(row),
        version: row.version,
        referralSource: row.referralSourceId && found.sourceName !== null ? { id: row.referralSourceId, name: found.sourceName } : null,
        referralDetails: await this.#referralDetails(row),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        today: await this.#today(tx, ctx.locationId),
      };
    });
  }

  /**
   * S-PAC-11 «Guardar». Sin cambios reales no escribe nada. Si el teléfono
   * nuevo ya está en otro paciente y no llega `confirmSharedPhone`, responde
   * 409 `phone_shared` con hasta 3 coincidencias, como el alta (ADR 0030).
   */
  async update(actor: Principal, patientId: string, input: UpdatePatientData, meta: RequestMeta): Promise<{ version: number }> {
    const ctx = requireContext(actor);
    const can = (permission: 'patients.edit' | 'patients.edit_phone' | 'patients.edit_birth_date') => actor.permissions.has(permission);
    if (!can('patients.edit') && !can('patients.edit_phone') && !can('patients.edit_birth_date')) throw new HttpError(403, 'forbidden');
    const result = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [current] = await tx.select().from(patients).where(eq(patients.id, patientId)).for('update');
      if (!current) throw new HttpError(404, 'patient_not_found');

      const changes: Partial<typeof patients.$inferInsert> = {};
      const fields: string[] = [];
      if (input.firstName !== undefined && input.firstName !== current.firstName) {
        changes.firstName = input.firstName;
        fields.push('firstName');
      }
      if (input.lastName !== undefined && input.lastName !== current.lastName) {
        changes.lastName = input.lastName;
        fields.push('lastName');
      }
      if (input.birthDate !== undefined && input.birthDate !== current.birthDate) {
        changes.birthDate = input.birthDate;
        fields.push('birthDate');
      }
      if (input.phone !== undefined && input.phone !== current.phone) {
        changes.phone = input.phone;
        fields.push('phone');
      }
      if (input.referral) {
        if (input.referral.sourceId !== current.referralSourceId) {
          changes.referralSourceId = input.referral.sourceId;
          fields.push('referralSource');
        }
        if (input.referral.details !== (await this.#referralDetails(current))) {
          changes.referralDetailsEnc = input.referral.details
            ? await this.#cipher.encrypt(input.referral.details, referralContext(ctx.organizationId, patientId))
            : null;
          fields.push('referralDetails');
        }
      }

      // Permisos campo a campo: el Proveedor, solo el teléfono.
      if (fields.some((f) => f !== 'phone' && f !== 'birthDate') && !can('patients.edit')) throw new HttpError(403, 'identity_fields_locked');
      if (fields.includes('phone') && !can('patients.edit') && !can('patients.edit_phone')) throw new HttpError(403, 'identity_fields_locked');
      if (fields.includes('birthDate') && !can('patients.edit_birth_date')) throw new HttpError(403, 'birth_date_locked');
      if (current.mergedInto) throw new HttpError(409, 'patient_merged');
      if (current.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
      if (fields.length === 0) return { updated: { version: current.version } };

      const today = await this.#today(tx, ctx.locationId);
      if (changes.birthDate && (changes.birthDate > today || changes.birthDate < '1900-01-01')) throw new HttpError(400, 'invalid_birth_date');
      if (changes.referralSourceId) {
        const [source] = await tx.select({ active: referralSources.active }).from(referralSources).where(eq(referralSources.id, changes.referralSourceId));
        if (!source?.active) throw new HttpError(400, 'invalid_referral_source');
      }
      const audit = { actorType: 'user' as const, actorId: actor.userId, locationId: ctx.locationId, entityType: 'patient', entityId: patientId, ...meta };
      const matches = changes.phone ? await this.#phoneMatches(tx, changes.phone, patientId) : [];
      // Solo se usa con coincidencias, que exigen teléfono.
      const phoneHash = changes.phone ? this.#audit.hmac(changes.phone) : '';
      if (matches.length > 0 && !input.confirmSharedPhone) {
        await this.#audit.inTx(tx, ctx.organizationId, {
          ...audit,
          action: 'patient.phone_shared_check',
          metadata: { matches: matches.length, matchIds: matches.map((m) => m.id).join(','), phoneHash },
        });
        return { phoneShared: matches };
      }

      const version = current.version + 1;
      await tx
        .update(patients)
        .set({ ...changes, version, updatedAt: sql`now()` })
        .where(eq(patients.id, patientId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        ...audit,
        action: 'patient.updated',
        // Solo los nombres de los campos (ADR 0018); el motivo, si cambió la fecha (ADR 0009).
        ...(fields.includes('birthDate') ? { reason: input.birthDateReason } : {}),
        metadata: { fields: fields.join(','), version },
      });
      if (matches.length > 0) {
        // «Guardar de todos modos» en el aviso del teléfono.
        await this.#audit.inTx(tx, ctx.organizationId, {
          ...audit,
          action: 'patient.phone_shared_save_anyway',
          metadata: { matches: matches.length, matchIds: matches.map((m) => m.id).join(','), phoneHash },
        });
      }
      return { updated: { version } };
    });
    // Fuera de la transacción: la auditoría de la comprobación ya quedó guardada.
    if ('phoneShared' in result) throw new HttpError(409, 'phone_shared', { matches: result.phoneShared });
    return result.updated;
  }

  /** Inactivar o reactivar (ADR 0009), con motivo. Un paciente inactivo no sale en la búsqueda por defecto. */
  async setStatus(actor: Principal, patientId: string, status: PatientStatus, input: PatientStatusChangeInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [current] = await tx.select().from(patients).where(eq(patients.id, patientId)).for('update');
      if (!current) throw new HttpError(404, 'patient_not_found');
      if (current.mergedInto) throw new HttpError(409, 'patient_merged');
      if (current.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
      if (current.status === status) throw new HttpError(409, status === 'active' ? 'patient_already_active' : 'patient_already_inactive');
      await tx
        .update(patients)
        .set({ status, version: current.version + 1, updatedAt: sql`now()` })
        .where(eq(patients.id, patientId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: status === 'active' ? 'patient.reactivated' : 'patient.deactivated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        entityId: patientId,
        reason: input.reason,
        ...meta,
      });
    });
  }

  /**
   * S-PAC-02 «Crear». Con un posible duplicado y sin `forceCreate` no crea:
   * responde 409 `possible_duplicate` con los candidatos (S-PAC-03). Si no lo
   * hay y el teléfono ya está en otro paciente, sin `confirmSharedPhone`
   * responde 409 `phone_shared` con hasta 3 coincidencias (ADR 0030).
   */
  async create(actor: Principal, input: CreatePatientData, meta: RequestMeta): Promise<CreatedPatient> {
    const ctx = requireContext(actor);
    const result = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const today = await this.#today(tx, ctx.locationId);
      if (input.birthDate > today || input.birthDate < '1900-01-01') throw new HttpError(400, 'invalid_birth_date');
      if (input.referralSourceId) {
        const [source] = await tx.select({ active: referralSources.active }).from(referralSources).where(eq(referralSources.id, input.referralSourceId));
        if (!source?.active) throw new HttpError(400, 'invalid_referral_source');
      }
      // Dos recepciones no crean el mismo paciente a la vez: una espera a la otra.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`patients:${ctx.organizationId}`}, 0))`);
      const candidates = await this.#candidates(tx, input);
      const audit = { actorType: 'user' as const, actorId: actor.userId, locationId: ctx.locationId, entityType: 'patient', ...meta };
      if (candidates.length > 0 && !input.forceCreate) {
        await this.#audit.inTx(tx, ctx.organizationId, {
          ...audit,
          action: 'patient.duplicate_check',
          metadata: { candidates: candidates.length, candidateIds: candidates.map((c) => c.id).join(',') },
        });
        return { duplicate: candidates };
      }
      const matches = input.phone && !input.forceCreate ? await this.#phoneMatches(tx, input.phone) : [];
      // Solo se usa con coincidencias, que exigen teléfono.
      const phoneHash = input.phone ? this.#audit.hmac(input.phone) : '';
      if (matches.length > 0 && !input.confirmSharedPhone) {
        await this.#audit.inTx(tx, ctx.organizationId, {
          ...audit,
          action: 'patient.phone_shared_check',
          // El teléfono como HMAC, nunca en claro.
          metadata: { matches: matches.length, matchIds: matches.map((m) => m.id).join(','), phoneHash },
        });
        return { phoneShared: matches };
      }
      const id = uuidv7();
      const code = await nextCode(tx, ctx.organizationId, 'patient');
      const details = input.referralDetails ? await this.#cipher.encrypt(input.referralDetails, referralContext(ctx.organizationId, id)) : null;
      await tx.insert(patients).values({
        id,
        organizationId: ctx.organizationId,
        registeredLocationId: ctx.locationId,
        code,
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: input.birthDate,
        phone: input.phone,
        referralSourceId: input.referralSourceId,
        referralDetailsEnc: details,
      });
      const fields = ['firstName', 'lastName', 'birthDate', ...(input.phone ? ['phone'] : []), ...(input.referralSourceId ? ['referralSource'] : [])];
      if (input.referralDetails) fields.push('referralDetails');
      await this.#audit.inTx(tx, ctx.organizationId, {
        ...audit,
        action: 'patient.created',
        entityId: id,
        // Solo los nombres de los campos (ADR 0018).
        metadata: { code, fields: fields.join(',') },
      });
      if (candidates.length > 0) {
        await this.#audit.inTx(tx, ctx.organizationId, {
          ...audit,
          action: 'patient.create_forced',
          entityId: id,
          metadata: { candidates: candidates.length, candidateIds: candidates.map((c) => c.id).join(',') },
        });
      }
      if (matches.length > 0) {
        // «Crear de todos modos» en el aviso del teléfono.
        await this.#audit.inTx(tx, ctx.organizationId, {
          ...audit,
          action: 'patient.phone_shared_create_anyway',
          entityId: id,
          metadata: { matches: matches.length, matchIds: matches.map((m) => m.id).join(','), phoneHash },
        });
      }
      return { created: { id, code } };
    });
    // Fuera de la transacción: la auditoría de la comprobación ya quedó guardada.
    if ('duplicate' in result) throw new HttpError(409, 'possible_duplicate', { candidates: result.duplicate });
    if ('phoneShared' in result) throw new HttpError(409, 'phone_shared', { matches: result.phoneShared });
    return result.created;
  }

  /** «Abrir existente» en el aviso de duplicado: la elección se audita. */
  async openExisting(actor: Principal, patientId: string, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId));
      if (!row) throw new HttpError(404, 'patient_not_found');
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'patient.duplicate_open_existing',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        entityId: patientId,
        ...meta,
      });
    });
  }

  /**
   * «Volver y corregir» en el aviso del teléfono: la elección se audita, el
   * teléfono como HMAC. En el alta exige patients.create; en la edición
   * (`patientId`), poder cambiar el teléfono.
   */
  async phoneSharedBack(actor: Principal, input: { phone: string; patientId?: string | undefined }, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const allowed = input.patientId
      ? actor.permissions.has('patients.edit') || actor.permissions.has('patients.edit_phone')
      : actor.permissions.has('patients.create');
    if (!allowed) throw new HttpError(403, 'forbidden');
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'patient.phone_shared_back',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        ...(input.patientId ? { entityId: input.patientId } : {}),
        ...meta,
        metadata: { phoneHash: this.#audit.hmac(input.phone) },
      });
    });
  }

  /** Otros pacientes con el mismo teléfono (hasta 3, para el aviso); en la edición, sin contar al propio. */
  async #phoneMatches(tx: Tx, phone: string, exceptId?: string): Promise<DuplicateCandidate[]> {
    return tx
      .select({ id: patients.id, code: patients.code, firstName: patients.firstName, lastName: patients.lastName, birthDate: patients.birthDate })
      .from(patients)
      .where(and(eq(patients.phone, phone), sql`${patients.mergedInto} is null`, exceptId ? ne(patients.id, exceptId) : undefined))
      .orderBy(patients.code)
      .limit(PHONE_MATCHES_SHOWN);
  }

  /** Misma fecha de nacimiento y nombre completo parecido. */
  async #candidates(tx: Tx, input: { firstName: string; lastName: string; birthDate: string }): Promise<DuplicateCandidate[]> {
    const similarity = sql`ext.similarity(${fullName}, app.search_text(${`${input.firstName} ${input.lastName}`}))`;
    return tx
      .select({ id: patients.id, code: patients.code, firstName: patients.firstName, lastName: patients.lastName, birthDate: patients.birthDate })
      .from(patients)
      .where(and(eq(patients.birthDate, input.birthDate), sql`${patients.mergedInto} is null`, sql`${similarity} >= ${DUPLICATE_SIMILARITY}`))
      .orderBy(sql`${similarity} desc`, patients.code)
      .limit(MAX_CANDIDATES);
  }

  /** Los detalles del referido en claro, o nulo. */
  async #referralDetails(row: typeof patients.$inferSelect): Promise<string | null> {
    return row.referralDetailsEnc ? this.#cipher.decrypt(row.referralDetailsEnc, referralContext(row.organizationId, row.id)) : null;
  }

  /** Hoy en la sede activa (`AAAA-MM-DD`). */
  async #today(tx: Tx, locationId: string): Promise<string> {
    const [row] = await tx
      .select({ today: sql<string>`((now() at time zone ${locations.timezone})::date)::text` })
      .from(locations)
      .where(eq(locations.id, locationId));
    if (!row) throw new HttpError(403, 'no_active_context');
    return row.today;
  }
}

