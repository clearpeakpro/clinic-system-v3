import {
  acceptInvitationSchema,
  changeRolesSchema,
  createInvitationSchema,
  credentialResetSchema,
  deactivateMembershipSchema,
  reactivateMembershipSchema,
  renameMemberSchema,
  revokeInvitationSchema,
  changePasswordSchema,
  mfaCodeSchema,
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
import type { Principal } from './principal.ts';
import { InvitationService } from './invitations.ts';
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
      void reply.status(error.status).send({ code: error.code });
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

export interface ApiProviders {
  contexts: ContextService;
  invitations: InvitationService;
  memberships: MembershipService;
  profile: ProfileService;
  emailOf: UserEmailLookup;
  audit: AuditService;
  idleTimeoutSeconds: number;
}

export function createApiModule(providers: ApiProviders) {
  @Module({
    controllers: [MeController, ContextController, InvitationsController, UsersController, MembershipsController],
    providers: [
      { provide: ContextService, useValue: providers.contexts },
      { provide: InvitationService, useValue: providers.invitations },
      { provide: MembershipService, useValue: providers.memberships },
      { provide: ProfileService, useValue: providers.profile },
      { provide: USER_EMAIL_LOOKUP, useValue: providers.emailOf },
      { provide: AuditService, useValue: providers.audit },
      { provide: IDLE_TIMEOUT_SECONDS, useValue: providers.idleTimeoutSeconds },
    ],
  })
  class ApiModule {}
  return ApiModule;
}
