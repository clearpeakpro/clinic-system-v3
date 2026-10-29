import { io, type Socket } from 'socket.io-client';

// Conexión en vivo (S-GEN-14, S-GEN-19; T-009). Un WebSocket por pestaña con
// la sede activa; el servidor valida la sesión y la sede al conectar y cada
// 30 s, y lo cierra al revocar la sesión. Solo llegan avisos sin datos («la
// bandeja cambió», «evento de pantalla»): la web vuelve a leer por HTTP.
//  - Reconexión con espera creciente y aleatoria de 1 s a 30 s; el contador se
//    reinicia tras 60 s estables. Tras reconectar se vuelve a leer la pantalla.
//  - Mientras no hay conexión (modo degradado), la pantalla se refresca cada 30 s
//    y se muestra el banner de S-GEN-19, que se puede ocultar hasta la
//    siguiente desconexión.

export type LiveStatus = 'connected' | 'connecting' | 'disconnected';

export interface LiveState {
  status: LiveStatus;
  /** Se perdió la conexión (o no se pudo abrir) y aún no se recuperó. */
  degraded: boolean;
  /** «Ocultar aviso» en esta desconexión. */
  bannerHidden: boolean;
}

export interface RealtimeHandlers {
  /** Volver a leer la pantalla visible (tras reconectar y cada 30 s sin conexión). */
  resync: () => void;
  /** La sesión terminó o cambió su sede: volver a leer /me (el marco decide). */
  sessionChanged: () => void;
  /** Cambió la bandeja de notificaciones de la persona. */
  notifications: () => void;
}

/** Lo que se usa del socket (el de socket.io-client o uno de prueba). */
export interface LiveSocket {
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeAllListeners(): unknown;
  disconnect(): unknown;
  /** Cierre del transporte: el único aviso si se cierra antes de terminar de conectar. */
  onTransportClose?(listener: () => void): unknown;
}

export const RESYNC_MS = 30_000;
export const STABLE_MS = 60_000;
/**
 * Tras «sesión terminada», se vuelve a intentar al cabo de este tiempo en vez
 * de dar la sesión por cerrada: Better Auth cambia la sesión de la persona en
 * algunas operaciones (p. ej. al activar el MFA) y borra la anterior; la
 * cookie nueva llega en esa misma respuesta. Si de verdad terminó, el servidor
 * rechaza la conexión («unauthenticated») y el marco lleva al acceso.
 */
export const SESSION_RECHECK_MS = 1000;

/** Espera antes del intento `attempt` (0, 1, 2…): exponencial con variación, de 1 s a 30 s. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return Math.max(1000, Math.round(base * (0.5 + random() * 0.5)));
}

/** Sin respuesta en este tiempo, el intento cuenta como fallido. */
export const CONNECT_TIMEOUT_MS = 10_000;

function openSocket(): LiveSocket {
  // forceNew: cada intento con su propia conexión (sin reutilizar la anterior).
  const socket: Socket = io({ path: '/api/socket.io', transports: ['websocket'], reconnection: false, forceNew: true, timeout: CONNECT_TIMEOUT_MS });
  return Object.assign(socket, {
    onTransportClose: (listener: () => void) => socket.io.engine.on('close', listener),
  });
}

/** Códigos con que el servidor rechaza la conexión que dependen de la sesión. */
const SESSION_CODES = new Set(['unauthenticated', 'no_active_context', 'mfa_enrollment_required']);

