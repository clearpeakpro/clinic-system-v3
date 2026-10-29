// Log técnico del worker: una línea JSON por evento. Solo ids, contadores y
// tipos de error; nunca correos, enlaces, tokens ni datos de pacientes.

export function log(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, string | number | null> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, source: 'worker', message, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}
