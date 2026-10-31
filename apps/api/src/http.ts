import {
  acceptInvitationSchema,
  createCatalogItemSchema,
  createLabProviderSchema,
  createPatientSchema,
  ownClinicalRolesSchema,
  searchPatientsSchema,
  deactivateCatalogItemSchema,
  deactivateLabProviderSchema,
  reactivateLabProviderSchema,
  updateLabProviderSchema,
  isCatalogKind,
  reactivateCatalogItemSchema,
  updateCatalogItemSchema,
  useGeneralPriceSchema,
  PRICED_KINDS,
  type CatalogKind,
  changeRolesSchema,
  createInvitationSchema,
  credentialResetSchema,
  deactivateMembershipSchema,
  reactivateMembershipSchema,
  renameMemberSchema,
  revokeInvitationSchema,
  changePasswordSchema,
  createLocationSchema,
  mfaCodeSchema,
  setLocationActiveSchema,
  updateLocationSchema,
  selectContextSchema,
  type Permission,
} from '@clinic/shared';
import {
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
  SetMetadata,
  type ArgumentsHost,
  type CanActivate,
  type ExceptionFilter,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuditService } from './audit.ts';
import { CatalogService } from './catalog.ts';
import type { Principal } from './principal.ts';
import { InvitationService } from './invitations.ts';
import { LabProviderService } from './lab-providers.ts';
import { PatientService } from './patients.ts';
import { LocationService } from './locations.ts';
import { NotificationService } from './notifications.ts';
import { ProfileService } from './profile.ts';
import { toHeaders } from './request-context.ts';
import { ContextService, HttpError, type RequestMeta } from './services.ts';
import { MembershipService } from './users.ts';

export const USER_EMAIL_LOOKUP = Symbol('USER_EMAIL_LOOKUP');
export const IDLE_TIMEOUT_SECONDS = Symbol('IDLE_TIMEOUT_SECONDS');
export type UserEmailLookup = (userId: string) => Promise<string | null>;

const PUBLIC = 'clinic:public';
const PERMISSION = 'clinic:permission';

