import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeClient, RESYNC_MS, retryDelayMs, type LiveSocket } from './realtime.ts';

// S-GEN-14 y S-GEN-19 (T-009): estados del indicador, reconexión y modo degradado.

class FakeSocket implements LiveSocket {
  readonly handlers = new Map<string, (...args: never[]) => void>();
  disconnected = false;
  on(event: string, listener: (...args: never[]) => void) {
    this.handlers.set(event, listener);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  disconnect() {
    this.disconnected = true;
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    (this.handlers.get(event) as ((...a: unknown[]) => void) | undefined)?.(...args);
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const handlers = { resync: vi.fn(), sessionChanged: vi.fn(), notifications: vi.fn() };
  const client = new RealtimeClient(handlers, () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  const last = () => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('sin socket');
    return socket;
  };
  return { client, handlers, sockets, last };
}

describe('conexión en vivo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Sin variación: el primer reintento es a 1 s, el segundo a 2 s…
    vi.spyOn(Math, 'random').mockReturnValue(1);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('espera de 1 s a 30 s, creciente y con variación', () => {
    expect(retryDelayMs(0, () => 0)).toBe(1000);
    expect(retryDelayMs(0, () => 1)).toBe(1000);
    expect(retryDelayMs(3, () => 1)).toBe(8000);
    expect(retryDelayMs(3, () => 0)).toBe(4000);
    expect(retryDelayMs(10, () => 1)).toBe(30_000);
    expect(retryDelayMs(10, () => 0)).toBe(15_000);
  });

  it('conectando → en vivo; los avisos de la bandeja se reenvían', () => {
    const { client, handlers, last } = setup();
    client.start('org:loc');
    expect(client.getState()).toEqual({ status: 'connecting', degraded: false, bannerHidden: false });
    last().emit('connect');
    expect(client.getState()).toEqual({ status: 'connected', degraded: false, bannerHidden: false });
    expect(handlers.resync).not.toHaveBeenCalled();
    last().emit('notifications');
    expect(handlers.notifications).toHaveBeenCalledTimes(1);
    // La misma sede no abre otro socket.
    client.start('org:loc');
    expect(last().disconnected).toBe(false);
  });

  it('al caerse: sin conexión, modo degradado, refresco cada 30 s y reintentos; al volver, relee la pantalla', () => {
    const { client, handlers, sockets, last } = setup();
    client.start('org:loc');
    last().emit('connect');
    last().emit('disconnect', 'transport close');
    expect(client.getState()).toMatchObject({ status: 'disconnected', degraded: true });

    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    expect(client.getState()).toMatchObject({ status: 'connecting', degraded: true });
    last().emit('connect_error', new Error('realtime_unavailable'));
    expect(client.getState()).toMatchObject({ status: 'disconnected', degraded: true });

    // Segundo reintento a 2 s; mientras, la pantalla se refresca a los 30 s.
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(3);
    last().emit('connect_error', new Error('realtime_unavailable'));
    vi.advanceTimersByTime(RESYNC_MS);
    const resyncs = handlers.resync.mock.calls.length;
    expect(resyncs).toBeGreaterThanOrEqual(1);

    last().emit('connect');
    expect(client.getState()).toEqual({ status: 'connected', degraded: false, bannerHidden: false });
    expect(handlers.resync.mock.calls.length).toBe(resyncs + 1);
    // Conectado ya no refresca cada 30 s.
    vi.advanceTimersByTime(RESYNC_MS * 2);
    expect(handlers.resync.mock.calls.length).toBe(resyncs + 1);
  });

  it('«Ocultar aviso» dura hasta la siguiente desconexión', () => {
    const { client, last } = setup();
    client.start('org:loc');
    last().emit('connect');
    last().emit('disconnect', 'transport close');
    client.hideBanner();
    expect(client.getState()).toMatchObject({ degraded: true, bannerHidden: true });
    vi.advanceTimersByTime(1000);
    last().emit('connect');
    last().emit('disconnect', 'transport close');
    expect(client.getState()).toMatchObject({ degraded: true, bannerHidden: false });
  });

  it('sesión terminada: se detiene, sin modo degradado, y avisa al marco', () => {
    const { client, handlers, sockets, last } = setup();
    client.start('org:loc');
    last().emit('connect');
    last().emit('ended', { reason: 'session_ended' });
    expect(handlers.sessionChanged).toHaveBeenCalledTimes(1);
    expect(client.getState()).toEqual({ status: 'disconnected', degraded: false, bannerHidden: false });
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);

    client.start('org:loc');
    last().emit('connect_error', new Error('unauthenticated'));
    expect(handlers.sessionChanged).toHaveBeenCalledTimes(2);
    expect(client.getState().degraded).toBe(false);
  });

  it('cambio de sede en otra pestaña: avisa al marco y reconecta enseguida', () => {
    const { client, handlers, sockets, last } = setup();
    client.start('org:loc');
    last().emit('connect');
    last().emit('ended', { reason: 'context_changed' });
    expect(handlers.sessionChanged).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(2);
    expect(sockets[0]?.disconnected).toBe(true);
  });

  it('cambiar de sede cierra el socket anterior; cerrar sesión lo detiene todo', () => {
    const { client, sockets } = setup();
    client.start('org:a');
    client.start('org:b');
    expect(sockets[0]?.disconnected).toBe(true);
    client.stop();
    expect(sockets[1]?.disconnected).toBe(true);
    expect(client.getState().status).toBe('disconnected');
  });
});
