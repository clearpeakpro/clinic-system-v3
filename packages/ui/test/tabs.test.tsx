import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs } from '../src/components/tabs.tsx';

// Pestañas del perfil del paciente (S-PAC-05, T-013): patrón ARIA y teclado.

const ITEMS = [
  { key: 'a', label: 'Resumen' },
  { key: 'b', label: 'Citas' },
  { key: 'c', label: 'Visitas' },
] as const;

function Demo() {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
  return (
    <Tabs label="Secciones" items={ITEMS} value={value} onValueChange={setValue}>
      <p>Panel {value}</p>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('marca la activa, enlaza el panel y solo ella entra en el orden de tabulación', () => {
    render(<Demo />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole('tabpanel', { name: 'Resumen' })).toHaveTextContent('Panel a');
  });

  it('flechas, Inicio y Fin mueven el foco y eligen; el clic también', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('tab', { name: 'Citas' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel b');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Visitas' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel c');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel c');
    await user.keyboard('{Home}{ArrowLeft}');
    expect(screen.getByRole('tabpanel', { name: 'Visitas' })).toBeInTheDocument();
  });
});
