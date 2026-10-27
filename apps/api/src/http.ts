import { patients, type TenantDb } from '@clinic/db';
import type { Permission } from '@clinic/shared';
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
  SetMetadata,
  type ArgumentsHost,
  type CanActivate,
  type ExceptionFilter,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PersonPrincipal, Principal } from './principal.ts';
import {
  ContextService,
  HttpError,
  InvitationService,
  MembershipService,
} from './services.ts';

export const TENANT_DB = Symbol('TENANT_DB');
export const USER_EMAIL_LOOKUP = Symbol('USER_EMAIL_LOOKUP');
export type UserEmailLookup = (userId: string) => Promise<string | null>;

const PUBLIC = 'clinic:public';
const PERMISSION = 'clinic:permission';

/** Ruta sin autenticación obligatoria. */
export const Public = () => SetMetadata(PUBLIC, true);
/** El backend autoriza siempre: permiso de packages/shared/permissions.ts. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION, permission);

export class PermissionGuard implements CanActivate {
  readonly #reflector: Reflector;
  constructor(reflector: Reflector) {
    this.#reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.#reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const principal = request.principal;
    if (!principal) throw new HttpError(401, 'unauthenticated');
    const permission = this.#reflector.getAllAndOverride<Permission | undefined>(PERMISSION, targets);
    if (permission === undefined) {
      // Sin permiso declarado: solo personas (nunca el kiosco).
      if (principal.kind !== 'person') throw new HttpError(403, 'forbidden');
      return true;
    }
    if (!principal.permissions.has(permission)) throw new HttpError(403, 'forbidden');
    return true;
  }
}

@Catch(HttpError)
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: HttpError, host: ArgumentsHost): void {
    void host.switchToHttp().getResponse<FastifyReply>().status(error.status).send({ code: error.code });
  }
}

function person(request: FastifyRequest): PersonPrincipal {
  const principal = request.principal;
  if (principal?.kind !== 'person') throw new HttpError(403, 'forbidden');
  return principal;
}

function requireContext(principal: Principal) {
  if (!principal.context) throw new HttpError(403, 'no_active_context');
  return principal.context;
}

function str(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, code);
  return value;
}

@Controller()
export class SessionController {
  readonly #contexts: ContextService;
  constructor(@Inject(ContextService) contexts: ContextService) {
    this.#contexts = contexts;
  }

  @Get('me')
  me(@Req() request: FastifyRequest) {
    const principal = person(request);
    return {
      userId: principal.userId,
      context: principal.context,
      twoFactorEnabled: principal.twoFactorEnabled,
      mfaRequired: principal.mfaRequired,
      organizations: [...new Set(principal.assignments.map((a) => a.organizationId))].sort(),
    };
  }

  /** El cliente elige; el servidor valida contra memberships y lo guarda en la sesión. */
  @Post('context')
  @HttpCode(204)
  async selectContext(@Req() request: FastifyRequest, @Body() body: Record<string, unknown> | undefined) {
    await this.#contexts.select(
      person(request),
      str(body?.organizationId, 'organization_required'),
      str(body?.locationId, 'location_required'),
    );
  }
}

@Controller('patients')
export class PatientsController {
  readonly #tenantDb: TenantDb;
  constructor(@Inject(TENANT_DB) tenantDb: TenantDb) {
    this.#tenantDb = tenantDb;
  }

  /** Endpoint de lectura mínimo (sin PHI en la respuesta: solo ids). */
  @Get()
  @RequirePermission('patients.read')
  async list(@Req() request: FastifyRequest) {
    const { organizationId } = requireContext(person(request));
    const rows = await this.#tenantDb.withTenant(organizationId, (tx) =>
      tx.select({ id: patients.id, organizationId: patients.organizationId }).from(patients),
    );
    return { organizationId, ids: rows.map((r) => r.id), organizationIds: [...new Set(rows.map((r) => r.organizationId))] };
  }
}

@Controller('kiosk')
export class KioskController {
  @Post('checkins')
  @HttpCode(202)
  @RequirePermission('kiosk.submit')
  submit(@Req() request: FastifyRequest) {
    const principal = request.principal;
    if (principal?.kind !== 'kiosk') throw new HttpError(403, 'forbidden');
    // La prueba solo comprueba la autorización; el registro real es de la fase 3.
    return { accepted: true, locationId: principal.context.locationId };
  }
}

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

  @Post()
  @RequirePermission('members.invite')
  create(@Req() request: FastifyRequest, @Body() body: Record<string, unknown> | undefined) {
    const locationId = body?.locationId;
    return this.#invitations.create(
      person(request),
      {
        email: str(body?.email, 'email_required'),
        role: str(body?.role, 'role_required'),
        locationId: typeof locationId === 'string' ? locationId : null,
      },
      request.clientIp,
    );
  }

  @Post('accept')
  @Public()
  async accept(@Req() request: FastifyRequest, @Body() body: Record<string, unknown> | undefined) {
    const principal = request.principal;
    if (principal?.kind === 'kiosk') throw new HttpError(403, 'forbidden');
    const signedIn = principal ?? null;
    const name = body?.name;
    const password = body?.password;
    const result = await this.#invitations.accept(
      {
        organizationId: str(body?.organizationId, 'organization_required'),
        token: str(body?.token, 'token_required'),
        ...(typeof name === 'string' ? { name } : {}),
        ...(typeof password === 'string' ? { password } : {}),
      },
      signedIn,
      signedIn ? await this.#emailOf(signedIn.userId) : null,
      request.clientIp,
    );
    return { membershipId: result.membershipId };
  }
}

@Controller('memberships')
export class MembershipsController {
  readonly #memberships: MembershipService;
  constructor(@Inject(MembershipService) memberships: MembershipService) {
    this.#memberships = memberships;
  }

  @Post(':id/remove')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async remove(@Req() request: FastifyRequest, @Param('id') id: string) {
    await this.#memberships.remove(person(request), id, request.clientIp);
  }
}

export interface ApiProviders {
  tenantDb: TenantDb;
  contexts: ContextService;
  invitations: InvitationService;
  memberships: MembershipService;
  emailOf: UserEmailLookup;
}

export function createApiModule(providers: ApiProviders) {
  @Module({
    controllers: [
      SessionController,
      PatientsController,
      KioskController,
      InvitationsController,
      MembershipsController,
    ],
    providers: [
      { provide: TENANT_DB, useValue: providers.tenantDb },
      { provide: ContextService, useValue: providers.contexts },
      { provide: InvitationService, useValue: providers.invitations },
      { provide: MembershipService, useValue: providers.memberships },
      { provide: USER_EMAIL_LOOKUP, useValue: providers.emailOf },
    ],
  })
  class ApiModule {}
  return ApiModule;
}
