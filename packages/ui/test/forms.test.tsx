import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip, SegmentedControl } from '../src/components/forms.tsx';
import { SnackbarProvider, useSnackbar } from '../src/components/snackbar.tsx';

// Componentes de T-006a: selección accesible (radio / pressed) y avisos.

describe('SegmentedControl', () => {
  it('es un grupo de radios con un solo seleccionado', async () => {
    function Demo() {
      const [value, setValue] = useState<'a' | 'b'>('a');
      return <SegmentedControl label="Estado" options={[{ value: 'a', label: 'Todos' }, { value: 'b', label: 'Activo' }]} value={value} onChange={setValue} />;
    }
    render(<Demo />);
    expect(screen.getByRole('radiogroup', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Todos' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Activo' }));
    expect(screen.getByRole('radio', { name: 'Activo' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Todos' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('FilterChip', () => {
  it('anuncia si está seleccionado (aria-pressed) y alterna', async () => {
    const onToggle = vi.fn();
    render(<FilterChip label="Proveedor" selected={false} onToggle={onToggle} />);
    const chip = screen.getByRole('button', { name: 'Proveedor' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('Snackbar', () => {
  it('muestra el mensaje con su acción, se anuncia y se cierra solo', () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    function Demo() {
      const show = useSnackbar();
      return <button type="button" onClick={() => { show({ message: 'Invitación revocada.', action: { label: 'Actualizar', onClick: onAction } }); }}>mostrar</button>;
    }
    render(
      <SnackbarProvider>
        <Demo />
      </SnackbarProvider>,
    );
    act(() => { screen.getByRole('button', { name: 'mostrar' }).click(); });
    expect(screen.getByRole('status')).toHaveTextContent('Invitación revocada.');
    act(() => { screen.getByRole('button', { name: 'Actualizar' }).click(); });
    expect(onAction).toHaveBeenCalled();
    expect(screen.queryByText('Invitación revocada.')).toBeNull();
    act(() => { screen.getByRole('button', { name: 'mostrar' }).click(); });
    act(() => { vi.advanceTimersByTime(10_001); });
    expect(screen.queryByText('Invitación revocada.')).toBeNull();
    vi.useRealTimers();
  });
});
