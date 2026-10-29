import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../lib/api.ts';
import { BellButton, DEGRADED_TEXT, DegradedBannerView, LiveIndicatorView, NotificationList } from './realtime.tsx';

// S-GEN-14, 15 y 19 (T-009): textos del manual y semántica para lectores.

const item = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 'n',
  kind: 'appointment.changed',
  code: null,
  locationId: null,
  entityType: null,
  entityId: null,
  createdAt: '2026-10-29T14:55:00Z',
  read: false,
  ...over,
});
const NOW = Date.parse('2026-10-29T15:00:00Z');

afterEach(cleanup);

describe('indicador en vivo', () => {
  it('icono + texto y etiqueta «Actualizaciones en vivo: …»', () => {
    for (const [status, label] of [
      ['connected', 'En vivo'],
      ['connecting', 'Reconectando…'],
      ['disconnected', 'Sin conexión'],
    ] as const) {
      const { unmount } = render(<LiveIndicatorView status={status} />);
      expect(screen.getByRole('status')).toHaveTextContent(`Actualizaciones en vivo: ${label}`);
      expect(screen.getByRole('status')).toHaveAttribute('title', label);
      unmount();
    }
  });
});

describe('banner de modo degradado', () => {
  it('texto del manual, sin «Modo contingencia», y «Ocultar aviso»', async () => {
    const onHide = vi.fn();
    render(<DegradedBannerView onHide={onHide} />);
    expect(screen.getByRole('status')).toHaveTextContent(DEGRADED_TEXT);
    expect(screen.queryByText(/contingencia/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar aviso' }));
    expect(onHide).toHaveBeenCalled();
  });
});

describe('centro de notificaciones', () => {
  it('campana con el número de no leídas', () => {
    const { rerender } = render(<BellButton unread={0} />);
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
    rerender(<BellButton unread={3} />);
    expect(screen.getByRole('button', { name: 'Notificaciones, 3 sin leer' })).toHaveTextContent('3');
    rerender(<BellButton unread={120} />);
    expect(screen.getByRole('button', { name: 'Notificaciones, 120 sin leer' })).toHaveTextContent('99+');
  });

  it('título, código y antigüedad; las no leídas se marcan; tocar abre', async () => {
    const onOpen = vi.fn();
    const rows = [
      item({ id: 'a', kind: 'encounter.provider_assigned', code: 'NOR1-V-000123' }),
      item({ id: 'b', kind: 'order.changed', read: true, createdAt: '2026-10-27T15:00:00Z' }),
    ];
    render(<NotificationList rows={rows} now={NOW} onOpen={onOpen} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Paciente asignado a usted');
    expect(buttons[0]).toHaveTextContent('Visita NOR1-V-000123 · hace 5 min');
    expect(buttons[0]).toHaveTextContent('Sin leer');
    expect(buttons[1]).toHaveTextContent('Orden asignada actualizada');
    expect(buttons[1]).toHaveTextContent('Una orden asignada a usted · hace 2 d');
    expect(buttons[1]).not.toHaveTextContent('Sin leer');
    await userEvent.click(buttons[0] as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(rows[0]);
  });

  it('vacío: «Está al día»', () => {
    render(<NotificationList rows={[]} now={NOW} onOpen={vi.fn()} />);
    expect(screen.getByText('Está al día')).toBeInTheDocument();
    expect(screen.getByText('Las asignaciones y alertas para usted aparecerán aquí.')).toBeInTheDocument();
  });
});
