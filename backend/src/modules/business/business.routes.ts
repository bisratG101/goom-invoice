import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../../middleware/auth';
import { getDbPool } from '../../db/pool';

export const businessRouter = Router();

// Validate timezone with Intl.DateTimeFormat
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Zod schema matching design.md Section 6 & 8
const updateBusinessSchema = z.object({
  name: z.string().min(1, 'Name must be at least 1 character').max(120, 'Name must not exceed 120 characters').optional(),
  default_currency: z.enum(['ETB', 'USD'], {
    errorMap: () => ({ message: 'default_currency must be ETB or USD' }),
  }).optional(),
  invoice_prefix: z.string().regex(/^[A-Z0-9]{1,8}$/, {
    message: 'invoice_prefix must be 1 to 8 alphanumeric uppercase characters (A-Z, 0-9)',
  }).optional(),
  timezone: z.string().refine(isValidTimezone, {
    message: 'Invalid timezone name. Must be a valid IANA timezone (e.g. Africa/Addis_Ababa)',
  }).optional(),
});

/**
 * GET /api/v1/business
 * Returns own business profile.
 */
businessRouter.get('/', requireAuth, requireOwner, (req: Request, res: Response) => {
  const business = req.business!;
  res.status(200).json({
    business: {
      id: business.id,
      name: business.name,
      defaultCurrency: business.default_currency,
      invoicePrefix: business.invoice_prefix,
      timezone: business.timezone,
      createdAt: business.created_at,
    },
  });
});

/**
 * PATCH /api/v1/business
 * Updates own business profile with Zod validation.
 * Rejects or ignores unauthorized fields (e.g. owner_id, id, business_id).
 */
businessRouter.patch('/', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const parseResult = updateBusinessSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid business update data',
        details: parseResult.error.flatten().fieldErrors,
      },
    });
    return;
  }

  const updates = parseResult.data;
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.default_currency !== undefined) {
    fields.push(`default_currency = $${paramIndex++}`);
    values.push(updates.default_currency);
  }
  if (updates.invoice_prefix !== undefined) {
    fields.push(`invoice_prefix = $${paramIndex++}`);
    values.push(updates.invoice_prefix);
  }
  if (updates.timezone !== undefined) {
    fields.push(`timezone = $${paramIndex++}`);
    values.push(updates.timezone);
  }

  // If no allowed update fields were provided, return current business state
  if (fields.length === 0) {
    const b = req.business!;
    res.status(200).json({
      business: {
        id: b.id,
        name: b.name,
        defaultCurrency: b.default_currency,
        invoicePrefix: b.invoice_prefix,
        timezone: b.timezone,
        createdAt: b.created_at,
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
    // Tenant isolation: Update strictly WHERE id = req.business.id AND owner_id = req.user.id
    values.push(req.business!.id);
    values.push(req.user!.id);
    const sql = `UPDATE businesses SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND owner_id = $${paramIndex++} RETURNING id, name, default_currency, invoice_prefix, timezone, created_at`;

    const result = await pool.query(sql, values);

    if (result.rowCount === 0) {
      res.status(404).json({
        error: {
          code: 'BUSINESS_NOT_FOUND',
          message: 'Business not found or access denied',
        },
      });
      return;
    }

    const updated = result.rows[0];
    res.status(200).json({
      business: {
        id: updated.id,
        name: updated.name,
        defaultCurrency: updated.default_currency,
        invoicePrefix: updated.invoice_prefix,
        timezone: updated.timezone,
        createdAt: updated.created_at,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update business profile',
      },
    });
  }
});
