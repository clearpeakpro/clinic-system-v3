import {
  acceptInvitationSchema,
  addMembershipMemberSchema,
  enrollMembershipSchema,
  membershipVersionSchema,
  appointmentOverlapSchema,
  appointmentVersionSchema,
  arrivalSchema,
  type ArrivalInput,
  assignProviderSchema,
  closeEncounterSchema,
  encounterTransitionSchema,
  startConsultSchema,
  forceEncounterSchema,
  updateCoverageSchema,
  saveAssessmentSchema,
  saveVitalsSchema,
  sendToProviderSchema,
  addChargeSchema,
  assignOrderSchema,
  cancelOrderSchema,
  completeOrderSchema,
  isOrderQueueTab,
  startOrderSchema,
  changeOrderLabSchema,
  createOrderSchema,
  orderPreviewSchema,
  cancelAppointmentSchema,
  createAppointmentSchema,
  type CreateAppointmentInput,
  rescheduleAppointmentSchema,
  updateAppointmentSchema,
  createCatalogItemSchema,
  createLabProviderSchema,
  createMembershipBenefitSchema,
  createMembershipPlanSchema,
  createPatientSchema,
  ownClinicalRolesSchema,
  patientStatusChangeSchema,
  phoneSharedBackSchema,
  searchPatientsSchema,
  updatePatientSchema,
  deactivateCatalogItemSchema,
  updateMembershipBenefitSchema,
  updateMembershipPlanSchema,
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
  Put,
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
import { AppointmentCommands } from './appointment-commands.ts';
import { AppointmentService } from './appointments.ts';
import { BillingService } from './billing.ts';
import { EncounterService } from './encounters.ts';
import { KioskArrivalService } from './kiosk-arrivals.ts';
import { KIOSK_COOKIE, KioskAdminService, kioskCookie, KioskService, kioskTokenOf } from './kiosk.ts';
import { NursingService } from './nursing.ts';
import { isOrderType, OrderService } from './orders.ts';
import { ProviderService } from './provider.ts';
import { PanelService } from './panel.ts';
import { IdempotencyKey } from './idempotency.ts';
import { AuditService } from './audit.ts';
import { CatalogService } from './catalog.ts';
import type { Principal } from './principal.ts';
import { InvitationService } from './invitations.ts';
import { LabProviderService } from './lab-providers.ts';
import { MembershipPlanService } from './membership-plans.ts';
import { PatientMembershipService } from './patient-memberships.ts';
import { PatientService } from './patients.ts';
import { LocationService } from './locations.ts';
import { NotificationService } from './notifications.ts';
import { ProfileService } from './profile.ts';
import { toHeaders } from './request-context.ts';
import { ContextService, HttpError, type RequestMeta } from './services.ts';
import { MembershipService } from './users.ts';

export const USER_EMAIL_LOOKUP = Symbol('USER_EMAIL_LOOKUP');
export const IDLE_TIMEOUT_SECONDS = Symbol('IDLE_TIMEOUT_SECONDS');
export const SECURE_COOKIES = Symbol('SECURE_COOKIES');
export type UserEmailLookup = (userId: string) => Promise<string | null>;

const PUBLIC = 'clinic:public';
const PERMISSION = 'clinic:permission';

/** Ruta sin autenticación obligatoria. */
export const Public = () => SetMetadata(PUBLIC, true);
/**
 * El backend autoriza siempre, con los permisos de packages/shared/src/permissions.ts.
 * Con varios, hacen falta todos (por ejemplo, patients.access y patients.deactivate).
 */
export const RequirePermission = (...permissions: [Permission, ...Permission[]]) => SetMetadata(PERMISSION, permissions);

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
    const permissions = this.#reflector.getAllAndOverride<Permission[] | undefined>(PERMISSION, targets) ?? [];
    if (!permissions.every((p) => principal.permissions.has(p))) throw new HttpError(403, 'forbidden');
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
 * Administración › Catálogos › Planes de membresía (S-ADM-21) y sus
 * beneficios (S-ADM-22), T-026b parte A (ADR 0034). Como el catálogo, solo
 * con catalog.manage.
 */
@Controller('admin/membership-plans')
export class AdminMembershipPlansController {
  readonly #plans: MembershipPlanService;
  constructor(@Inject(MembershipPlanService) plans: MembershipPlanService) {
    this.#plans = plans;
  }

  @Get()
  @RequirePermission('catalog.manage')
  list(@Req() request: FastifyRequest) {
    return this.#plans.list(principalOf(request));
  }

  @Post()
  @RequirePermission('catalog.manage')
  create(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#plans.createPlan(principalOf(request), parse(createMembershipPlanSchema, body), metaOf(request));
  }

  @Get(':id')
  @RequirePermission('catalog.manage')
  detail(@Req() request: FastifyRequest, @Param('id') planId: string) {
    return this.#plans.detail(principalOf(request), id(planId));
  }

  @Post(':id')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async update(@Req() request: FastifyRequest, @Param('id') planId: string, @Body() body: unknown) {
    await this.#plans.updatePlan(principalOf(request), id(planId), parse(updateMembershipPlanSchema, body), metaOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async deactivate(@Req() request: FastifyRequest, @Param('id') planId: string, @Body() body: unknown) {
    await this.#plans.setPlanActive(principalOf(request), id(planId), false, parse(deactivateCatalogItemSchema, body), metaOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async reactivate(@Req() request: FastifyRequest, @Param('id') planId: string, @Body() body: unknown) {
    await this.#plans.setPlanActive(principalOf(request), id(planId), true, parse(reactivateCatalogItemSchema, body), metaOf(request));
  }

  @Post(':id/benefits')
  @RequirePermission('catalog.manage')
  createBenefit(@Req() request: FastifyRequest, @Param('id') planId: string, @Body() body: unknown) {
    return this.#plans.createBenefit(principalOf(request), id(planId), parse(createMembershipBenefitSchema, body), metaOf(request));
  }

  @Post('benefits/:benefitId')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async updateBenefit(@Req() request: FastifyRequest, @Param('benefitId') benefitId: string, @Body() body: unknown) {
    await this.#plans.updateBenefit(principalOf(request), id(benefitId), parse(updateMembershipBenefitSchema, body), metaOf(request));
  }

  @Post('benefits/:benefitId/deactivate')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async deactivateBenefit(@Req() request: FastifyRequest, @Param('benefitId') benefitId: string, @Body() body: unknown) {
    await this.#plans.setBenefitActive(principalOf(request), id(benefitId), false, parse(deactivateCatalogItemSchema, body), metaOf(request));
  }

  @Post('benefits/:benefitId/reactivate')
  @HttpCode(204)
  @RequirePermission('catalog.manage')
  async reactivateBenefit(@Req() request: FastifyRequest, @Param('benefitId') benefitId: string, @Body() body: unknown) {
    await this.#plans.setBenefitActive(principalOf(request), id(benefitId), true, parse(reactivateCatalogItemSchema, body), metaOf(request));
  }
}

/**
 * Pacientes (S-PAC-01 a 05 y 11, T-012 y T-013). Buscar y ver:
 * patients.access; crear: patients.create; editar: patients.access y, campo a
 * campo, patients.edit, patients.edit_phone o patients.edit_birth_date (lo
 * comprueba el servicio); inactivar y reactivar: patients.access y
 * patients.deactivate. La búsqueda va por POST: el criterio nunca queda en la
 * URL ni en los logs.
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

  /**
   * «Volver y corregir» en el aviso del teléfono compartido, en el alta o en
   * la edición: la elección se audita. El servicio exige poder escribir el teléfono.
   */
  @Post('phone-shared/back')
  @HttpCode(204)
  @RequirePermission('patients.access')
  async phoneSharedBack(@Req() request: FastifyRequest, @Body() body: unknown) {
    await this.#patients.phoneSharedBack(principalOf(request), parse(phoneSharedBackSchema, body), metaOf(request));
  }

  @Get(':id')
  @RequirePermission('patients.access')
  get(@Req() request: FastifyRequest, @Param('id') patientId: string) {
    return this.#patients.get(principalOf(request), id(patientId), metaOf(request));
  }

  /** S-PAC-11 «Guardar»: solo los campos cambiados, con la versión leída. */
  @Post(':id')
  @HttpCode(200)
  @RequirePermission('patients.access')
  update(@Req() request: FastifyRequest, @Param('id') patientId: string, @Body() body: unknown) {
    return this.#patients.update(principalOf(request), id(patientId), parse(updatePatientSchema, body), metaOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @RequirePermission('patients.access', 'patients.deactivate')
  async deactivate(@Req() request: FastifyRequest, @Param('id') patientId: string, @Body() body: unknown) {
    await this.#patients.setStatus(principalOf(request), id(patientId), 'inactive', parse(patientStatusChangeSchema, body), metaOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  @RequirePermission('patients.access', 'patients.deactivate')
  async reactivate(@Req() request: FastifyRequest, @Param('id') patientId: string, @Body() body: unknown) {
    await this.#patients.setStatus(principalOf(request), id(patientId), 'active', parse(patientStatusChangeSchema, body), metaOf(request));
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
 * Citas (T-014 y T-015; S-REC-06 a 17). La agenda y el detalle son de la sede
 * activa y exigen appointments.access (Recepción o Proveedor, ADR 0027). Los
 * cambios exigen además appointments.manage; el alcance del Proveedor (solo
 * sus citas) lo comprueba el servicio. «N citas hoy» va en el Panel (T-019).
 */
@Controller('appointments')
export class AppointmentsController {
  readonly #appointments: AppointmentService;
  readonly #commands: AppointmentCommands;
  constructor(@Inject(AppointmentService) appointments: AppointmentService, @Inject(AppointmentCommands) commands: AppointmentCommands) {
    this.#appointments = appointments;
    this.#commands = commands;
  }

  /** S-REC-10: proveedores del formulario y alcance de quien llama. */
  @Get('form-options')
  @RequirePermission('appointments.access', 'appointments.manage')
  formOptions(@Req() request: FastifyRequest) {
    return this.#commands.formOptions(principalOf(request));
  }

  /** Solapamiento del proveedor antes de guardar (S-REC-10 y 13). */
  @Post('overlap')
  @HttpCode(200)
  @RequirePermission('appointments.access', 'appointments.manage')
  overlap(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#commands.overlap(principalOf(request), parse(appointmentOverlapSchema, body));
  }

  /** S-REC-10 «Crear cita», con Idempotency-Key. */
  @Post()
  @RequirePermission('appointments.access', 'appointments.manage')
  create(@Req() request: FastifyRequest, @Body() body: unknown, @IdempotencyKey() key: string) {
    // El hash de la clave se calcula con el cuerpo tal como llegó; el servicio lo valida.
    parse(createAppointmentSchema, body);
    return this.#commands.create(principalOf(request), body as CreateAppointmentInput, key, metaOf(request));
  }

  /** S-REC-10 «Editar cita». */
  @Post(':id')
  @HttpCode(200)
  @RequirePermission('appointments.access', 'appointments.manage')
  update(@Req() request: FastifyRequest, @Param('id') appointmentId: string, @Body() body: unknown) {
    return this.#commands.update(principalOf(request), id(appointmentId), parse(updateAppointmentSchema, body), metaOf(request));
  }

  /** S-REC-13 Reprogramar. */
  @Post(':id/reschedule')
  @HttpCode(200)
  @RequirePermission('appointments.access', 'appointments.manage')
  reschedule(@Req() request: FastifyRequest, @Param('id') appointmentId: string, @Body() body: unknown) {
    return this.#commands.reschedule(principalOf(request), id(appointmentId), parse(rescheduleAppointmentSchema, body), metaOf(request));
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission('appointments.access', 'appointments.manage')
  confirm(@Req() request: FastifyRequest, @Param('id') appointmentId: string, @Body() body: unknown) {
    return this.#commands.transition(principalOf(request), id(appointmentId), 'confirm', parse(appointmentVersionSchema, body), metaOf(request));
  }

  /** S-REC-14: motivo obligatorio. */
  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('appointments.access', 'appointments.manage')
  cancel(@Req() request: FastifyRequest, @Param('id') appointmentId: string, @Body() body: unknown) {
    return this.#commands.transition(principalOf(request), id(appointmentId), 'cancel', parse(cancelAppointmentSchema, body), metaOf(request));
  }

  /** S-REC-15: solo desde la hora de inicio. */
  @Post(':id/no-show')
  @HttpCode(200)
  @RequirePermission('appointments.access', 'appointments.manage')
  noShow(@Req() request: FastifyRequest, @Param('id') appointmentId: string, @Body() body: unknown) {
    return this.#commands.transition(principalOf(request), id(appointmentId), 'no_show', parse(appointmentVersionSchema, body), metaOf(request));
  }

  @Get()
  @RequirePermission('appointments.access')
  day(@Req() request: FastifyRequest, @Query('date') date: unknown) {
    return this.#appointments.day(principalOf(request), typeof date === 'string' ? date : undefined, metaOf(request));
  }

  @Get(':id')
  @RequirePermission('appointments.access')
  get(@Req() request: FastifyRequest, @Param('id') appointmentId: string) {
    return this.#appointments.get(principalOf(request), id(appointmentId), metaOf(request));
  }
}

const offsetSchema = z.coerce.number().int().min(0).max(100_000);

/** S-PAC-07 Pestaña Citas del perfil (T-014): appointments.access, en las sedes donde quien llama lo tiene. */
@Controller('patients')
export class PatientAppointmentsController {
  readonly #appointments: AppointmentService;
  constructor(@Inject(AppointmentService) appointments: AppointmentService) {
    this.#appointments = appointments;
  }

  @Get(':id/appointments')
  @RequirePermission('appointments.access')
  list(@Req() request: FastifyRequest, @Param('id') patientId: string, @Query('offset') offset: unknown) {
    return this.#appointments.forPatient(principalOf(request), id(patientId), parse(offsetSchema, offset ?? '0'), metaOf(request));
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

/**
 * Llegada (T-017; S-REC-18 a 27). El asistente y el registro exigen
 * appointments.check_in (Recepción) y patients.access; la máquina de estados
 * vuelve a comprobar el rol dueño del paso. Idempotency-Key obligatorio.
 */
@Controller('arrivals')
export class ArrivalsController {
  readonly #encounters: EncounterService;
  constructor(@Inject(EncounterService) encounters: EncounterService) {
    this.#encounters = encounters;
  }

  /** S-REC-18: la cita, su paciente y la sede. */
  @Get('appointments/:id')
  @RequirePermission('patients.access', 'appointments.check_in')
  appointment(@Req() request: FastifyRequest, @Param('id') appointmentId: string) {
    return this.#encounters.appointmentContext(principalOf(request), id(appointmentId), metaOf(request));
  }

  /** S-REC-19: el paciente, la sede y los tipos de cita activos. */
  @Get('patients/:id')
  @RequirePermission('patients.access', 'appointments.check_in')
  walkIn(@Req() request: FastifyRequest, @Param('id') patientId: string) {
    return this.#encounters.walkInContext(principalOf(request), id(patientId), metaOf(request));
  }
}

/** Visitas (T-017: abrir; T-018: la pantalla completa). */
@Controller('encounters')
export class EncountersController {
  readonly #encounters: EncounterService;
  constructor(@Inject(EncounterService) encounters: EncounterService) {
    this.#encounters = encounters;
  }

  /** «Registrar llegada» / «Iniciar visita sin cita» (S-REC-26), con Idempotency-Key. */
  @Post()
  @RequirePermission('patients.access', 'appointments.check_in')
  arrive(@Req() request: FastifyRequest, @Body() body: unknown, @IdempotencyKey() key: string) {
    // El hash de la clave se calcula con el cuerpo tal como llegó; el servicio lo valida.
    parse(arrivalSchema, body);
    return this.#encounters.arrive(principalOf(request), body as ArrivalInput, key, metaOf(request));
  }

  /** S-CLI-06: proveedores activos de la sede (quien asigna: Recepción). */
  @Get('providers')
  @RequirePermission('patients.access', 'visits.manage')
  providers(@Req() request: FastifyRequest) {
    return this.#encounters.providers(principalOf(request));
  }

  /** S-CLI-04: la visita con su cobertura, su historial y lo que puede hacer quien la abre. Lectura auditada. */
  @Get(':id')
  @RequirePermission('patients.access')
  get(@Req() request: FastifyRequest, @Param('id') encounterId: string) {
    return this.#encounters.detail(principalOf(request), id(encounterId), metaOf(request));
  }

  /** S-CLI-07: un paso regular; la máquina de estados comprueba el rol dueño. */
  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('patients.access')
  transition(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    return this.#encounters.transition(principalOf(request), id(encounterId), parse(encounterTransitionSchema, body), metaOf(request));
  }

  /**
   * «Iniciar consulta» (T-023), desde la cola y desde la barra: el rol
   * Proveedor; sin proveedor asignado, se la autoasigna en la misma transacción.
   */
  @Post(':id/start-consult')
  @HttpCode(200)
  @RequirePermission('patients.access')
  startConsult(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    return this.#encounters.startConsult(principalOf(request), id(encounterId), parse(startConsultSchema, body), metaOf(request));
  }

  /** S-CLI-09 «Cerrar visita», con motivo. */
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission('patients.access')
  close(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    return this.#encounters.close(principalOf(request), id(encounterId), parse(closeEncounterSchema, body), metaOf(request));
  }

  /** S-CLI-10 «Forzar estado…»: Propietario o Administrador, solo con un rol clínico en la sede (ADR 0033). */
  @Post(':id/force')
  @HttpCode(200)
  @RequirePermission('patients.access', 'visits.force_state')
  force(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    return this.#encounters.force(principalOf(request), id(encounterId), parse(forceEncounterSchema, body), metaOf(request));
  }

  /** S-CLI-05/06: asignar proveedor (Recepción) o «Asignarme» (Proveedor); lo decide el servicio. */
  @Post(':id/provider')
  @HttpCode(200)
  @RequirePermission('patients.access')
  assignProvider(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    return this.#encounters.assignProvider(principalOf(request), id(encounterId), parse(assignProviderSchema, body), metaOf(request));
  }

  /** S-CLI-12: corregir la cobertura (Recepción). El servicio convierte los importes a centavos. */
  @Post(':id/coverage')
  @HttpCode(200)
  @RequirePermission('patients.access', 'visits.manage')
  coverage(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    parse(updateCoverageSchema, body);
    return this.#encounters.updateCoverage(principalOf(request), id(encounterId), body, metaOf(request));
  }
}

/** S-PAC-08 Pestaña Visitas del perfil (T-018): en las sedes donde quien llama tiene un rol clínico. */
@Controller('patients')
export class PatientEncountersController {
  readonly #encounters: EncounterService;
  constructor(@Inject(EncounterService) encounters: EncounterService) {
    this.#encounters = encounters;
  }

  @Get(':id/encounters')
  @RequirePermission('patients.access')
  list(@Req() request: FastifyRequest, @Param('id') patientId: string, @Query('offset') offset: unknown) {
    return this.#encounters.forPatient(principalOf(request), id(patientId), parse(offsetSchema, offset ?? '0'), metaOf(request));
  }
}

/**
 * Membresía del paciente (T-026b parte B; S-PAC-22 y 23; ADR 0034). Verla en
 * el perfil: patients.access. Inscribir, afiliados y aviso de cancelación:
 * además memberships.manage (Recepción). Inscribir lleva Idempotency-Key.
 */
@Controller('patients')
export class PatientMembershipController {
  readonly #memberships: PatientMembershipService;
  constructor(@Inject(PatientMembershipService) memberships: PatientMembershipService) {
    this.#memberships = memberships;
  }

  @Get(':id/membership')
  @RequirePermission('patients.access')
  card(@Req() request: FastifyRequest, @Param('id') patientId: string) {
    return this.#memberships.card(principalOf(request), id(patientId), metaOf(request));
  }

  @Post(':id/membership')
  @RequirePermission('patients.access', 'memberships.manage')
  enroll(@Req() request: FastifyRequest, @Param('id') patientId: string, @Body() body: unknown, @IdempotencyKey() key: string) {
    // El hash de la clave se calcula con el cuerpo tal como llegó; el servicio lo valida.
    parse(enrollMembershipSchema, body);
    return this.#memberships.enroll(principalOf(request), id(patientId), body, key, metaOf(request));
  }
}

@Controller('patient-memberships')
export class PatientMembershipsController {
  readonly #memberships: PatientMembershipService;
  constructor(@Inject(PatientMembershipService) memberships: PatientMembershipService) {
    this.#memberships = memberships;
  }

  /** S-PAC-23: planes que se pueden elegir hoy y el rango de la fecha de inicio. */
  @Get('enrollment-options')
  @RequirePermission('patients.access', 'memberships.manage')
  options(@Req() request: FastifyRequest) {
    return this.#memberships.enrollmentOptions(principalOf(request));
  }

  @Post(':id/members')
  @HttpCode(200)
  @RequirePermission('patients.access', 'memberships.manage')
  addMember(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Body() body: unknown) {
    return this.#memberships.addMember(principalOf(request), id(membershipId), parse(addMembershipMemberSchema, body), metaOf(request));
  }

  @Post(':id/members/:patientId/remove')
  @HttpCode(200)
  @RequirePermission('patients.access', 'memberships.manage')
  removeMember(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Param('patientId') patientId: string, @Body() body: unknown) {
    return this.#memberships.removeMember(principalOf(request), id(membershipId), id(patientId), parse(membershipVersionSchema, body), metaOf(request));
  }

  /** «Registrar aviso de cancelación». */
  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('patients.access', 'memberships.manage')
  cancel(@Req() request: FastifyRequest, @Param('id') membershipId: string, @Body() body: unknown) {
    return this.#memberships.cancel(principalOf(request), id(membershipId), parse(membershipVersionSchema, body), metaOf(request));
  }
}

/**
 * S-REC-01 Panel en vivo (T-019): la foto de la sede activa. Exige panel.view
 * y, porque lleva nombres de pacientes, patients.access (ADR 0027).
 */
@Controller('panel')
export class PanelController {
  readonly #panel: PanelService;
  constructor(@Inject(PanelService) panel: PanelService) {
    this.#panel = panel;
  }

  @Get()
  @RequirePermission('panel.view', 'patients.access')
  snapshot(@Req() request: FastifyRequest) {
    return this.#panel.snapshot(principalOf(request), metaOf(request));
  }
}

/**
 * Enfermería (T-022; S-CLI-01, S-CLI-13 a 16). Todo exige patients.access (un
 * rol clínico en la sede, ADR 0027). La cola, además nursing_queue.access;
 * signos vitales, nursing.vitals; valoración, nursing.assessment. «Enviar al
 * proveedor» lo decide la máquina de estados (regular) o nursing.send_exception
 * (excepción, ADR 0033): lo comprueba el servicio.
 */
@Controller()
export class NursingController {
  readonly #nursing: NursingService;
  constructor(@Inject(NursingService) nursing: NursingService) {
    this.#nursing = nursing;
  }

  @Get('nursing/queue')
  @RequirePermission('nursing_queue.access', 'patients.access')
  queue(@Req() request: FastifyRequest) {
    return this.#nursing.queue(principalOf(request), metaOf(request));
  }

  @Get('encounters/:id/nursing')
  @RequirePermission('patients.access')
  section(@Req() request: FastifyRequest, @Param('id') encounterId: string) {
    return this.#nursing.section(principalOf(request), id(encounterId), metaOf(request));
  }

  @Put('encounters/:id/vitals')
  @RequirePermission('patients.access', 'nursing.vitals')
  vitals(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    parse(saveVitalsSchema, body);
    return this.#nursing.saveVitals(principalOf(request), id(encounterId), body, metaOf(request));
  }

  @Put('encounters/:id/assessment')
  @RequirePermission('patients.access', 'nursing.assessment')
  assessment(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    parse(saveAssessmentSchema, body);
    return this.#nursing.saveAssessment(principalOf(request), id(encounterId), body, metaOf(request));
  }

  @Post('encounters/:id/send-to-provider')
  @HttpCode(200)
  @RequirePermission('patients.access')
  send(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    parse(sendToProviderSchema, body);
    return this.#nursing.sendToProvider(principalOf(request), id(encounterId), body, metaOf(request));
  }
}

/**
 * Órdenes (T-025; S-CLI-17, 18 y 21). Todo exige patients.access (un rol
 * clínico en la sede, ADR 0027). Ver la sección: los cuatro roles clínicos
 * (Recepción sin notas). Crear, el catálogo con precios y la vista previa:
 * orders.create (solo el rol Proveedor, ADR 0033), con Idempotency-Key.
 * Cancelar: orders.cancel (el servicio comprueba que sea suya o de su
 * visita), con Idempotency-Key. «Cambiar laboratorio…»: orders.execute
 * (Enfermería y Proveedor). Ninguna respuesta lleva costos de laboratorio.
 * T-026: cola, asignar, iniciar y completar: orders.execute (Enfermería y
 * Proveedor en la sede; el servicio respeta la asignación), con `version`.
 */
@Controller()
export class OrdersController {
  readonly #orders: OrderService;
  constructor(@Inject(OrderService) orders: OrderService) {
    this.#orders = orders;
  }

  @Get('encounters/:id/orders')
  @RequirePermission('patients.access')
  list(@Req() request: FastifyRequest, @Param('id') encounterId: string) {
    return this.#orders.list(principalOf(request), id(encounterId), metaOf(request));
  }

  @Get('encounters/:id/orderables')
  @RequirePermission('patients.access', 'orders.create')
  orderables(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Query('type') type: unknown) {
    if (!isOrderType(type)) throw new HttpError(400, 'invalid_request');
    return this.#orders.orderable(principalOf(request), id(encounterId), type);
  }

  @Post('encounters/:id/orders/preview')
  @HttpCode(200)
  @RequirePermission('patients.access', 'orders.create')
  preview(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown) {
    return this.#orders.preview(principalOf(request), id(encounterId), parse(orderPreviewSchema, body));
  }

  @Post('encounters/:id/orders')
  @RequirePermission('patients.access', 'orders.create')
  create(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown, @IdempotencyKey() key: string) {
    // El hash de la clave se calcula con el cuerpo tal como llegó; el servicio lo valida.
    parse(createOrderSchema, body);
    return this.#orders.create(principalOf(request), id(encounterId), body, key, metaOf(request));
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @RequirePermission('patients.access', 'orders.cancel')
  cancel(@Req() request: FastifyRequest, @Param('id') orderId: string, @Body() body: unknown, @IdempotencyKey() key: string) {
    parse(cancelOrderSchema, body);
    return this.#orders.cancel(principalOf(request), id(orderId), body, key, metaOf(request));
  }

  @Get('orders/:id/lab-options')
  @RequirePermission('patients.access', 'orders.execute')
  labOptions(@Req() request: FastifyRequest, @Param('id') orderId: string) {
    return this.#orders.labOptions(principalOf(request), id(orderId));
  }

  @Post('orders/:id/lab')
  @HttpCode(200)
  @RequirePermission('patients.access', 'orders.execute')
  changeLab(@Req() request: FastifyRequest, @Param('id') orderId: string, @Body() body: unknown) {
    return this.#orders.changeLab(principalOf(request), id(orderId), parse(changeOrderLabSchema, body), metaOf(request));
  }

  /** S-CLI-03 Cola de órdenes (T-026): orders_queue.access y orders.execute (Enfermería y Proveedor). */
  @Get('orders/queue')
  @RequirePermission('patients.access', 'orders_queue.access', 'orders.execute')
  queue(@Req() request: FastifyRequest, @Query('tab') tab: unknown, @Query('mine') mine: unknown) {
    const selected = tab === undefined ? 'pending' : tab;
    if (!isOrderQueueTab(selected)) throw new HttpError(400, 'invalid_request');
    return this.#orders.queue(principalOf(request), selected, mine === '1' || mine === 'true', metaOf(request));
  }

  /** S-CLI-22: a quién se puede asignar (rol Enfermería o Proveedor en la sede). */
  @Get('orders/assignees')
  @RequirePermission('patients.access', 'orders.execute')
  assignees(@Req() request: FastifyRequest) {
    return this.#orders.assignees(principalOf(request));
  }

  @Post('orders/:id/assign')
  @HttpCode(200)
  @RequirePermission('patients.access', 'orders.execute')
  assign(@Req() request: FastifyRequest, @Param('id') orderId: string, @Body() body: unknown) {
    return this.#orders.assign(principalOf(request), id(orderId), parse(assignOrderSchema, body), metaOf(request));
  }

  @Post('orders/:id/start')
  @HttpCode(200)
  @RequirePermission('patients.access', 'orders.execute')
  start(@Req() request: FastifyRequest, @Param('id') orderId: string, @Body() body: unknown) {
    return this.#orders.start(principalOf(request), id(orderId), parse(startOrderSchema, body), metaOf(request));
  }

  @Post('orders/:id/complete')
  @HttpCode(200)
  @RequirePermission('patients.access', 'orders.execute')
  complete(@Req() request: FastifyRequest, @Param('id') orderId: string, @Body() body: unknown) {
    return this.#orders.complete(principalOf(request), id(orderId), parse(completeOrderSchema, body), metaOf(request));
  }
}

/**
 * Caja (T-027; S-CAJ-01 a 08, S-CAJ-16, S-CLI-23). El estado de cuenta lo
 * ven los cuatro roles clínicos (patients.access): Recepción con sus líneas,
 * Enfermería y el Proveedor solo los totales (lo decide el servicio). La cola,
 * el catálogo de cargos y «Agregar cargo» (con Idempotency-Key): Recepción
 * (checkout.access).
 */
@Controller()
export class BillingController {
  readonly #billing: BillingService;
  constructor(@Inject(BillingService) billing: BillingService) {
    this.#billing = billing;
  }

  @Get('encounters/:id/statement')
  @RequirePermission('patients.access')
  statement(@Req() request: FastifyRequest, @Param('id') encounterId: string) {
    return this.#billing.statement(principalOf(request), id(encounterId), metaOf(request));
  }

  @Get('encounters/:id/charge-options')
  @RequirePermission('patients.access', 'checkout.access')
  chargeOptions(@Req() request: FastifyRequest, @Param('id') encounterId: string) {
    return this.#billing.chargeOptions(principalOf(request), id(encounterId));
  }

  @Post('encounters/:id/charges')
  @RequirePermission('patients.access', 'checkout.access')
  addCharge(@Req() request: FastifyRequest, @Param('id') encounterId: string, @Body() body: unknown, @IdempotencyKey() key: string) {
    // El hash de la clave se calcula con el cuerpo tal como llegó; el servicio lo valida.
    parse(addChargeSchema, body);
    return this.#billing.addCharge(principalOf(request), id(encounterId), body, key, metaOf(request));
  }

  @Get('checkout/queue')
  @RequirePermission('patients.access', 'checkout.access')
  queue(@Req() request: FastifyRequest, @Query('q') q: unknown) {
    if (q !== undefined && (typeof q !== 'string' || q.length > 120)) throw new HttpError(400, 'invalid_request');
    return this.#billing.queue(principalOf(request), q ?? '', metaOf(request));
  }
}

/** S-CLI-02 Cola de proveedor (T-023): el rol Proveedor (provider_queue.access) con patients.access. Lectura auditada. */
@Controller('provider')
export class ProviderController {
  readonly #provider: ProviderService;
  constructor(@Inject(ProviderService) provider: ProviderService) {
    this.#provider = provider;
  }

  @Get('queue')
  @RequirePermission('provider_queue.access', 'patients.access')
  queue(@Req() request: FastifyRequest) {
    return this.#provider.queue(principalOf(request), metaOf(request));
  }
}

/**
 * Sedes › Kioscos (S-ADM-10, T-020): Propietario y Administrador (kiosks.manage).
 * Las tabletas de una sede, vincular (código de un solo uso), generar otro
 * código y revocar con motivo.
 */
@Controller('locations/:locationId/kiosks')
export class LocationKiosksController {
  readonly #kiosks: KioskAdminService;
  constructor(@Inject(KioskAdminService) kiosks: KioskAdminService) {
    this.#kiosks = kiosks;
  }

  @Get()
  @RequirePermission('kiosks.manage')
  list(@Req() request: FastifyRequest, @Param('locationId') locationId: string) {
    return this.#kiosks.list(principalOf(request), id(locationId));
  }

  @Post()
  @RequirePermission('kiosks.manage')
  create(@Req() request: FastifyRequest, @Param('locationId') locationId: string, @Body() body: unknown) {
    return this.#kiosks.createPairing(principalOf(request), id(locationId), body, metaOf(request));
  }

  @Post(':deviceId/code')
  @HttpCode(200)
  @RequirePermission('kiosks.manage')
  regenerate(@Req() request: FastifyRequest, @Param('deviceId') deviceId: string, @Body() body: unknown) {
    return this.#kiosks.regenerateCode(principalOf(request), id(deviceId), body, metaOf(request));
  }

  @Post(':deviceId/revoke')
  @HttpCode(200)
  @RequirePermission('kiosks.manage')
  revoke(@Req() request: FastifyRequest, @Param('deviceId') deviceId: string, @Body() body: unknown) {
    return this.#kiosks.revoke(principalOf(request), id(deviceId), body, metaOf(request));
  }
}

/**
 * La tableta del kiosco (T-020; ADR 0014). Sin sesión del personal: se
 * identifica solo con su cookie (Path=/api/kiosk). Ninguna de estas rutas
 * lee datos: vincular, renovar la sesión (devuelve solo su sede) y enviar.
 */
@Controller('kiosk')
@Public()
export class KioskController {
  readonly #kiosk: KioskService;
  readonly #secure: boolean;
  constructor(@Inject(KioskService) kiosk: KioskService, @Inject(SECURE_COOKIES) secure: boolean) {
    this.#kiosk = kiosk;
    this.#secure = secure;
  }

  @Post('link')
  @HttpCode(200)
  async link(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Body() body: unknown) {
    const { token, session } = await this.#kiosk.link(body, metaOf(request));
    void reply.header('set-cookie', kioskCookie(token, this.#secure));
    return session;
  }

  /** Renueva la cookie (90 días más) y devuelve solo el código y el nombre de la sede. */
  @Post('session')
  @HttpCode(200)
  async session(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = kioskTokenOf(request.headers.cookie);
    try {
      const session = await this.#kiosk.session(token);
      if (token) void reply.header('set-cookie', kioskCookie(token, this.#secure));
      return session;
    } catch (error) {
      // Revocada o vencida: se borra la cookie.
      if (error instanceof HttpError && error.status === 401) void reply.header('set-cookie', `${KIOSK_COOKIE}=; Path=/api/kiosk; Max-Age=0; HttpOnly; SameSite=Strict`);
      throw error;
    }
  }

  /** S-KIO-01 «Registrarme», con Idempotency-Key. */
  @Post('checkins')
  @HttpCode(201)
  submit(@Req() request: FastifyRequest, @Body() body: unknown, @IdempotencyKey() key: string) {
    return this.#kiosk.submit(kioskTokenOf(request.headers.cookie), body, key, metaOf(request));
  }
}

/**
 * S-REC-28 Llegadas del kiosco (T-021): Recepción (appointments.check_in +
 * patients.access). Confirmar va por POST /api/encounters con kioskCheckinId.
 */
@Controller('kiosk-arrivals')
export class KioskArrivalsController {
  readonly #arrivals: KioskArrivalService;
  constructor(@Inject(KioskArrivalService) arrivals: KioskArrivalService) {
    this.#arrivals = arrivals;
  }

  @Get()
  @RequirePermission('patients.access', 'appointments.check_in')
  list(@Req() request: FastifyRequest) {
    return this.#arrivals.list(principalOf(request), metaOf(request));
  }

  /** La cita de hoy de un paciente en la sede (para confirmar con cita). */
  @Get('today-appointment/:patientId')
  @RequirePermission('patients.access', 'appointments.check_in')
  today(@Req() request: FastifyRequest, @Param('patientId') patientId: string) {
    return this.#arrivals.todayAppointment(principalOf(request), id(patientId));
  }

  @Get(':id')
  @RequirePermission('patients.access', 'appointments.check_in')
  detail(@Req() request: FastifyRequest, @Param('id') checkinId: string) {
    return this.#arrivals.detail(principalOf(request), id(checkinId), metaOf(request));
  }

  @Post(':id/discard')
  @HttpCode(200)
  @RequirePermission('patients.access', 'appointments.check_in')
  discard(@Req() request: FastifyRequest, @Param('id') checkinId: string, @Body() body: unknown) {
    return this.#arrivals.discard(principalOf(request), id(checkinId), body, metaOf(request));
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
  membershipPlans: MembershipPlanService;
  patientMemberships: PatientMembershipService;
  patients: PatientService;
  appointments: AppointmentService;
  appointmentCommands: AppointmentCommands;
  encounters: EncounterService;
  panel: PanelService;
  nursing: NursingService;
  provider: ProviderService;
  orders: OrderService;
  billing: BillingService;
  kiosk: KioskService;
  kioskAdmin: KioskAdminService;
  kioskArrivals: KioskArrivalService;
  secureCookies: boolean;
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
      AdminMembershipPlansController,
      CatalogController,
      PatientsController,
      AppointmentsController,
      PatientAppointmentsController,
      ArrivalsController,
      EncountersController,
      PatientEncountersController,
      PatientMembershipController,
      PatientMembershipsController,
      PanelController,
      NursingController,
      ProviderController,
      OrdersController,
      BillingController,
      LocationKiosksController,
      KioskController,
      KioskArrivalsController,
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
      { provide: MembershipPlanService, useValue: providers.membershipPlans },
      { provide: PatientMembershipService, useValue: providers.patientMemberships },
      { provide: PatientService, useValue: providers.patients },
      { provide: AppointmentService, useValue: providers.appointments },
      { provide: AppointmentCommands, useValue: providers.appointmentCommands },
      { provide: EncounterService, useValue: providers.encounters },
      { provide: PanelService, useValue: providers.panel },
      { provide: NursingService, useValue: providers.nursing },
      { provide: ProviderService, useValue: providers.provider },
      { provide: OrderService, useValue: providers.orders },
      { provide: BillingService, useValue: providers.billing },
      { provide: KioskService, useValue: providers.kiosk },
      { provide: KioskAdminService, useValue: providers.kioskAdmin },
      { provide: KioskArrivalService, useValue: providers.kioskArrivals },
      { provide: SECURE_COOKIES, useValue: providers.secureCookies },
      { provide: USER_EMAIL_LOOKUP, useValue: providers.emailOf },
      { provide: AuditService, useValue: providers.audit },
      { provide: IDLE_TIMEOUT_SECONDS, useValue: providers.idleTimeoutSeconds },
    ],
  })
  class ApiModule {}
  return ApiModule;
}
