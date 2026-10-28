import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput, totpSecondsLeft } from '../src/components/otp-input.tsx';

function Harness({ onComplete }: { onComplete: (v: string) => void }) {
  const [value, setValue] = useState('');
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} />;
}

describe('OtpInput', () => {
  it('es un solo campo que acepta el código pegado completo (con espacios) y lo envía', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input = screen.getByLabelText('Código de verificación');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    fireEvent.change(input, { target: { value: '482 913' } });
    expect(input).toHaveValue('482913');
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('ignora lo que no son dígitos y no envía hasta tener 6', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input = screen.getByLabelText('Código de verificación');
    fireEvent.change(input, { target: { value: '4a8' } });
    expect(input).toHaveValue('48');
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('totpSecondsLeft', () => {
  it('cuenta atrás de 30 a 1 alineada con el reloj', () => {
    expect(totpSecondsLeft(0)).toBe(30);
    expect(totpSecondsLeft(12_000)).toBe(18);
    expect(totpSecondsLeft(29_999)).toBe(1);
    expect(totpSecondsLeft(30_000)).toBe(30);
  });
});
