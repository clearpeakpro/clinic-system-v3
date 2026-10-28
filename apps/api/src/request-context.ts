import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import type { Principal } from './principal.ts';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export function toHeaders(headers: IncomingHttpHeaders): Headers {
  return fromNodeHeaders(headers);
}

/** ¿Trae la petición una cookie de sesión de Better Auth (con o sin prefijo __Secure-)? */
export function hasSessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some((part) => part.split('=')[0]?.trim().endsWith('session_token'));
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
