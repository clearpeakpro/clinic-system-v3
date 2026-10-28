import {
  acceptInvitationSchema,
  changeRolesSchema,
  createInvitationSchema,
  deactivateMembershipSchema,
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
  SetMetadata,
  type ArgumentsHost,
  type CanActivate,
  type ExceptionFilter,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from './principal.ts';
import { ContextService, HttpError, InvitationService, MembershipService, type RequestMeta } from './services.ts';

export const USER_EMAIL_LOOKUP = Symbol('USER_EMAIL_LOOKUP');
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
  constructor(@Inject(ContextService) contexts: ContextService) {
    this.#contexts = contexts;
  }

  @Get()
  me(@Req() request: FastifyRequest) {
    const principal = principalOf(request);
    return {
      userId: principal.userId,
      twoFactorEnabled: principal.twoFactorEnabled,
      mfaRequired: principal.mfaRequired,
      context: principal.context,
      permissions: [...principal.permissions].sort(),
    };
  }

  @Get('locations')
  locations(@Req() request: FastifyRequest) {
    return this.#contexts.choices(principalOf(request));
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
  create(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.#invitations.create(principalOf(request), parse(createInvitationSchema, body), metaOf(request));
  }

  @Post('accept')
  @Public()
  async accept(@Req() request: FastifyRequest, @Body() body: unknown) {
    const input = parse(acceptInvitationSchema, body);
    const principal = request.principal;
    let signedIn: { principal: Principal; email: string } | null = null;
    if (principal) {
      const email = await this.#emailOf(principal.userId);
      if (!email) throw new HttpError(401, 'unauthenticated');
      signedIn = { principal, email };
    }
    return this.#invitations.accept(input, signedIn, metaOf(request));
  }
}

@Controller('memberships')
export class MembershipsController {
  readonly #memberships: MembershipService;
  constructor(@Inject(MembershipService) memberships: MembershipService) {
    this.#memberships = memberships;
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async deactivate(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(deactivateMembershipSchema, body);
    await this.#memberships.deactivate(principalOf(request), parse(z.uuid(), id), reason, metaOf(request));
  }

  @Post(':id/roles')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async changeRoles(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: unknown) {
    await this.#memberships.changeRoles(
      principalOf(request),
      parse(z.uuid(), id),
      parse(changeRolesSchema, body),
      metaOf(request),
    );
  }
}

export interface ApiProviders {
  contexts: ContextService;
  invitations: InvitationService;
  memberships: MembershipService;
  emailOf: UserEmailLookup;
}

export function createApiModule(providers: ApiProviders) {
  @Module({
    controllers: [MeController, ContextController, InvitationsController, MembershipsController],
    providers: [
      { provide: ContextService, useValue: providers.contexts },
      { provide: InvitationService, useValue: providers.invitations },
      { provide: MembershipService, useValue: providers.memberships },
      { provide: USER_EMAIL_LOOKUP, useValue: providers.emailOf },
    ],
  })
  class ApiModule {}
  return ApiModule;
}
