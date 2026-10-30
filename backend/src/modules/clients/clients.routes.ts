import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../../middleware/auth';
import { getDbPool } from '../../db/pool';

export const clientsRouter = Router();

// Validation helper for UUID parameters
const uuidSchema = z.string().uuid();
function isValidUuid(id: string): boolean {
  return uuidSchema.safeParse(id).success;
}

// Zod schemas for query and body
const listClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit must be >= 1').max(100, 'limit cannot exceed 100').default(20),
  search: z.string().trim().optional(),
  q: z.string().trim().optional(),
  archived: z.enum(['true', 'false', 'all']).optional(),
});

const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Name must be at least 1 character').max(120, 'Name must not exceed 120 characters'),
  email: z.union([z.string().trim().email('Invalid email address'), z.literal('')]).optional().nullable(),
  phone: z.string().trim().max(50, 'Phone must not exceed 50 characters').optional().nullable(),
  address: z.string().trim().max(300, 'Address must not exceed 300 characters').optional().nullable(),
});

const updateClientSchema = z.object({
  name: z.string().trim().min(1, 'Name must be at least 1 character').max(120, 'Name must not exceed 120 characters').optional(),
  email: z.union([z.string().trim().email('Invalid email address'), z.literal('')]).optional().nullable(),
  phone: z.string().trim().max(50, 'Phone must not exceed 50 characters').optional().nullable(),
  address: z.string().trim().max(300, 'Address must not exceed 300 characters').optional().nullable(),
});

export function formatClient(row: any) {
  return {
    id: row.id,
    businessId: row.business_id,
    business_id: row.business_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    archived_at: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.created_at,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : row.created_at,
  };
}

/**
 * GET /api/v1/clients
 * Lists clients for the authenticated business with search and pagination.
 * Excludes archived clients by default.
 */
clientsRouter.get('/', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const parseResult = listClientsQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: parseResult.error.flatten().fieldErrors,
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

  const businessId = req.business!.id;
  const { page, limit, archived } = parseResult.data;
  const searchTerm = parseResult.data.search || parseResult.data.q;

  const conditions: string[] = ['business_id = $1'];
  const values: any[] = [businessId];
  let paramIndex = 2;

  // Archived filtering: default excludes archived clients
  if (archived === 'true') {
    conditions.push('archived_at IS NOT NULL');
  } else if (archived === 'all') {
    // include both active and archived
  } else {
    // default (or archived === 'false')
    conditions.push('archived_at IS NULL');
  }

  // Search by name or email
  if (searchTerm && searchTerm.length > 0) {
    conditions.push(`(name ILIKE $${paramIndex} OR (email IS NOT NULL AND email::text ILIKE $${paramIndex}))`);
    values.push(`%${searchTerm}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  try {
    // Total count for pagination
    const countSql = `SELECT COUNT(*)::int AS total FROM clients WHERE ${whereClause}`;
    const countResult = await pool.query(countSql, values);
    const total = countResult.rows[0]?.total ?? 0;

    // Fetch paginated client records
    const offset = (page - 1) * limit;
    const dataSql = `
      SELECT id, business_id, name, email, phone, address, archived_at, created_at
      FROM clients
      WHERE ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    const dataResult = await pool.query(dataSql, [...values, limit, offset]);

    res.status(200).json({
      clients: dataResult.rows.map(formatClient),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve clients',
      },
    });
  }
});

/**
 * POST /api/v1/clients
 * Creates a new client scoped strictly to the authenticated business.
 * Never accepts business_id from the request.
 */
clientsRouter.post('/', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const parseResult = createClientSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid client data',
        details: parseResult.error.flatten().fieldErrors,
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

  const businessId = req.business!.id;
  const { name } = parseResult.data;
  const email = parseResult.data.email ? parseResult.data.email.trim() : null;
  const phone = parseResult.data.phone ? parseResult.data.phone.trim() : null;
  const address = parseResult.data.address ? parseResult.data.address.trim() : null;

  try {
    const insertResult = await pool.query(
      `INSERT INTO clients (business_id, name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, business_id, name, email, phone, address, archived_at, created_at`,
      [businessId, name, email, phone, address]
    );

    res.status(201).json({
      client: formatClient(insertResult.rows[0]),
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create client',
      },
    });
  }
});

