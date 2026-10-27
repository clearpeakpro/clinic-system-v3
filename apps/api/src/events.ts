import { EventEmitter } from 'node:events';

export interface RevocationEvents {
  /** El usuario quedó desactivado: cerrar todo. */
  userRevoked: [userId: string];
  /** El usuario perdió su membresía en una organización. */
  membershipRevoked: [userId: string, organizationId: string];
}

/**
 * Bus de revocaciones dentro del proceso. En producción, con varios procesos,
 * esto pasaría por Postgres LISTEN/NOTIFY; la revalidación periódica de los
 * sockets cubre mientras tanto el caso de otro proceso.
 */
export class RevocationBus extends EventEmitter<RevocationEvents> {}
