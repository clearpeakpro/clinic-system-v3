import 'reflect-metadata';
import { createTenantDb, user as userTable } from '@clinic/db';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyReply, FastifyRequest } from 'fastify';
import pg from 'pg';
import { AuditService } from './audit.ts';
import { CLIENT_IP_HEADER, createAuth, REQUEST_ID_HEADER } from './auth.ts';
import { assertConfig, type AppConfig } from './config.ts';
import { createApiModule, ErrorFilter, PermissionGuard } from './http.ts';
import { LOG_REDACT_PATHS, type LogSink } from './logging.ts';
import { PrincipalResolver } from './principal.ts';
import { hasSessionCookie, isMfaEnrollmentPath, toHeaders } from './request-context.ts';
import { InvitationService } from './invitations.ts';
import { LocationService } from './locations.ts';
import { NotificationService } from './notifications.ts';
import { CatalogService } from './catalog.ts';
import { ProfileService } from './profile.ts';
import { RealtimeGateway } from './realtime.ts';
import { ContextService } from './services.ts';
import { MembershipService } from './users.ts';

export interface AppDeps {
  config: AppConfig;
  logs: LogSink;
}

export async function createApp({ config, logs }: AppDeps) {
  assertConfig(config, config.secureCookies);
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  const tenantDb = createTenantDb(pool);
  const audit = new AuditService(pool, tenantDb, config.auditHmacKey);
  const auth = createAuth({ config, pool, audit, logs });
  const resolver = new PrincipalResolver(auth, pool, tenantDb, config);
  const plain = drizzle({ client: pool });

  const services = {
    contexts: new ContextService(pool, tenantDb),
    invitations: new InvitationService(tenantDb, auth, audit, config),
    memberships: new MembershipService(pool, tenantDb, resolver, audit, auth, config),
    profile: new ProfileService(pool, tenantDb, auth, audit, config),
    locations: new LocationService(tenantDb, audit),
    notifications: new NotificationService(tenantDb),
    catalog: new CatalogService(tenantDb, audit),
  };
  const emailOf = async (userId: string) =>
    (await plain.select({ email: userTable.email }).from(userTable).where(eq(userTable.id, userId)))[0]?.email ?? null;

  const adapter = new FastifyAdapter({
    trustProxy: config.trustProxy,
    logger: {
      level: 'info',
      redact: LOG_REDACT_PATHS,
      stream: {
        write: (line: string) => {
          logs.write({ source: 'fastify', level: 'info', message: line });
        },
      },
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(createApiModule({ emailOf, audit, idleTimeoutSeconds: config.idleTimeoutSeconds, ...services }), adapter, {
    logger: false,
  });
  const fastify = app.getHttpAdapter().getInstance();

  fastify.decorateRequest('principal', null);

  // Identificación en todas las rutas, incluidas las de Better Auth.
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0] ?? '';
    const isAuthRoute = path.startsWith('/api/auth/');
    const resolution = await resolver.resolve(toHeaders(request.headers), hasSessionCookie(request.headers.cookie));
    if (!resolution.ok) {
      // Better Auth gestiona por sí mismo una cookie vencida (p. ej. al iniciar sesión).
      if (isAuthRoute) return;
      return reply.status(resolution.status).send({ code: resolution.code });
    }
    for (const cookie of resolution.setCookies) void reply.header('set-cookie', cookie);
    request.principal = resolution.principal;
    const principal = resolution.principal;
    // MFA por rol (ADR 0021, 0023): la regla vive aquí, no en el plugin.
    if (principal?.mfaRequired && !principal.twoFactorEnabled && !isMfaEnrollmentPath(path)) {
      return reply.status(403).send({ code: 'mfa_enrollment_required' });
    }
  });

  // Inscripción del MFA, una a la vez por persona: Better Auth 1.7.7 busca si
  // ya hay una y, si no, la crea; dos peticiones a la vez (React monta dos
  // veces la pantalla en desarrollo) creaban dos registros con secretos
  // distintos y ningún código era válido. Con una sola instancia de la API
  // (entorno B) basta este turno; la base de datos además impide un segundo
  // registro por persona (índice único en auth.two_factor.user_id).
  const enrollTurns = new Map<string, Promise<unknown>>();
  const oneEnrollmentAtATime = async <T>(userId: string, work: () => Promise<T>): Promise<T> => {
    const previous = enrollTurns.get(userId) ?? Promise.resolve();
    const turn = previous.catch(() => undefined).then(work);
    enrollTurns.set(userId, turn);
    try {
      return await turn;
    } finally {
      if (enrollTurns.get(userId) === turn) enrollTurns.delete(userId);
    }
  };

  // Better Auth montado como en su integración oficial con Fastify.
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, config.baseURL);
      const headers = toHeaders(request.headers);
      // IP e id de petición los pone el servidor; nunca los que envíe el cliente.
      headers.set(CLIENT_IP_HEADER, request.ip);
      headers.set(REQUEST_ID_HEADER, request.id);
      const call = () =>
        auth.handler(
          new Request(url, {
            method: request.method,
            headers,
            ...(request.body ? { body: JSON.stringify(request.body) } : {}),
          }),
        );
      const userId = request.principal?.userId;
      const response = url.pathname === '/api/auth/two-factor/enable' && userId ? await oneEnrollmentAtATime(userId, call) : await call();
      // Fail-closed (T-008): si no se pudo auditar, ni la respuesta ni sus cookies salen.
      if (auth.consumeAuditFailure(request.id)) return reply.status(503).send({ code: 'audit_unavailable' });
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

  // Todo bajo /api (mismo origen que la web: proxy de Vite en local, Caddy en B).
  app.setGlobalPrefix('api');
  app.useGlobalGuards(new PermissionGuard(app.get(Reflector)));
  app.useGlobalFilters(new ErrorFilter());
  await app.init();

  // Tiempo real (T-009): Socket.IO sobre el mismo servidor HTTP, en /api/socket.io.
  const realtime = new RealtimeGateway(app.getHttpServer(), { resolver, config, logs });
  await realtime.start();

  return {
    app,
    fastify,
    auth,
    pool,
    services,
    resolver,
    realtime,
    async close() {
      await realtime.close();
      await app.close();
      await pool.end();
    },
  };
}

export type ClinicApp = Awaited<ReturnType<typeof createApp>>;