/**
 * GET /api/v1/clients/:id
 * Fetches a single client scoped by req.business.id.
 * Always returns 404 for nonexistent IDs or clients belonging to other businesses.
 */
clientsRouter.get('/:id', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
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
    const result = await pool.query(
      `SELECT id, business_id, name, email, phone, address, archived_at, created_at
       FROM clients
       WHERE id = $1 AND business_id = $2`,
      [id, req.business!.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found',
        },
      });
      return;
    }

    res.status(200).json({
      client: formatClient(result.rows[0]),
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve client',
      },
    });
  }
});

/**
 * PATCH /api/v1/clients/:id
 * Updates an existing client scoped by req.business.id.
 * Forbidden from altering id, business_id, or archived_at.
 */
clientsRouter.patch('/:id', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
      },
    });
    return;
  }

  const parseResult = updateClientSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid client update data',
        details: parseResult.error.flatten().fieldErrors,
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

  const updates = parseResult.data;
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push(`email = $${paramIndex++}`);
    values.push(updates.email ? updates.email.trim() : null);
  }
  if (updates.phone !== undefined) {
    fields.push(`phone = $${paramIndex++}`);
    values.push(updates.phone ? updates.phone.trim() : null);
  }
  if (updates.address !== undefined) {
    fields.push(`address = $${paramIndex++}`);
    values.push(updates.address ? updates.address.trim() : null);
  }

  try {
    if (fields.length === 0) {
      // No editable fields provided; return current client if it exists under this business
      const current = await pool.query(
        `SELECT id, business_id, name, email, phone, address, archived_at, created_at
         FROM clients
         WHERE id = $1 AND business_id = $2`,
        [id, req.business!.id]
      );

      if (current.rowCount === 0) {
        res.status(404).json({
          error: {
            code: 'CLIENT_NOT_FOUND',
            message: 'Client not found',
          },
        });
        return;
      }

      res.status(200).json({
        client: formatClient(current.rows[0]),
      });
      return;
    }

    values.push(id);
    const idParam = paramIndex++;
    values.push(req.business!.id);
    const businessParam = paramIndex++;

    const updateSql = `
      UPDATE clients
      SET ${fields.join(', ')}
      WHERE id = $${idParam} AND business_id = $${businessParam}
      RETURNING id, business_id, name, email, phone, address, archived_at, created_at
    `;

    const result = await pool.query(updateSql, values);
    if (result.rowCount === 0) {
      res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found',
        },
      });
      return;
    }

    res.status(200).json({
      client: formatClient(result.rows[0]),
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update client',
      },
    });
  }
});

/**
 * POST /api/v1/clients/:id/archive
 * Soft-delete: sets archived_at to now() and returns 204.
 * Returns 404 if client not found or belongs to another business.
 */
clientsRouter.post('/:id/archive', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
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
    const result = await pool.query(
      `UPDATE clients
       SET archived_at = COALESCE(archived_at, now())
       WHERE id = $1 AND business_id = $2
       RETURNING id`,
      [id, req.business!.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found',
        },
      });
      return;
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to archive client',
      },
    });
  }
});

/**
 * POST /api/v1/clients/:id/unarchive
 * Restores a soft-deleted client by clearing archived_at.
 * Returns 200 with the updated client.
 * Returns 404 if client not found or belongs to another business.
 */
clientsRouter.post('/:id/unarchive', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
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
    const result = await pool.query(
      `UPDATE clients
       SET archived_at = NULL
       WHERE id = $1 AND business_id = $2
       RETURNING id, business_id, name, email, phone, address, archived_at, created_at`,
      [id, req.business!.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found',
        },
      });
      return;
    }

    res.status(200).json({
      client: formatClient(result.rows[0]),
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to unarchive client',
      },
    });
  }
});
