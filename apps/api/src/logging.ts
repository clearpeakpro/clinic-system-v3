export interface LogEntry {
  source: string;
  level: string;
  message: string;
}

/** Destino de los logs técnicos. En las pruebas se capturan para buscar secretos. */
export interface LogSink {
  write(entry: LogEntry): void;
}

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
];
