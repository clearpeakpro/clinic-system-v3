import type { Server as HttpServer } from 'node:http';
import { parseRealtimeMessage, REALTIME_CHANNEL, type RealtimeMessage } from '@clinic/db';
import pg from 'pg';
import { Server, type Socket } from 'socket.io';
import type { AppConfig } from './config.ts';
import type { LogSink } from './logging.ts';
import type { PrincipalResolver } from './principal.ts';
import { hasSessionCookie, toHeaders } from './request-context.ts';

// Tiempo real (T-009; ADR 0002, 0023). Socket.IO sobre el servidor de la API,
// en el mismo origen que la web (/api/socket.io). Reglas:
//  - Al conectar (también al reconectar) se valida la sesión, la membresía y
//    la sede activa con el mismo PrincipalResolver que las peticiones HTTP.
//  - Salas: org:<id>:loc:<id> (eventos de pantalla) y org:<id>:user:<id>
//    (avisos de la persona). Los eventos solo llevan ids y estados.
//  - Revocación: toda sesión borrada avisa por LISTEN/NOTIFY (trigger de
//    auth.session) y sus sockets se cierran al instante. Además, cada socket
//    se revalida periódicamente, sin renovar la sesión.
//  - Sin la conexión LISTEN la API no se enteraría de una revocación: cierra
//    los sockets y rechaza los nuevos hasta recuperarla (la web pasa a modo
//    degradado y refresca la pantalla cada 30 s).

export const SOCKET_PATH = '/api/socket.io';

export const locationRoom = (organizationId: string, locationId: string) => `org:${organizationId}:loc:${locationId}`;
export const userRoom = (organizationId: string, userId: string) => `org:${organizationId}:user:${userId}`;

/** Motivo con que el servidor cierra un socket (evento `ended`). */
export type EndReason = 'session_ended' | 'context_changed' | 'realtime_unavailable';

interface SocketData {
  sessionId: string;
  userId: string;
  organizationId: string;
  locationId: string;
  /** Solo la cookie, en memoria, para revalidar. Nunca se registra. */
  cookie: string;
}

/** Lo único que envía el servidor: motivos e ids, nunca datos de pacientes. */
export interface ServerToClientEvents {
  ended: (payload: { reason: EndReason }) => void;
  /** Cambió la bandeja de la persona: la web vuelve a leerla. */
  notifications: () => void;
  event: (payload: { name: string; ids: Record<string, string> }) => void;
}

type NoEvents = Record<string, never>;
type ClinicServer = Server<NoEvents, ServerToClientEvents, NoEvents, SocketData>;
type ClinicSocket = Socket<NoEvents, ServerToClientEvents, NoEvents, SocketData>;

export class RealtimeGateway {
  readonly #resolver: PrincipalResolver;
  readonly #config: AppConfig;
  readonly #logs: LogSink;
  readonly #origins: Set<string>;
  readonly #io: ClinicServer;
  readonly #bySession = new Map<string, Set<ClinicSocket>>();
  #listener: pg.Client | null = null;
  #available = false;
  #closed = false;
  #reconnectDelayMs = 1000;
  #reconnectTimer: NodeJS.Timeout | null = null;
  readonly #revalidateTimer: NodeJS.Timeout;