/** Ruta sin autenticación obligatoria. */
export const Public = () => SetMetadata(PUBLIC, true);
/** El backend autoriza siempre, con los permisos de packages/shared/src/permissions.ts. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION, permission);

export class PermissionGuard implements CanActivate {
  readonly #reflector: Reflector;
  constructor(reflector: Reflector) {
    this.#reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.#reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const principal = context.switchToHttp().getRequest<FastifyRequest>().principal;
    if (!principal) throw new HttpError(401, 'unauthenticated');
    const permission = this.#reflector.getAllAndOverride<Permission | undefined>(PERMISSION, targets);
    if (permission !== undefined && !principal.permissions.has(permission)) throw new HttpError(403, 'forbidden');
    return true;
  }
}

/** Respuestas de error: solo un código. Nunca datos de la petición ni detalles internos. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (error instanceof HttpError) {
      void reply.status(error.status).send({ ...error.details, code: error.code });
      return;
    }
    const status = (error as { getStatus?: () => number }).getStatus?.();
    if (status === 404) {
      void reply.status(404).send({ code: 'not_found' });
      return;
    }
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    // Solo el tipo y el id de petición: el mensaje podría llevar datos.
    request.log.error({ err: { type: (error as Error | undefined)?.name ?? 'unknown' } }, 'error no controlado');
    void reply.status(500).send({ code: 'internal_error' });
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, 'invalid_request');
  return result.data;
}

function principalOf(request: FastifyRequest): Principal {
  if (!request.principal) throw new HttpError(401, 'unauthenticated');
  return request.principal;
}

function metaOf(request: FastifyRequest): RequestMeta {
  return { ip: request.ip, requestId: request.id };
}

@Controller('me')
export class MeController {
  readonly #contexts: ContextService;
  readonly #audit: AuditService;
  readonly #profile: ProfileService;
  readonly #idleTimeoutSeconds: number;
  constructor(
    @Inject(ContextService) contexts: ContextService,
    @Inject(AuditService) audit: AuditService,
    @Inject(ProfileService) profile: ProfileService,
    @Inject(IDLE_TIMEOUT_SECONDS) idleTimeoutSeconds: number,
  ) {
    this.#contexts = contexts;
    this.#audit = audit;
    this.#profile = profile;
    this.#idleTimeoutSeconds = idleTimeoutSeconds;
  }

  @Get()
  me(@Req() request: FastifyRequest) {
    const principal = principalOf(request);
    return {
      userId: principal.userId,
      name: principal.name,
      email: principal.email,
      idleTimeoutSeconds: this.#idleTimeoutSeconds,
      twoFactorEnabled: principal.twoFactorEnabled,
      mfaRequired: principal.mfaRequired,
      context: principal.context,
      roles: principal.roles,
      // Perfil (S-GEN-21): sus roles y sedes en la organización activa.
      assignments: principal.context
        ? principal.assignments
            .filter((a) => a.organizationId === principal.context?.organizationId)
            .map((a) => ({ role: a.role, locationId: a.locationId }))
        : [],
      permissions: [...principal.permissions].sort(),
    };
  }

  /** S-GEN-22: estado del propio MFA. */
  @Get('mfa')
  mfa(@Req() request: FastifyRequest) {
    return this.#profile.mfaStatus(principalOf(request));
  }

  /** Perfil: cambiar la contraseña; cierra las demás sesiones (decisión de T-006). */
  @Post('password')
  changePassword(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#profile.changePassword(principalOf(request), parse(changePasswordSchema, body), toHeaders(request.headers), metaOf(request));
  }

  /** S-GEN-24 → S-GEN-25: códigos nuevos, una sola vez en la respuesta. */
  @Post('mfa/recovery-codes')
  recoveryCodes(@Req() request: FastifyRequest, @Body() body: unknown) {
    const { code } = parse(mfaCodeSchema, body);
    return this.#profile.regenerateRecoveryCodes(principalOf(request), code, toHeaders(request.headers), metaOf(request));
  }

  /** S-GEN-24 «Desactivar»: 403 mfa_required_for_role si un rol lo exige. */
  @Post('mfa/disable')
  @HttpCode(204)
  async disableMfa(@Req() request: FastifyRequest, @Body() body: unknown) {
    const { code } = parse(mfaCodeSchema, body);
    await this.#profile.disableMfa(principalOf(request), code, toHeaders(request.headers), metaOf(request));
  }

  @Get('locations')
  locations(@Req() request: FastifyRequest) {
    return this.#contexts.choices(principalOf(request));
  }

  /**
   * S-GEN-20: la web avisa que cierra la sesión por inactividad (para la
   * auditoría) y después llama a /api/auth/sign-out.
   */
  @Post('idle-logout')
  @HttpCode(204)
  async idleLogout(@Req() request: FastifyRequest) {
    const principal = principalOf(request);
    await this.#audit.platform({
      action: 'auth.sign_out.idle',
      actorType: 'user',
      actorId: principal.userId,
      ...metaOf(request),
    });
  }
}

@Controller('context')
export class ContextController {
  readonly #contexts: ContextService;
  constructor(@Inject(ContextService) contexts: ContextService) {
    this.#contexts = contexts;
  }

  /** El cliente elige; el servidor valida contra memberships y lo guarda en la sesión. */
  @Post()
  @HttpCode(204)
  async select(@Req() request: FastifyRequest, @Body() body: unknown) {
    const input = parse(selectContextSchema, body);
    await this.#contexts.select(principalOf(request), input.organizationId, input.locationId);
  }
}

const id = (value: string) => parse(z.uuid(), value);

@Controller('invitations')
export class InvitationsController {
  readonly #invitations: InvitationService;
  readonly #emailOf: UserEmailLookup;
  constructor(
    @Inject(InvitationService) invitations: InvitationService,
    @Inject(USER_EMAIL_LOOKUP) emailOf: UserEmailLookup,
  ) {
    this.#invitations = invitations;
    this.#emailOf = emailOf;
  }

  /** S-ADM-03. Devuelve el enlace una sola vez (S-ADM-04); el servidor solo guarda su hash. */
  @Post()
  @RequirePermission('members.invite')
  create(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#invitations.create(principalOf(request), parse(createInvitationSchema, body), metaOf(request));
  }

  @Post(':id/revoke')
  @HttpCode(204)
  @RequirePermission('members.invite')
  async revoke(@Req() request: FastifyRequest, @Param('id') invitationId: string, @Body() body: unknown) {
    const { reason } = parse(revokeInvitationSchema, body);
    await this.#invitations.revoke(principalOf(request), id(invitationId), reason, metaOf(request));
  }

  /** S-ADM-02 «Reenviar»: enlace nuevo; el anterior deja de funcionar. */
  @Post(':id/resend')
  @RequirePermission('members.invite')
  resend(@Req() request: FastifyRequest, @Param('id') invitationId: string) {
    return this.#invitations.resend(principalOf(request), id(invitationId), metaOf(request));
  }

