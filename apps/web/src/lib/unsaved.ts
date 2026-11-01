import { useEffect } from 'react';

// Cambios sin guardar de una página (S-REC-17): el asistente de llegada lo
// marca desde el paso 2 y el selector de sede de la cabecera (S-GEN-13) pide
// confirmación antes de cambiar. Solo un indicador en memoria: nunca el borrador.

let dirty = false;

export const unsavedChanges = {
  isDirty: () => dirty,
  set(value: boolean) {
    dirty = value;
  },
};

/** Marca la página como «con cambios sin guardar» mientras `value` sea true y esté montada. */
export function useUnsavedChanges(value: boolean): void {
  useEffect(() => {
    unsavedChanges.set(value);
    return () => {
      unsavedChanges.set(false);
    };
  }, [value]);
}
