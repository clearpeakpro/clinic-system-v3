import 'reflect-metadata';
import { createTenantDb, user as userTable } from '@clinic/db';
import { Reflector } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyReply, FastifyRequest } from 'fastify';
import pg from 'pg';
import { AuditService } from './audit.ts';
import { CLIENT_IP_HEADER, createAuth } from './auth.ts';
import type { AppConfig } from './config.ts';
import { RevocationBus } from './events.ts';
import { createApiModule, HttpErrorFilter, PermissionGuard } from './http.ts';
import { LOG_REDACT_PATHS, type LogSink } from './logging.ts';
import type { Mailer } from './mailer.ts';
import { PrincipalResolver } from './principal.ts';
import { attachRealtime } from './realtime.ts';
import { isMfaEnrollmentPath, parseCookies, toHeaders } from './request-context.ts';
import {
  ContextService,
  InvitationService,
  KioskService,
  MembershipService,
} from './services.ts';

export interface AppDeps {
  config: AppConfig;
  mailer: Mailer;
  logs: LogSink;
  disableSignUp?: boolean;
}

export async function createApp({ config, mailer, logs, disableSignUp }: AppDeps) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  const tenantDb = createTenantDb(pool);
  const audit = new AuditService(pool, tenantDb, config.auditHmacKey);
  const auth = createAuth({ config, pool, audit, logs, ...(disableSignUp === undefined ? {} : { disableSignUp }) });
  const resolver = new PrincipalResolver(auth, pool, tenantDb, config);
  const bus = new RevocationBus();
  const plain = drizzle({ client: pool });

  const services = {
    contexts: new ContextService(pool),
    invitations: new InvitationService(tenantDb, auth, mailer, audit, config),
    memberships: new MembershipService(pool, tenantDb, resolver, bus, audit),
    kiosks: new KioskService(tenantDb),
  };
  const emailOf = async (userId: string) =>
    (await plain.select({ email: userTable.email }).from(userTable).where(eq(userTable.id, userId)))[0]?.email ?? null;

  const adapter = new FastifyAdapter({
    logger: {
      level: 'info',
      redact: LOG_REDACT_PATHS,
      stream: { write: (line: string) => { logs.write({ source: 'fastify', level: 'info', message: line }); } },
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    createApiModule({ tenantDb, emailOf, ...services }),
    adapter,
    { logger: false },
  );
  const fastify = app.getHttpAdapter().getInstance();

  fastify.decorateRequest('principal', null);
  fastify.decorateRequest('clientIp', null);

  // Identificación en todas las rutas, incluidas las de Better Auth.
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    request.clientIp = request.ip;
    const path = request.url.split('?')[0] ?? '';
    const isAuthRoute = path.startsWith('/api/auth/');
    const resolution = await resolver.resolve(toHeaders(request.headers), parseCookies(request.headers.cookie));
    if (!resolution.ok) {
      // Better Auth gestiona por sí mismo una cookie vencida (p. ej. al iniciar sesión).
      if (isAuthRoute) return;
      return reply.status(resolution.status).send({ code: resolution.code });
    }
    for (const cookie of resolution.setCookies ?? []) void reply.header('set-cookie', cookie);
    request.principal = resolution.principal;
    const principal = resolution.principal;
    // Criterio 3: la regla vive aquí, no en el plugin.
    if (principal?.kind === 'person' && principal.mfaRequired && !principal.twoFactorEnabled && !isMfaEnrollmentPath(path)) {
      return reply.status(403).send({ code: 'mfa_enrollment_required' });
    }
    if (principal?.kind === 'kiosk' && isAuthRoute) {
      return reply.status(403).send({ code: 'forbidden' });
    }
  });

  // Better Auth montado como en su integración oficial con Fastify.
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, config.baseURL);
      const headers = toHeaders(request.headers);
      // La IP la pone el servidor; nunca la que envíe el cliente.
      headers.set(CLIENT_IP_HEADER, request.ip);
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers,
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        }),
      );
      void reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') void reply.header(key, value);
      });
      for (const cookie of response.headers.getSetCookie()) void reply.header('set-cookie', cookie);
      return reply.send(response.body ? await response.text() : null);
    },
  });

  // ADR 0014 y CLAUDE.md: toda la API responde con no-store.
  fastify.addHook('onSend', async (_request, reply) => {
    void reply.header('cache-control', 'no-store');
  });

  app.useGlobalGuards(new PermissionGuard(app.get(Reflector)));
  app.useGlobalFilters(new HttpErrorFilter());
  await app.init();

  const realtime = attachRealtime(app.getHttpServer(), resolver, bus, config.socketRevalidateMs);

  return {
    app,
    fastify,
    auth,
    pool,
    services,
    resolver,
    async close() {
      realtime.close();
      await app.close();
      await pool.end();
    },
  };
}

export type ClinicApp = Awaited<ReturnType<typeof createApp>>;