export class RealtimeClient {
  readonly #handlers: RealtimeHandlers;
  readonly #factory: () => LiveSocket;
  readonly #listeners = new Set<() => void>();
  #state: LiveState = { status: 'disconnected', degraded: false, bannerHidden: false };
  #socket: LiveSocket | null = null;
  #key: string | null = null;
  #attempt = 0;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #stableTimer: ReturnType<typeof setTimeout> | null = null;
  #resyncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(handlers: RealtimeHandlers, factory: () => LiveSocket = openSocket) {
    this.#handlers = handlers;
    this.#factory = factory;
  }

  readonly getState = (): LiveState => this.#state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Conecta para la sede activa (`key`); si ya lo está, no hace nada. */
  start(key: string): void {
    if (this.#key === key) return;
    this.stop();
    this.#key = key;
    this.#open();
  }

  /** Al cerrar sesión o cuando el servidor da la sesión por terminada. */
  stop(): void {
    this.#key = null;
    this.#drop();
    this.#clearRetry();
    this.#stopResync();
    this.#attempt = 0;
    this.#set({ status: 'disconnected', degraded: false, bannerHidden: false });
  }

  /** «Ocultar aviso»: hasta la siguiente desconexión. */
  hideBanner(): void {
    this.#set({ ...this.#state, bannerHidden: true });
  }

  #set(state: LiveState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }

  #open(): void {
    this.#set({ ...this.#state, status: 'connecting' });
    const socket = this.#factory();
    this.#socket = socket;
    socket.on('connect', () => {
      const recovered = this.#state.degraded;
      this.#stopResync();
      this.#set({ status: 'connected', degraded: false, bannerHidden: false });
      this.#stableTimer = setTimeout(() => {
        this.#attempt = 0;
      }, STABLE_MS);
      if (recovered) this.#handlers.resync();
    });
    socket.on('connect_error', (error: Error) => {
      if (SESSION_CODES.has(error.message)) this.#handlers.sessionChanged();
      // Sin sesión no es un fallo de la conexión en vivo: sin modo degradado.
      // Si terminó, el marco lleva al acceso y detiene la conexión.
      if (error.message === 'unauthenticated') this.#retryLater(retryDelayMs(this.#attempt++));
      else this.#lost();
    });
    socket.on('ended', (payload: { reason?: string } | undefined) => {
      const reason = payload?.reason;
      if (reason === 'session_ended') {
        this.#retryLater(SESSION_RECHECK_MS);
      } else if (reason === 'context_changed') {
        // Otra pestaña cambió de sede o perdió la actual: el marco decide.
        this.#drop();
        this.#handlers.sessionChanged();
        this.#open();
      } else {
        this.#lost();
      }
    });
    socket.on('disconnect', () => {
      if (socket === this.#socket) this.#lost();
    });
    socket.on('notifications', () => {
      this.#handlers.notifications();
    });
    // Cerrada antes de terminar de conectar sin «connect_error». Se espera una
    // vuelta: al rechazar la conexión, socket.io-client cierra el transporte
    // justo antes de emitir «connect_error» con el código del servidor.
    socket.onTransportClose?.(() => {
      setTimeout(() => {
        if (socket === this.#socket && this.#state.status === 'connecting') this.#lost();
      }, 0);
    });
  }

  /** Suelta el socket actual sin reaccionar a su cierre. */
  #drop(): void {
    const socket = this.#socket;
    this.#socket = null;
    if (this.#stableTimer) clearTimeout(this.#stableTimer);
    this.#stableTimer = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
  }

  #lost(): void {
    this.#drop();
    if (this.#key === null) return;
    this.#set({ ...this.#state, status: 'disconnected', degraded: true });
    this.#resyncTimer ??= setInterval(() => {
      this.#handlers.resync();
    }, RESYNC_MS);
    this.#clearRetry();
    const delay = retryDelayMs(this.#attempt);
    this.#attempt += 1;
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      if (this.#key !== null) this.#open();
    }, delay);
  }

  /** Vuelve a conectar más tarde sin pasar a modo degradado. */
  #retryLater(delay: number): void {
    this.#drop();
    if (this.#key === null) return;
    this.#set({ ...this.#state, status: 'disconnected' });
    this.#clearRetry();
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      if (this.#key !== null) this.#open();
    }, delay);
  }

  #clearRetry(): void {
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  #stopResync(): void {
    if (this.#resyncTimer) clearInterval(this.#resyncTimer);
    this.#resyncTimer = null;
  }
}
