export interface LogEntry {
  source: string;
  level: string;
  message: string;
}

/** Destino de los logs técnicos. Nunca llevan datos de pacientes ni secretos. */
export interface LogSink {
  write(entry: LogEntry): void;
}

/** Escribe JSON por línea en la salida estándar (lo recoge CloudWatch en B). */
export class StdoutLogSink implements LogSink {
  write(entry: LogEntry): void {
    if (entry.source === 'fastify') {
      process.stdout.write(entry.message.endsWith('\n') ? entry.message : `${entry.message}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}

/** Para las pruebas: captura los logs y permite buscar secretos en ellos. */
export class MemoryLogSink implements LogSink {
  readonly entries: LogEntry[] = [];
  write(entry: LogEntry): void {
    this.entries.push(entry);
  }
  text(): string {
    return this.entries.map((e) => `${e.source} ${e.level} ${e.message}`).join('\n');
  }
}

/** Campos que Fastify nunca escribe en los logs. */
export const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.code',
];
