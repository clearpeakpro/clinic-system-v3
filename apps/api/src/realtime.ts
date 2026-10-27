import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { RevocationBus } from './events.ts';
import type { PersonPrincipal, PrincipalResolver } from './principal.ts';
import { parseCookies, toHeaders } from './request-context.ts';

interface SocketData {
  principal: PersonPrincipal;
}

/**
 * WebSocket mínimo para el criterio 5. Solo personas con sesión válida (y MFA
 * si su rol lo exige). Salas org:<id>:loc:<id>; los eventos llevarían solo ids.
 */
export function attachRealtime(
  server: HttpServer,
  resolver: PrincipalResolver,
  bus: RevocationBus,
  revalidateMs: number,
) {
  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(server, {
    serveClient: false,
  });

  const authenticate = async (socket: Socket): Promise<PersonPrincipal | null> => {
    const headers = socket.request.headers;
    const result = await resolver.resolve(toHeaders(headers), parseCookies(headers.cookie));
    if (!result.ok || result.principal?.kind !== 'person') return null;
    const principal = result.principal;
    if (principal.mfaRequired && !principal.twoFactorEnabled) return null;
    return principal;
  };

  io.use((socket, next) => {
    authenticate(socket).then(
      (principal) => {
        if (!principal) {
          next(new Error('unauthorized'));
          return;
        }
        socket.data.principal = principal;
        next();
      },
      (error: unknown) => {
        next(error instanceof Error ? error : new Error('unauthorized'));
      },
    );
  });

  io.on('connection', (socket) => {
    const { principal } = socket.data;
    void socket.join(`user:${principal.userId}`);
    if (principal.context) {
      void socket.join(`org:${principal.context.organizationId}:loc:${principal.context.locationId}`);
    }
  });

  const onUserRevoked = (userId: string) => {
    io.in(`user:${userId}`).disconnectSockets(true);
  };
  const onMembershipRevoked = (userId: string, organizationId: string) => {
    void io
      .in(`user:${userId}`)
      .fetchSockets()
      .then((sockets) => {
        for (const socket of sockets) {
          if (socket.data.principal.context?.organizationId === organizationId) socket.disconnect(true);
        }
      });
  };
  bus.on('userRevoked', onUserRevoked);
  bus.on('membershipRevoked', onMembershipRevoked);

  // Respaldo: revalidar cada socket por si la revocación ocurrió en otro proceso.
  let closed = false;
  const timer = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) {
      void authenticate(socket).then((principal) => {
        if (closed) return;
        const before = socket.data.principal.context;
        const lost =
          !principal ||
          (before !== null &&
            (principal.context?.organizationId !== before.organizationId ||
              principal.context.locationId !== before.locationId));
        if (lost) socket.disconnect(true);
      }, () => {
        // Si no se puede revalidar, se cierra (falla en modo seguro).
        if (!closed) socket.disconnect(true);
      });
    }
  }, revalidateMs);
  timer.unref();

  return {
    io,
    /** No cierra el servidor HTTP: eso lo hace Nest al cerrar la app. */
    close() {
      closed = true;
      clearInterval(timer);
      bus.off('userRevoked', onUserRevoked);
      bus.off('membershipRevoked', onMembershipRevoked);
      io.disconnectSockets(true);
      io.engine.close();
    },
  };
}
