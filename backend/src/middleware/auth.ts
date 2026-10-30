import { Request, Response, NextFunction } from 'express';
import { verifyUserToken } from '../utils/jwt';
import { getDbPool } from '../db/pool';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface BusinessEntity {
  id: string;
  owner_id: string;
  name: string;
  default_currency: 'ETB' | 'USD';
  invoice_prefix: string;
  timezone: string;
  created_at: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      business?: BusinessEntity;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token required',
      },
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication token',
      },
    });
    return;
  }

  let payload: { userId: string; email: string };
  try {
    payload = verifyUserToken(token);
  } catch (err) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token',
      },
    });
    return;
  }

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
    const userResult = await pool.query<{ id: string; email: string; name: string }>(
      'SELECT id, email, name FROM users WHERE id = $1',
      [payload.userId]
    );

    if (userResult.rowCount === 0) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User no longer exists',
        },
      });
      return;
    }

    req.user = userResult.rows[0];
    next();
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to authenticate user',
      },
    });
  }
}

export async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

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
    // Tenant isolation rule: Derive business EXCLUSIVELY from authenticated user owner_id.
    // Never trust req.body, req.query, or client headers for business_id.
    const result = await pool.query<BusinessEntity>(
      'SELECT id, owner_id, name, default_currency, invoice_prefix, timezone, created_at FROM businesses WHERE owner_id = $1',
      [req.user.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        error: {
          code: 'BUSINESS_NOT_FOUND',
          message: 'No business profile associated with this account',
        },
      });
      return;
    }

    req.business = result.rows[0];
    next();
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to resolve business context',
      },
    });
  }
}