  @Post('accept')
  @Public()
  async accept(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Body() body: unknown) {
    const input = parse(acceptInvitationSchema, body);
    const principal = request.principal;
    let signedIn: { principal: Principal; email: string } | null = null;
    if (principal) {
      const email = await this.#emailOf(principal.userId);
      if (!email) throw new HttpError(401, 'unauthenticated');
      signedIn = { principal, email };
    }
    const { setCookies, ...result } = await this.#invitations.accept(input, signedIn, metaOf(request));
    for (const cookie of setCookies) void reply.header('set-cookie', cookie);
    return result;
  }
}

/** Administración › Usuarios (S-ADM-02). */
@Controller('users')
export class UsersController {
  readonly #memberships: MembershipService;
  constructor(@Inject(MembershipService) memberships: MembershipService) {
    this.#memberships = memberships;
  }

  @Get()
  @RequirePermission('members.manage')
  list(@Req() request: FastifyRequest) {
    return this.#memberships.list(principalOf(request));
  }
}

@Controller('memberships')
export class MembershipsController {
  readonly #memberships: MembershipService;
  constructor(@Inject(MembershipService) memberships: MembershipService) {
    this.#memberships = memberships;
  }

  /**
   * Excepción del ADR 0027: el Propietario se asigna o se quita roles clínicos
   * en sedes activas, con motivo. Va antes de ':id/…' para que «self» no se
   * lea como un id.
   */
  @Post('self/clinical-roles')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async ownClinicalRoles(@Req() request: FastifyRequest, @Body() body: unknown) {
    await this.#memberships.changeOwnClinicalRoles(principalOf(request), parse(ownClinicalRolesSchema, body), metaOf(request));
  }

  @Post(':id/name')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async rename(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Body() body: unknown) {
    await this.#memberships.rename(principalOf(request), id(membershipId), parse(renameMemberSchema, body), metaOf(request));
  }

  @Post(':id/roles')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async changeRoles(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Body() body: unknown) {
    await this.#memberships.changeRoles(principalOf(request), id(membershipId), parse(changeRolesSchema, body), metaOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async deactivate(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Body() body: unknown) {
    await this.#memberships.deactivate(principalOf(request), id(membershipId), parse(deactivateMembershipSchema, body), metaOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async reactivate(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Body() body: unknown) {
    await this.#memberships.reactivate(principalOf(request), id(membershipId), parse(reactivateMembershipSchema, body), metaOf(request));
  }

  @Get(':id/mfa')
  @RequirePermission('members.manage')
  mfaStatus(@Req() request: FastifyRequest, @Param('id') membershipId: string) {
    return this.#memberships.mfaStatus(principalOf(request), id(membershipId));
  }

  /** S-ADM-08. Devuelve el enlace de restablecimiento una sola vez (null si la membresía está deshabilitada). */
  @Post(':id/mfa-reset')
  @RequirePermission('members.manage')
  async resetMfa(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Body() body: unknown) {
    const { reason } = parse(credentialResetSchema, body);
    return { reset: await this.#memberships.resetMfa(principalOf(request), id(membershipId), reason, metaOf(request)) };
  }

  @Post(':id/password-reset')
  @RequirePermission('members.manage')
  passwordReset(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Body() body: unknown) {
    const { reason } = parse(credentialResetSchema, body);
    return this.#memberships.createPasswordReset(principalOf(request), id(membershipId), reason, metaOf(request));
  }
}

/** Administración › Sedes (S-ADM-10 a 12). */
@Controller('locations')
export class LocationsController {
  readonly #locations: LocationService;
  constructor(@Inject(LocationService) locations: LocationService) {
    this.#locations = locations;
  }

  @Get()
  @RequirePermission('locations.manage')
  list(@Req() request: FastifyRequest) {
    return this.#locations.list(principalOf(request));
  }

  @Post()
  @RequirePermission('locations.manage')
  create(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#locations.create(principalOf(request), parse(createLocationSchema, body), metaOf(request));
  }

