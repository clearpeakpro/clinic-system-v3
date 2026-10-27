import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import type { Principal } from './principal.ts';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
    clientIp: string | null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) result[name] = decodeURIComponent(value);
  }
  return result;
}

export function toHeaders(headers: IncomingHttpHeaders): Headers {
  return fromNodeHeaders(headers);
}

/** Rutas a las que llega una persona con rol que exige MFA y aún no lo inscribió. */
export function isMfaEnrollmentPath(path: string): boolean {
  return (
    path.startsWith('/api/auth/sign-in/') ||
    path === '/api/auth/sign-out' ||
    path === '/api/auth/get-session' ||
    path.startsWith('/api/auth/two-factor/')
  );
}
