/**
 * Structured JSON logger with redaction. Health data, message bodies, codes and tokens must never
 * reach ordinary application logs; phone numbers are masked.
 */
const REDACT_KEYS = new Set(['body', 'text', 'code', 'otp', 'token', 'password', 'apikey', 'authorization', 'cookie', 'note', 'description']);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') {
    if (typeof value === 'string' && /^\+?\d{9,15}$/.test(value)) return value.slice(0, 4) + '•••' + value.slice(-3);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[redacted]' : k.toLowerCase().includes('phone') && typeof v === 'string' ? redact(v, 5) : redact(v, depth + 1);
  }
  return out;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(opts: { silent?: boolean } = {}): Logger {
  const write = (level: string, msg: string, meta?: Record<string, unknown>) => {
    if (opts.silent) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...(meta ? (redact(meta) as object) : {}) });
    if (level === 'error') console.error(line);
    else console.log(line);
  };
  return {
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
  };
}
