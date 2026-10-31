import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  (req: Request, res: Response, next: NextFunction): void;
  reset: () => void;
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}): RateLimiter {
  const store = new Map<string, RateLimitEntry>();

  // Periodically clean expired entries
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 60000);
  if (interval.unref) {
    interval.unref();
  }

  const middleware = ((req: Request, res: Response, next: NextFunction): void => {
    // In test environment, bypass in-memory IP rate limiting unless test explicitly opts in
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      next();
      return;
    }

    const key = options.keyGenerator
      ? options.keyGenerator(req)
      : (req.ip || req.socket.remoteAddress || 'unknown_ip');

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (entry.count >= options.max) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message || 'Too many requests, please try again later.',
        },
      });
      return;
    }

    entry.count += 1;
    next();
  }) as RateLimiter;

  middleware.reset = () => {
    store.clear();
  };

  return middleware;
}

// 20 requests per 15 minutes per IP for auth sensitive endpoints
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts, please try again later.',
});

// 60 requests per minute per IP for public invoice viewing
export const publicRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many public requests, please try again later.',
});

// 20 requests per 15 minutes per IP for payment initiation
export const payRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many payment attempts, please try again later.',
});

export function resetRateLimits(): void {
  authRateLimiter.reset();
  publicRateLimiter.reset();
  payRateLimiter.reset();
}
