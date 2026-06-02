export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [k: string]: unknown;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  writer?: (line: string) => void;
  base?: LogFields;
}

function defaultWriter(line: string): void {
  // Single line of JSON to stdout. Process supervisor captures it.
  process.stdout.write(line + '\n');
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const writer = opts.writer ?? defaultWriter;
  const base = opts.base ?? {};

  const emit = (level: Level, msg: string, fields?: LogFields): void => {
    const record = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...base,
      ...fields,
    };
    writer(JSON.stringify(record));
  };

  return {
    debug: (msg, f) => emit('debug', msg, f),
    info:  (msg, f) => emit('info',  msg, f),
    warn:  (msg, f) => emit('warn',  msg, f),
    error: (msg, f) => emit('error', msg, f),
    child: (fields) => createLogger({ writer, base: { ...base, ...fields } }),
  };
}

// Module-level default singleton for app code that doesn't have a request context.
export const log = createLogger();
