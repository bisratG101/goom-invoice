type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  level: LogLevel;
  message: string;
  meta?: any;
  timestamp: string;
}

type LogListener = (entry: LogEntry) => void;

const listeners: LogListener[] = [];

/**
 * Strips sensitive keys (payerEmail, email, password, tokens, secrets) from metadata objects
 * to guarantee personal/payment privacy.
 */
function sanitizeMeta(meta: any): any {
  if (!meta || typeof meta !== 'object') {
    return meta;
  }

  if (Array.isArray(meta)) {
    return meta.map(sanitizeMeta);
  }

  const sanitized: Record<string, any> = {};
  const sensitiveKeys = [
    'payeremail',
    'payer_email',
    'email',
    'password',
    'password_hash',
    'passwordhash',
    'secret',
    'signature',
    'chapa_secret_key',
    'jwt_secret',
    'simulated_webhook_secret',
    'token',
    'authorization',
  ];

  for (const [key, val] of Object.entries(meta)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeMeta(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

function log(level: LogLevel, message: string, meta?: any) {
  const sanitized = sanitizeMeta(meta);
  const entry: LogEntry = {
    level,
    message,
    meta: sanitized,
    timestamp: new Date().toISOString(),
  };

  // Notify listeners (for tests)
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // Ignore listener error in test harnesses
    }
  }

  if (process.env.NODE_ENV !== 'test') {
    if (level === 'error') {
      console.error(`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, sanitized || '');
    } else if (level === 'warn') {
      console.warn(`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, sanitized || '');
    } else {
      console.log(`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, sanitized || '');
    }
  }
}

export const logger = {
  info: (msg: string, meta?: any) => log('info', msg, meta),
  warn: (msg: string, meta?: any) => log('warn', msg, meta),
  error: (msg: string, meta?: any) => log('error', msg, meta),
  debug: (msg: string, meta?: any) => log('debug', msg, meta),

  /**
   * Captures log entries during a callback or test run.
   */
  captureLogs: (fn: () => void | Promise<void>): Promise<LogEntry[]> | LogEntry[] => {
    const captured: LogEntry[] = [];
    const listener: LogListener = (entry) => captured.push(entry);
    listeners.push(listener);

    const cleanup = () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };

    try {
      const res = fn();
      if (res instanceof Promise) {
        return res.finally(cleanup).then(() => captured);
      }
      cleanup();
      return captured;
    } catch (err) {
      cleanup();
      throw err;
    }
  },

  /**
   * Adds a standing listener and returns an unsubscribe function.
   */
  subscribe: (listener: LogListener) => {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },
};
