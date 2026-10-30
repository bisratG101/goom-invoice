import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDbPool } from '../../db/pool';
import { signUserToken } from '../../utils/jwt';
import { authRateLimiter } from '../../middleware/rateLimit';
import { requireAuth, requireOwner } from '../../middleware/auth';

export const authRouter = Router();

// Validation schemas per design.md
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters'),
  businessName: z.string().min(1, 'Business name is required').max(120, 'Business name must not exceed 120 characters'),
  defaultCurrency: z.enum(['ETB', 'USD']).optional().default('ETB'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/v1/auth/register
 * Creates user, business, and invoice_counters row in ONE transaction.
 * Hash password with bcrypt (10 rounds).
 * Returns 409 on duplicate email.
 */
authRouter.post('/register', authRateLimiter, async (req: Request, res: Response) => {
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid registration input',
        details: parseResult.error.flatten().fieldErrors,
      },
    });
    return;
  }

  const { email, password, name, businessName, defaultCurrency } = parseResult.data;
  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database connection unavailable',
      },
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check duplicate email with citext
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email address already exists',
        },
      });
      return;
    }

    // 2. Hash password with bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Insert user
    const userResult = await client.query<{ id: string; email: string; name: string }>(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, passwordHash, name]
    );
    const user = userResult.rows[0];

    // 4. Insert business
    const businessResult = await client.query<{
      id: string;
      name: string;
      default_currency: string;
      invoice_prefix: string;
      timezone: string;
    }>(
      'INSERT INTO businesses (owner_id, name, default_currency) VALUES ($1, $2, $3) RETURNING id, name, default_currency, invoice_prefix, timezone',
      [user.id, businessName, defaultCurrency]
    );
    const business = businessResult.rows[0];

    // 5. Insert invoice_counters row
    await client.query(
      'INSERT INTO invoice_counters (business_id, last_number) VALUES ($1, 0)',
      [business.id]
    );

    await client.query('COMMIT');

    // Issue JWT
    const token = signUserToken({ userId: user.id, email: user.email });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      business: {
        id: business.id,
        name: business.name,
        defaultCurrency: business.default_currency,
        invoicePrefix: business.invoice_prefix,
        timezone: business.timezone,
      },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && err.constraint === 'users_email_key') {
      res.status(409).json({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email address already exists',
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to complete registration transaction',
      },
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/auth/login
 * Generic 401 on failure (never reveal whether email exists or password is wrong).
 */
authRouter.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid login input',
        details: parseResult.error.flatten().fieldErrors,
      },
    });
    return;
  }

  const { email, password } = parseResult.data;
  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database connection unavailable',
      },
    });
    return;
  }

  try {
    const userResult = await pool.query<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
    }>('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);

    // Generic 401: Do not disclose whether email exists
    if (userResult.rowCount === 0) {
      res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      return;
    }

    const { id, email: userEmail, name, password_hash: passwordHash } = userResult.rows[0];
    const passwordValid = await bcrypt.compare(password, passwordHash);
    if (!passwordValid) {
      res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      return;
    }

    // Fetch business
    const businessResult = await pool.query<{
      id: string;
      name: string;
      default_currency: string;
      invoice_prefix: string;
      timezone: string;
    }>('SELECT id, name, default_currency, invoice_prefix, timezone FROM businesses WHERE owner_id = $1', [
      id,
    ]);

    const business = businessResult.rows[0];
    const token = signUserToken({ userId: id, email: userEmail });

    res.status(200).json({
      token,
      user: {
        id,
        email: userEmail,
        name,
      },
      business: business
        ? {
            id: business.id,
            name: business.name,
            defaultCurrency: business.default_currency,
            invoicePrefix: business.invoice_prefix,
            timezone: business.timezone,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Authentication failed',
      },
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Returns authenticated user and their business. Never returns password hashes.
 */
authRouter.get('/me', requireAuth, requireOwner, (req: Request, res: Response) => {
  const user = req.user!;
  const business = req.business!;

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    business: {
      id: business.id,
      name: business.name,
      defaultCurrency: business.default_currency,
      invoicePrefix: business.invoice_prefix,
      timezone: business.timezone,
    },
  });
});
