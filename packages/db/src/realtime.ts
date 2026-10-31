import { sql } from 'drizzle-orm';
import type { Tx } from './with-tenant.ts';

// Canal de tiempo real (T-009): LISTEN/NOTIFY entre la base de datos, el
// worker y la API, que reenvía cada aviso a sus sockets. Los mensajes solo
// llevan ids y estados, nunca datos de pacientes (ADR 0002). Como el aviso
// sale al confirmarse la transacción, también sirve con varias instancias de
// la API (ADR 0023).

export const REALTIME_CHANNEL = 'clinic_realtime';

export type RealtimeMessage =
  /** Sesión borrada (trigger de auth.session): se cierran sus sockets. */
  | { t: 'session_revoked'; session: string }
  /** Revalidar ya los sockets de una persona, o de toda la organización si no hay `user`. */
  | { t: 'revalidate'; org: string; user?: string }
  /** Cambió la bandeja de una persona (aviso nuevo, leído o borrado). */
  | { t: 'notifications'; org: string; user: string }
  /** Evento de pantalla para la sala de una sede: nombre, ids y, si aplica, el estado nuevo (T-015). */
  | { t: 'event'; org: string; loc: string; name: string; ids: Record<string, string>; status?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);
/** Un estado es una constante como `CONFIRMED`: nunca texto libre. */
const STATUS_RE = /^[A-Z][A-Z_]{0,31}$/;

/** Valida un mensaje recibido; descarta lo que no tenga la forma esperada. */
export function parseRealtimeMessage(raw: string | undefined): RealtimeMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? '');
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case 'session_revoked':
      return isId(m.session) ? { t: 'session_revoked', session: m.session } : null;
    case 'revalidate':
      if (!isId(m.org) || (m.user !== undefined && !isId(m.user))) return null;
      return m.user === undefined ? { t: 'revalidate', org: m.org } : { t: 'revalidate', org: m.org, user: m.user };
    case 'notifications':
      return isId(m.org) && isId(m.user) ? { t: 'notifications', org: m.org, user: m.user } : null;
    case 'event': {
      if (!isId(m.org) || !isId(m.loc) || typeof m.name !== 'string' || typeof m.ids !== 'object' || m.ids === null) return null;
      const ids = m.ids as Record<string, unknown>;
      if (!Object.values(ids).every(isId)) return null;
      const event = { t: 'event' as const, org: m.org, loc: m.loc, name: m.name, ids: ids as Record<string, string> };
      if (m.status === undefined) return event;
      return typeof m.status === 'string' && STATUS_RE.test(m.status) ? { ...event, status: m.status } : null;
    }
    default:
      return null;
  }
}

/** Publica un mensaje al confirmarse la transacción `tx`. */
export async function notifyRealtime(tx: Tx, message: RealtimeMessage): Promise<void> {
  await tx.execute(sql`select pg_notify(${REALTIME_CHANNEL}, ${JSON.stringify(message)})`);
}
