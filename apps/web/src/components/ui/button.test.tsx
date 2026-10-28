import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button.tsx';

describe('Button', () => {
  it('con asChild envuelve un único hijo (no rompe la página 404)', () => {
    render(
      <Button asChild>
        <a href="/">Atrás</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Atrás' });
    expect(link).toHaveClass('min-h-touch');
  });

  it('cargando: indicador y deshabilitado', () => {
    render(<Button loading>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