  @Post(':id')
  @HttpCode(204)
  @RequirePermission('locations.manage')
  async update(@Req() request: FastifyRequest, @Param('id') locationId: string, @Body() body: unknown) {
    await this.#locations.update(principalOf(request), id(locationId), parse(updateLocationSchema, body), metaOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @RequirePermission('locations.manage')
  async deactivate(@Req() request: FastifyRequest, @Param('id') locationId: string, @Body() body: unknown) {
    const { expectedVersion } = parse(setLocationActiveSchema, body);
    await this.#locations.setActive(principalOf(request), id(locationId), false, expectedVersion, metaOf(request));
  }

  @Post(':id/activate')
  @HttpCode(204)
  @RequirePermission('locations.manage')
  async activate(@Req() request: FastifyRequest, @Param('id') locationId: string, @Body() body: unknown) {
    const { expectedVersion } = parse(setLocationActiveSchema, body);
    await this.#locations.setActive(principalOf(request), id(locationId), true, expectedVersion, metaOf(request));
  }
}

/** Centro de notificaciones (S-GEN-15, T-009): avisos propios de la organización activa. */
@Controller('notifications')
export class NotificationsController {
  readonly #notifications: NotificationService;
  constructor(@Inject(NotificationService) notifications: NotificationService) {
    this.#notifications = notifications;
  }

  @Get()
  list(@Req() request: FastifyRequest) {
    return this.#notifications.list(principalOf(request));
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@Req() request: FastifyRequest) {
    await this.#notifications.markAllRead(principalOf(request));
  }

  @Post('clear')
  @HttpCode(204)
  async clear(@Req() request: FastifyRequest) {
    await this.#notifications.clear(principalOf(request));
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@Req() request: FastifyRequest, @Param('id') notificationId: string) {
    await this.#notifications.markRead(principalOf(request), id(notificationId));
  }
}

const catalogKind = (value: string): CatalogKind => {
  if (!isCatalogKind(value)) throw new HttpError(404, 'catalog_not_found');
  return value;
};

/** Administración › Catálogos y precios (S-ADM-13 a 20, T-011). */
@Controller('admin/catalog')
export class AdminCatalogController {
  readonly #catalog: CatalogService;
  constructor(@Inject(CatalogService) catalog: CatalogService) {
    this.#catalog = catalog;
  }

  /** Los cuatro catálogos, también lo inactivo, con los precios de la sede elegida (por defecto, la activa). */
  @Get()
  @RequirePermission('catalog.manage')
  list(@Req() request: FastifyRequest, @Query('locationId') locationId?: string) {
    const principal = principalOf(request);
    const sede = locationId ? id(locationId) : principal.context?.locationId;
    if (!sede) throw new HttpError(403, 'no_active_context');
    return this.#catalog.list(principal, sede, { activeOnly: false, withLabCosts: true });
  }

  @Post(':kind')
  @RequirePermission('catalog.manage')
  create(@Req() request: FastifyRequest, @Param('kind') kind: string, @Body() body: unknown) {
    const k = catalogKind(kind);
    return this.#catalog.create(principalOf(request), k, parse(createCatalogItemSchema(k), body), metaOf(request));
  }

  @Post(':kind/:id')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async update(@Req() request: FastifyRequest, @Param('kind') kind: string, @Param('id') itemId: string, @Body() body: unknown) {
    const k = catalogKind(kind);
    await this.#catalog.update(principalOf(request), k, id(itemId), parse(updateCatalogItemSchema(k), body), metaOf(request));
  }

  @Post(':kind/:id/deactivate')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async deactivate(@Req() request: FastifyRequest, @Param('kind') kind: string, @Param('id') itemId: string, @Body() body: unknown) {
    const input = parse(deactivateCatalogItemSchema, body);
    await this.#catalog.setActive(principalOf(request), catalogKind(kind), id(itemId), false, input, metaOf(request));
  }

  /** «Volver al precio general» en una sede (P-15): procedimientos y pruebas. */
  @Post(':kind/:id/use-general')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async useGeneral(@Req() request: FastifyRequest, @Param('kind') kind: string, @Param('id') itemId: string, @Body() body: unknown) {
    const k = catalogKind(kind);
    if (!PRICED_KINDS.includes(k)) throw new HttpError(404, 'catalog_not_found');
    await this.#catalog.useGeneralPrice(principalOf(request), k, id(itemId), parse(useGeneralPriceSchema, body), metaOf(request));
  }

  @Post(':kind/:id/reactivate')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async reactivate(@Req() request: FastifyRequest, @Param('kind') kind: string, @Param('id') itemId: string, @Body() body: unknown) {
    const input = parse(reactivateCatalogItemSchema, body);
    await this.#catalog.setActive(principalOf(request), catalogKind(kind), id(itemId), true, input, metaOf(request));
  }
}

/** Administración › Catálogos › Proveedores de laboratorio (S-ADM-17, T-011b). La lista va con la de Catálogos. */
@Controller('admin/lab-providers')
export class AdminLabProvidersController {
  readonly #labs: LabProviderService;
  constructor(@Inject(LabProviderService) labs: LabProviderService) {
    this.#labs = labs;
  }

