import { VISIT_ROUTES, VISIT_STATUS_LABELS, VISIT_STATUSES } from '@clinic/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RouteBadge, VISIT_STATUS_STYLE, VisitStatusChip } from '../src/components/chips.tsx';
import { MoneyField, MoneyText } from '../src/components/data.tsx';
import { ConfirmDialog } from '../src/components/dialogs.tsx';
import { AsyncView } from '../src/components/states.tsx';

describe('chips de estado de la visita', () => {
  it('los 11 estados tienen icono, texto y el tono del DESIGN.md', () => {
    const expected: Record<string, string> = {
      CHECKED_IN: 'registered',
      WAITING_FOR_NURSE: 'waiting',
      WAITING_FOR_PROVIDER: 'waiting',
      PROCEDURE_PENDING: 'waiting',
      WITH_NURSE: 'in-care',
      WITH_PROVIDER: 'in-care',
      READY_FOR_CHECKOUT: 'checkout',
      CHECKOUT: 'checkout',
      COMPLETED: 'completed',
      LEFT_EARLY: 'departed',
      CANCELLED: 'departed',
    };
    expect(VISIT_STATUSES).toHaveLength(11);
    for (const status of VISIT_STATUSES) {
      const { container, unmount } = render(<VisitStatusChip status={status} />);
      const chip = container.firstElementChild;
      expect(chip).toHaveAttribute('data-tone', expected[status]);
      expect(chip).toHaveTextContent(`Estado: ${VISIT_STATUS_LABELS[status]}`);
      expect(chip?.querySelector('svg')).not.toBeNull();
      expect(VISIT_STATUS_STYLE[status].icon).toBeDefined();
      unmount();
    }
  });

  it('«Cancelada» en gris claro con un icono distinto de «Se retiró»', () => {
    expect(VISIT_STATUS_STYLE.CANCELLED.tone).toBe('departed');
    expect(VISIT_STATUS_STYLE.CANCELLED.icon).not.toBe(VISIT_STATUS_STYLE.LEFT_EARLY.icon);
  });

  it('las 4 rutas se anuncian como «Ruta: …»', () => {
    for (const route of VISIT_ROUTES) {
      const { container, unmount } = render(<RouteBadge route={route} />);
      expect(container).toHaveTextContent(/^Ruta: /);
      unmount();
    }
  });
});

describe('ConfirmDialog con motivo', () => {
  it('no confirma con el motivo vacío o en blanco; confirma con el motivo recortado', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        destructive
        title="¿Anular este cargo?"
        confirmLabel="Anular cargo"
        reason={{ label: 'Motivo de la anulación' }}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Anular cargo' });
    await user.click(confirm);
    expect(screen.getByText('Se requiere un motivo.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Motivo de la anulación/), '   ');
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Motivo de la anulación/), 'Cargo duplicado  ');
    expect(screen.queryByText('Se requiere un motivo.')).not.toBeInTheDocument();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Cargo duplicado');
  });

  it('«Cancelar» no confirma', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="¿Seguro?" onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('dinero en pantalla', () => {
  it('el saldo a favor no va en rojo ni en el color de énfasis', () => {
    const { container } = render(<MoneyText cents={-2500} emphasis />);
    expect(container).toHaveTextContent('-$25.00');
    expect(container.firstElementChild?.className).not.toMatch(/error|text-primary/);
  });

  it('el campo entrega centavos y da formato al salir', () => {
    const changes: (number | null)[] = [];
    function Harness() {
      const [text, setText] = useState('');
      return (
        <MoneyField
          label="Monto a cobrar"
          value={text}
          onValueChange={(t, cents) => {
            setText(t);
            changes.push(cents);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('Monto a cobrar');
    fireEvent.change(input, { target: { value: '1234.5' } });
    expect(changes.at(-1)).toBe(123450);
    fireEvent.blur(input);
    expect(input).toHaveValue('1,234.50');
  });

  it('avisa si el importe no es válido al salir del campo', () => {
    function Harness() {
      const [text, setText] = useState('');
      return <MoneyField label="Monto a cobrar" value={text} onValueChange={(t) => { setText(t); }} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText('Monto a cobrar');
    fireEvent.change(input, { target: { value: '12,34' } });
    fireEvent.blur(input);
    expect(screen.getByText('El monto no es válido.')).toBeInTheDocument();
  });
});

describe('AsyncView (S-GEN-28)', () => {
  const base = { error: null, isFetching: false, refetch: () => undefined };

  it('cargando: esqueleto o spinner', () => {
    const { rerender } = render(<AsyncView source={{ ...base, data: undefined }} loading="skeleton">{() => 'datos'}</AsyncView>);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    rerender(<AsyncView source={{ ...base, data: undefined }}>{() => 'datos'}</AsyncView>);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  });

  it('error sin datos y con datos previos', () => {
    const error = { status: 503, code: 'http_503' };
    const { rerender } = render(<AsyncView source={{ ...base, data: undefined, error }}>{() => 'datos'}</AsyncView>);
    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal');
    rerender(<AsyncView source={{ ...base, data: ['a'], error }}>{(d) => d.join()}</AsyncView>);
    expect(screen.getByRole('alert')).toHaveTextContent('no está disponible temporalmente');
    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it('vacío y refrescando', () => {
    const { rerender } = render(<AsyncView source={{ ...base, data: [] as string[] }} isEmpty={(d) => d.length === 0}>{() => 'datos'}</AsyncView>);
    expect(screen.getByText('Aún no hay nada')).toBeInTheDocument();
    rerender(<AsyncView source={{ ...base, data: ['a'], isFetching: true }}>{(d) => d.join()}</AsyncView>);
    expect(screen.getByRole('status')).toHaveTextContent('Actualizando…');
    expect(screen.getByText('a')).toBeInTheDocument();
  });
});