  constructor(httpServer: HttpServer, deps: { resolver: PrincipalResolver; config: AppConfig; logs: LogSink }) {
    this.#resolver = deps.resolver;
    this.#config = deps.config;
    this.#logs = deps.logs;
    this.#origins = new Set([new URL(deps.config.baseURL).origin, ...deps.config.trustedOrigins]);
    // Solo WebSocket: el navegador siempre envía Origin y no hay sondeo HTTP.
    this.#io = new Server<NoEvents, ServerToClientEvents, NoEvents, SocketData>(httpServer, { path: SOCKET_PATH, transports: ['websocket'], serveClient: false });
    this.#io.use((socket, next) => {
      this.#authenticate(socket).then(
        (error) => {
          next(error ? new Error(error) : undefined);
        },
        () => {
          next(new Error('unavailable'));
        },
      );
    });
    this.#io.on('connection', (socket) => {
      const { sessionId, organizationId, locationId, userId } = socket.data;
      void socket.join([locationRoom(organizationId, locationId), userRoom(organizationId, userId)]);
      const set = this.#bySession.get(sessionId) ?? new Set<ClinicSocket>();
      set.add(socket);
      this.#bySession.set(sessionId, set);
      socket.on('disconnect', () => {
        set.delete(socket);
        if (set.size === 0) this.#bySession.delete(sessionId);
      });
    });
    this.#revalidateTimer = setInterval(() => {
      void this.revalidateAll();
    }, deps.config.realtimeRevalidateSeconds * 1000);
  }

  /** Abre la conexión LISTEN. Hasta entonces se rechazan los sockets. */
  async start(): Promise<void> {
    await this.#connectListener();
  }

  /** ¿Está escuchando el canal? Sin él, no se aceptan sockets. */
  get available(): boolean {
    return this.#available;
  }

  /** Solo pruebas: pid de la conexión LISTEN, para cortarla. */
  get listenerPid(): number | null {
    return (this.#listener as unknown as { processID?: number } | null)?.processID ?? null;
  }

  /** Solo pruebas: sockets abiertos. */
  get socketCount(): number {
    return this.#io.of('/').sockets.size;
  }

  async revalidateAll(filter: (data: SocketData) => boolean = () => true): Promise<void> {
    const sockets = [...this.#io.of('/').sockets.values()];
    await Promise.all(sockets.filter((s) => filter(s.data)).map((s) => this.#revalidate(s)));
  }

  async close(): Promise<void> {
    this.#closed = true;
    clearInterval(this.#revalidateTimer);
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#io.disconnectSockets(true);
    // Socket.IO cerraría también el servidor HTTP: eso lo hace Nest.
    this.#io.engine.close();
    const listener = this.#listener;
    this.#listener = null;
    await listener?.end().catch(() => undefined);
  }

  /** Devuelve un código de error o null si el socket puede conectarse. */
  async #authenticate(socket: ClinicSocket): Promise<string | null> {
    if (!this.#available) return 'realtime_unavailable';
    const { origin, cookie } = socket.handshake.headers;
    if (!origin || !this.#origins.has(origin)) return 'forbidden_origin';
    if (!cookie || !hasSessionCookie(cookie)) return 'unauthenticated';
    const resolution = await this.#resolver.resolve(toHeaders({ cookie }), true, { refresh: false });
    if (!resolution.ok || !resolution.principal) return 'unauthenticated';
    const principal = resolution.principal;
    if (principal.mfaRequired && !principal.twoFactorEnabled) return 'mfa_enrollment_required';
    if (!principal.context) return 'no_active_context';
    socket.data = {
      sessionId: principal.sessionId,
      userId: principal.userId,
      organizationId: principal.context.organizationId,
      locationId: principal.context.locationId,
      cookie,
    };
    return null;
  }

  async #revalidate(socket: ClinicSocket): Promise<void> {
    if (!socket.connected) return;
    let reason: EndReason | null = null;
    try {
      const resolution = await this.#resolver.resolve(toHeaders({ cookie: socket.data.cookie }), true, { refresh: false });
      const principal = resolution.ok ? resolution.principal : null;
      if (!principal || principal.sessionId !== socket.data.sessionId) reason = 'session_ended';
      else if (principal.mfaRequired && !principal.twoFactorEnabled) reason = 'session_ended';
      else if (
        principal.context?.organizationId !== socket.data.organizationId ||
        principal.context.locationId !== socket.data.locationId
      ) {
        reason = 'context_changed';
      }
    } catch {
      // Sin poder comprobarlo, el socket no sigue abierto.
      reason = 'realtime_unavailable';
    }
    if (reason) this.#end(socket, reason);
  }

  #end(socket: ClinicSocket, reason: EndReason): void {
    socket.emit('ended', { reason });
    socket.disconnect(true);
  }

  #dispatch(message: RealtimeMessage): void {
    switch (message.t) {
      case 'session_revoked':
        for (const socket of this.#bySession.get(message.session) ?? []) this.#end(socket, 'session_ended');
        break;
      case 'revalidate':
        void this.revalidateAll((d) => d.organizationId === message.org && (message.user === undefined || d.userId === message.user));
        break;
      case 'notifications':
        this.#io.to(userRoom(message.org, message.user)).emit('notifications');
        break;
      case 'event':
        this.#io.to(locationRoom(message.org, message.loc)).emit('event', { name: message.name, ids: message.ids });
        break;
    }
  }

  async #connectListener(): Promise<void> {
    const listener = new pg.Client({ connectionString: this.#config.databaseUrl });
    const lost = () => {
      this.#onListenerLost(listener);
    };
    listener.on('error', lost);
    listener.on('end', lost);
    listener.on('notification', (n) => {
      if (n.channel !== REALTIME_CHANNEL) return;
      const message = parseRealtimeMessage(n.payload);
      if (message) this.#dispatch(message);
    });
    try {
      await listener.connect();
      await listener.query(`LISTEN ${REALTIME_CHANNEL}`);
    } catch (error) {
      await listener.end().catch(() => undefined);
      throw error;
    }
    if (this.#closed) {
      await listener.end();
      return;
    }
    this.#listener = listener;
    this.#available = true;
    this.#reconnectDelayMs = 1000;
  }

  #onListenerLost(listener: pg.Client): void {
    if (this.#closed || this.#listener !== listener) return;
    this.#listener = null;
    this.#available = false;
    this.#logs.write({ source: 'realtime', level: 'error', message: 'LISTEN del tiempo real perdido; sockets cerrados' });
    for (const socket of this.#io.of('/').sockets.values()) this.#end(socket, 'realtime_unavailable');
    listener.end().catch(() => undefined);
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (this.#closed) return;
    const delay = this.#reconnectDelayMs;
    this.#reconnectDelayMs = Math.min(this.#reconnectDelayMs * 2, 30_000);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connectListener().then(
        () => {
          this.#logs.write({ source: 'realtime', level: 'info', message: 'LISTEN del tiempo real recuperado' });
        },
        () => {
          this.#scheduleReconnect();
        },
      );
    }, delay);
  }
}
