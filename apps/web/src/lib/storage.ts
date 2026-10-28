// Preferencias del dispositivo. NUNCA datos de pacientes (ADR 0014): solo el
// tema y el código de la última sede, que no son PHI. Todo con try/catch: el
// almacenamiento puede no estar disponible.

const THEME_KEY = 'clinic.theme';
const LOCATION_KEY = 'clinic.lastLocation';

export type ThemePreference = 'light' | 'dark';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la preferencia dura solo esta visita.
  }
}

export const prefs = {
  theme(): ThemePreference | null {
    const value = read(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  },
  setTheme(value: ThemePreference): void {
    write(THEME_KEY, value);
  },
  /** Sede recordada (S-GEN-17: el cierre voluntario la conserva). */
  lastLocationId(): string | null {
    return read(LOCATION_KEY);
  },
  setLastLocationId(id: string): void {
    write(LOCATION_KEY, id);
  },
};

/** Tema efectivo: preferencia guardada o la del sistema. */
export function applyTheme(preference = prefs.theme()): ThemePreference {
  const theme = preference ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', theme === 'dark');
  return theme;
}