  @Post()
  @RequirePermission('catalog.manage')
  create(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#labs.create(principalOf(request), parse(createLabProviderSchema, body), metaOf(request));
  }

  @Post(':id')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async update(@Req() request: FastifyRequest, @Param('id') providerId: string, @Body() body: unknown) {
    await this.#labs.update(principalOf(request), id(providerId), parse(updateLabProviderSchema, body), metaOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async deactivate(@Req() request: FastifyRequest, @Param('id') providerId: string, @Body() body: unknown) {
    await this.#labs.setActive(principalOf(request), id(providerId), false, parse(deactivateLabProviderSchema, body), metaOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async reactivate(@Req() request: FastifyRequest, @Param('id') providerId: string, @Body() body: unknown) {
    await this.#labs.setActive(principalOf(request), id(providerId), true, parse(reactivateLabProviderSchema, body), metaOf(request));
  }
}

/**
 * Pacientes (S-PAC-01 a 04, T-012). Buscar y ver: patients.access; crear:
 * patients.create. La búsqueda va por POST: el criterio nunca queda en la URL
 * ni en los logs.
 */
@Controller('patients')
export class PatientsController {
  readonly #patients: PatientService;
  constructor(@Inject(PatientService) patients: PatientService) {
    this.#patients = patients;
  }

  @Post('search')
  @HttpCode(200)
  @RequirePermission('patients.access')
  search(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#patients.search(principalOf(request), parse(searchPatientsSchema, body), metaOf(request));
  }

  @Post()
  @RequirePermission('patients.create')
  create(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#patients.create(principalOf(request), parse(createPatientSchema, body), metaOf(request));
  }

  @Get(':id')
  @RequirePermission('patients.access')
  get(@Req() request: FastifyRequest, @Param('id') patientId: string) {
    return this.#patients.get(principalOf(request), id(patientId), metaOf(request));
  }

  /** «Abrir existente» en «Posible paciente existente»: la elección se audita. */
  @Post(':id/open-existing')
  @HttpCode(204)
  @RequirePermission('patients.create')
  async openExisting(@Req() request: FastifyRequest, @Param('id') patientId: string) {
    await this.#patients.openExisting(principalOf(request), id(patientId), metaOf(request));
  }
}

/**
 * Lo activo del catálogo, con los precios de la sede activa: lo usan las
 * citas y las órdenes. Nunca lleva laboratorios ni costos (ADR 0028).
 */
@Controller('catalog')
export class CatalogController {
  readonly #catalog: CatalogService;
  constructor(@Inject(CatalogService) catalog: CatalogService) {
    this.#catalog = catalog;
  }

  @Get()
  list(@Req() request: FastifyRequest) {
    const principal = principalOf(request);
    if (!principal.context) throw new HttpError(403, 'no_active_context');
    return this.#catalog.list(principal, principal.context.locationId, { activeOnly: true, withLabCosts: false });
  }
}

export interface ApiProviders {
  contexts: ContextService;
  invitations: InvitationService;
  memberships: MembershipService;
  profile: ProfileService;
  locations: LocationService;
  notifications: NotificationService;
  catalog: CatalogService;
  labProviders: LabProviderService;
  patients: PatientService;
  emailOf: UserEmailLookup;
  audit: AuditService;
  idleTimeoutSeconds: number;
}

export function createApiModule(providers: ApiProviders) {
  @Module({
    controllers: [
      MeController,
      ContextController,
      InvitationsController,
      UsersController,
      MembershipsController,
      LocationsController,
      NotificationsController,
      AdminCatalogController,
      AdminLabProvidersController,
      CatalogController,
      PatientsController,
    ],
    providers: [
      { provide: ContextService, useValue: providers.contexts },
      { provide: InvitationService, useValue: providers.invitations },
      { provide: MembershipService, useValue: providers.memberships },
      { provide: ProfileService, useValue: providers.profile },
      { provide: LocationService, useValue: providers.locations },
      { provide: NotificationService, useValue: providers.notifications },
      { provide: CatalogService, useValue: providers.catalog },
      { provide: LabProviderService, useValue: providers.labProviders },
      { provide: PatientService, useValue: providers.patients },
      { provide: USER_EMAIL_LOOKUP, useValue: providers.emailOf },
      { provide: AuditService, useValue: providers.audit },
      { provide: IDLE_TIMEOUT_SECONDS, useValue: providers.idleTimeoutSeconds },
    ],
  })
  class ApiModule {}
  return ApiModule;
}
