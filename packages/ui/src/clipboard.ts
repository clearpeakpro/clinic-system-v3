/** Copia al portapapeles si el navegador lo permite (contexto seguro). */
export async function copyText(text: string): Promise<boolean> {
  if (!('clipboard' in navigator)) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
