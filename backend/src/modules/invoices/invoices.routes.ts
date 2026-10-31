import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { requireAuth, requireOwner } from '../../middleware/auth';
import { getDbPool } from '../../db/pool';
import { env } from '../../config/env';
import {
  MONEY_CONSTANTS,
  calculateLineTotal,
  calculateSubtotal,
  calculateTax,
  calculateTotal,
  parseDecimalToMinor,
} from '../../utils/money';
import { getTodayInTimezone, isInvoiceOverdue } from '../../utils/timezone';

export const invoicesRouter = Router();

const uuidSchema = z.string().uuid();
function isValidUuid(id: string): boolean {
  return uuidSchema.safeParse(id).success;
}

// Item input schema
const invoiceItemInputSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(200, 'Description cannot exceed 200 characters'),
  quantity_milli: z.coerce.number().int().min(1, 'Quantity milli must be at least 1').max(MONEY_CONSTANTS.MAX_QUANTITY_MILLI).optional(),
  quantityMilli: z.coerce.number().int().min(1).max(MONEY_CONSTANTS.MAX_QUANTITY_MILLI).optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit_price_minor: z.coerce.number().int().min(0, 'Unit price cannot be negative').max(MONEY_CONSTANTS.MAX_UNIT_PRICE_MINOR).optional(),
  unitPriceMinor: z.coerce.number().int().min(0).max(MONEY_CONSTANTS.MAX_UNIT_PRICE_MINOR).optional(),
  unitPrice: z.union([z.string(), z.number()]).optional(),
});

// Helper to normalize an item's quantity and unit price
function normalizeItem(raw: z.infer<typeof invoiceItemInputSchema>): {
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
} {
  let quantityMilli: number;
  if (raw.quantityMilli !== undefined) {
    quantityMilli = raw.quantityMilli;
  } else if (raw.quantity_milli !== undefined) {
    quantityMilli = raw.quantity_milli;
  } else if (raw.quantity !== undefined) {
    // Parse quantity e.g. "1.5" => 1500 milli
    const str = String(raw.quantity).trim();
    if (!/^\d+(\.\d{1,3})?$/.test(str)) {
      throw new Error(`Invalid quantity decimal: "${raw.quantity}"`);
    }
    const [whole, frac = ''] = str.split('.');
    const milli = BigInt(whole) * 1000n + BigInt(frac.padEnd(3, '0'));
    if (milli < 1n || milli > BigInt(MONEY_CONSTANTS.MAX_QUANTITY_MILLI)) {
      throw new Error(`Quantity must be between 1 and ${MONEY_CONSTANTS.MAX_QUANTITY_MILLI} milli-units`);
    }
    quantityMilli = Number(milli);
  } else {
    quantityMilli = 1000; // default 1.000
  }

  let unitPriceMinor: number;
  if (raw.unitPriceMinor !== undefined) {
    unitPriceMinor = raw.unitPriceMinor;
  } else if (raw.unit_price_minor !== undefined) {
    unitPriceMinor = raw.unit_price_minor;
  } else if (raw.unitPrice !== undefined) {
    unitPriceMinor = parseDecimalToMinor(String(raw.unitPrice), {
      maxMinor: MONEY_CONSTANTS.MAX_UNIT_PRICE_MINOR,
    });
  } else {
    throw new Error('Unit price is required');
  }

  return {
    description: raw.description,
    quantityMilli,
    unitPriceMinor,
  };
}

// Schemas for creating and updating invoices
const createInvoiceSchema = z.object({
  client_id: z.string().uuid('Invalid client_id UUID').optional(),
  clientId: z.string().uuid('Invalid clientId UUID').optional(),
  currency: z.enum(['ETB', 'USD']).optional(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'issue_date must be YYYY-MM-DD').optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'issueDate must be YYYY-MM-DD').optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD').optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD').optional(),
  tax_rate_bps: z.coerce.number().int().min(0).max(MONEY_CONSTANTS.MAX_TAX_RATE_BPS).optional(),
  taxRateBps: z.coerce.number().int().min(0).max(MONEY_CONSTANTS.MAX_TAX_RATE_BPS).optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
  items: z.array(invoiceItemInputSchema).max(MONEY_CONSTANTS.MAX_LINE_ITEMS, `Cannot exceed ${MONEY_CONSTANTS.MAX_LINE_ITEMS} line items`).default([]),
});

const updateInvoiceSchema = z.object({
  client_id: z.string().uuid('Invalid client_id UUID').optional(),
  clientId: z.string().uuid('Invalid clientId UUID').optional(),
  currency: z.enum(['ETB', 'USD']).optional(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'issue_date must be YYYY-MM-DD').optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'issueDate must be YYYY-MM-DD').optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD').optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD').optional(),
  tax_rate_bps: z.coerce.number().int().min(0).max(MONEY_CONSTANTS.MAX_TAX_RATE_BPS).optional(),
  taxRateBps: z.coerce.number().int().min(0).max(MONEY_CONSTANTS.MAX_TAX_RATE_BPS).optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
  items: z.array(invoiceItemInputSchema).max(MONEY_CONSTANTS.MAX_LINE_ITEMS, `Cannot exceed ${MONEY_CONSTANTS.MAX_LINE_ITEMS} line items`).optional(),
});

const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be >= 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit must be >= 1').max(100, 'limit cannot exceed 100').default(20),
  status: z.enum(['draft', 'sent', 'paid', 'void', 'overdue', 'all']).optional(),
  clientId: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export function formatInvoiceItem(item: any) {
  return {
    id: item.id,
    invoiceId: item.invoice_id,
    invoice_id: item.invoice_id,
    position: item.position,
    description: item.description,
    quantityMilli: Number(item.quantity_milli),
    quantity_milli: Number(item.quantity_milli),
    unitPriceMinor: Number(item.unit_price_minor),
    unit_price_minor: Number(item.unit_price_minor),
    lineTotalMinor: Number(item.line_total_minor),
    line_total_minor: Number(item.line_total_minor),
  };
}

export function formatInvoiceDisplayNumber(
  prefix: string | null | undefined,
  number: number | null | undefined
): string | null {
  if (!number) return null;
  const p = prefix || 'INV';
  return `${p}-${String(number).padStart(4, '0')}`;
}

export function formatInvoice(
  row: any,
  items: any[] = [],
  business?: { invoice_prefix?: string; timezone?: string },
  payments: any[] = []
) {
  const displayNumber = formatInvoiceDisplayNumber(business?.invoice_prefix, row.number);
  const timezone = business?.timezone || 'Africa/Addis_Ababa';
  const isOverdue = isInvoiceOverdue(row.status, row.due_date, timezone);

  const issueDateStr =
    row.issue_date instanceof Date
      ? row.issue_date.toISOString().slice(0, 10)
      : String(row.issue_date).slice(0, 10);
  const dueDateStr =
    row.due_date instanceof Date
      ? row.due_date.toISOString().slice(0, 10)
      : String(row.due_date).slice(0, 10);

  return {
    id: row.id,
    businessId: row.business_id,
    business_id: row.business_id,
    clientId: row.client_id,
    client_id: row.client_id,
    clientName: row.client_name ?? null,
    clientEmail: row.client_email ?? null,
    number: row.number,
    displayNumber,
    display_number: displayNumber,
    currency: row.currency,
    status: row.status,
    isOverdue,
    is_overdue: isOverdue,
    issueDate: issueDateStr,
    issue_date: issueDateStr,
    dueDate: dueDateStr,
    due_date: dueDateStr,
    taxRateBps: row.tax_rate_bps,
    tax_rate_bps: row.tax_rate_bps,
    subtotalMinor: Number(row.subtotal_minor),
    subtotal_minor: Number(row.subtotal_minor),
    taxMinor: Number(row.tax_minor),
    tax_minor: Number(row.tax_minor),
    totalMinor: Number(row.total_minor),
    total_minor: Number(row.total_minor),
    notes: row.notes ?? null,
    publicToken: row.public_token,
    public_token: row.public_token,
    publicUrl: `${env.APP_BASE_URL}/i/${row.public_token}`,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    paid_at: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    voidedAt: row.voided_at ? new Date(row.voided_at).toISOString() : null,
    voided_at: row.voided_at ? new Date(row.voided_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.created_at,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : row.created_at,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : row.updated_at,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : row.updated_at,
    items: items.map(formatInvoiceItem),
    payments: payments.map((p) => ({
      id: p.id,
      businessId: p.business_id,
      invoiceId: p.invoice_id,
      provider: p.provider,
      txRef: p.tx_ref,
      amountMinor: Number(p.amount_minor),
      currency: p.currency,
      status: p.status,
      failureReason: p.failure_reason,
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : p.created_at,
      confirmedAt: p.confirmed_at ? new Date(p.confirmed_at).toISOString() : null,
    })),
  };
}

/**
 * POST /api/v1/invoices
 * Creates a draft invoice with items inside a single database transaction.
 * Server computes every amount from items using utils/money.ts.
 */
invoicesRouter.post('/', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const parseResult = createInvoiceSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid invoice input',
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

  const business = req.business!;
  const rawData = parseResult.data;
  const clientId = rawData.clientId || rawData.client_id;

  if (!clientId) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'clientId is required',
        details: { clientId: ['clientId is required'] },
      },
    });
    return;
  }

  const today = getTodayInTimezone(business.timezone);
  const issueDate = rawData.issueDate || rawData.issue_date || today;
  const dueDate = rawData.dueDate || rawData.due_date || issueDate;

  if (dueDate < issueDate) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'due_date must be on or after issue_date',
        details: { due_date: ['due_date must be on or after issue_date'] },
      },
    });
    return;
  }

  const currency = rawData.currency || business.default_currency;
  const taxRateBps = rawData.taxRateBps ?? rawData.tax_rate_bps ?? 0;
  const notes = rawData.notes ?? null;

  // Normalize items and compute line totals
  let normalizedItems: Array<{ description: string; quantityMilli: number; unitPriceMinor: number; lineTotalMinor: number }>;
  let subtotalMinor: number;
  let taxMinor: number;
  let totalMinor: number;

  try {
    normalizedItems = rawData.items.map((item) => {
      const norm = normalizeItem(item);
      const lineTotalMinor = calculateLineTotal(norm.quantityMilli, norm.unitPriceMinor);
      return { ...norm, lineTotalMinor };
    });

    const lineTotals = normalizedItems.map((i) => i.lineTotalMinor);
    subtotalMinor = calculateSubtotal(lineTotals);
    taxMinor = calculateTax(subtotalMinor, taxRateBps);
    totalMinor = calculateTotal(subtotalMinor, taxMinor);
  } catch (calcErr: any) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: calcErr.message || 'Error calculating monetary totals',
      },
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify client belongs to this business
    const clientCheck = await client.query<{ id: string; name: string; email: string }>(
      'SELECT id, name, email FROM clients WHERE id = $1 AND business_id = $2',
      [clientId, business.id]
    );

    if (clientCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found or does not belong to this business',
        },
      });
      return;
    }

    const publicToken = crypto.randomBytes(32).toString('base64url');

    const invoiceResult = await client.query(
      `INSERT INTO invoices (
        business_id, client_id, currency, status, issue_date, due_date,
        tax_rate_bps, subtotal_minor, tax_minor, total_minor, notes, public_token
      )
      VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        business.id,
        clientId,
        currency,
        issueDate,
        dueDate,
        taxRateBps,
        subtotalMinor,
        taxMinor,
        totalMinor,
        notes,
        publicToken,
      ]
    );

    const invoiceRow = invoiceResult.rows[0];
    const createdItems: any[] = [];

    for (let i = 0; i < normalizedItems.length; i++) {
      const item = normalizedItems[i];
      const position = i + 1;
      const itemResult = await client.query(
        `INSERT INTO invoice_items (
          invoice_id, position, description, quantity_milli, unit_price_minor, line_total_minor
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [invoiceRow.id, position, item.description, item.quantityMilli, item.unitPriceMinor, item.lineTotalMinor]
      );
      createdItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');

    invoiceRow.client_name = clientCheck.rows[0].name;
    invoiceRow.client_email = clientCheck.rows[0].email;

    res.status(201).json({
      invoice: formatInvoice(invoiceRow, createdItems, business),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create invoice',
      },
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/invoices
 * Lists invoices with search, filters (status incl. overdue, clientId), and pagination.
 */
invoicesRouter.get('/', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const parseResult = listInvoicesQuerySchema.safeParse(req.query);
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

  const business = req.business!;
  const { page, limit, status } = parseResult.data;
  const clientId = parseResult.data.clientId || parseResult.data.client_id;
  const searchTerm = parseResult.data.search || parseResult.data.q;

  const conditions: string[] = ['i.business_id = $1'];
  const values: any[] = [business.id];
  let paramIndex = 2;

  // Filter by clientId
  if (clientId) {
    conditions.push(`i.client_id = $${paramIndex++}`);
    values.push(clientId);
  }

  // Filter by status (including overdue)
  if (status === 'overdue') {
    const today = getTodayInTimezone(business.timezone);
    conditions.push(`i.status = 'sent' AND i.due_date < $${paramIndex++}`);
    values.push(today);
  } else if (status && status !== 'all') {
    conditions.push(`i.status = $${paramIndex++}`);
    values.push(status);
  }

  // Search by client name, notes, or number
  if (searchTerm && searchTerm.length > 0) {
    conditions.push(
      `(c.name ILIKE $${paramIndex} OR (i.notes IS NOT NULL AND i.notes ILIKE $${paramIndex}) OR (i.number IS NOT NULL AND i.number::text ILIKE $${paramIndex}))`
    );
    values.push(`%${searchTerm}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  try {
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countSql, values);
    const total = countResult.rows[0]?.total ?? 0;

    const offset = (page - 1) * limit;
    const dataSql = `
      SELECT i.*, c.name AS client_name, c.email AS client_email
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE ${whereClause}
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    const dataResult = await pool.query(dataSql, [...values, limit, offset]);

    res.status(200).json({
      invoices: dataResult.rows.map((row) => formatInvoice(row, [], business)),
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
        message: 'Failed to retrieve invoices',
      },
    });
  }
});

/**
 * GET /api/v1/invoices/:id
 * Retrieves a single invoice with items and payments.
 * Always returns 404 for nonexistent IDs or invoices belonging to another business.
 */
invoicesRouter.get('/:id', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found',
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

  const business = req.business!;

  try {
    const invoiceResult = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = $1 AND i.business_id = $2`,
      [id, business.id]
    );

    if (invoiceResult.rowCount === 0) {
      res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'Invoice not found',
        },
      });
      return;
    }

    const itemsResult = await pool.query(
      `SELECT id, invoice_id, position, description, quantity_milli, unit_price_minor, line_total_minor
       FROM invoice_items
       WHERE invoice_id = $1
       ORDER BY position ASC`,
      [id]
    );

    const paymentsResult = await pool.query(
      `SELECT id, business_id, invoice_id, provider, tx_ref, amount_minor, currency, status, failure_reason, created_at, confirmed_at
       FROM payments
       WHERE invoice_id = $1 AND business_id = $2
       ORDER BY created_at DESC`,
      [id, business.id]
    );

    res.status(200).json({
      invoice: formatInvoice(invoiceResult.rows[0], itemsResult.rows, business, paymentsResult.rows),
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve invoice',
      },
    });
  }
});

/**
 * PATCH /api/v1/invoices/:id
 * Updates draft invoice. Replaces items inside a transaction.
 * Rejects any edit to sent, paid, or void invoices.
 */
invoicesRouter.patch('/:id', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found',
      },
    });
    return;
  }

  const parseResult = updateInvoiceSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid invoice update data',
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

  const business = req.business!;
  const rawData = parseResult.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [id, business.id]
    );

    if (currentRes.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'Invoice not found',
        },
      });
      return;
    }

    const currentInvoice = currentRes.rows[0];

    // Draft-only rule
    if (currentInvoice.status !== 'draft') {
      await client.query('ROLLBACK');
      res.status(422).json({
        error: {
          code: 'DRAFT_ONLY',
          message: 'Only draft invoices can be edited',
        },
      });
      return;
    }

    // Verify client belongs to this business if client is being updated
    const newClientId = rawData.clientId || rawData.client_id || currentInvoice.client_id;
    if (newClientId !== currentInvoice.client_id) {
      const clientCheck = await client.query(
        'SELECT id FROM clients WHERE id = $1 AND business_id = $2',
        [newClientId, business.id]
      );
      if (clientCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({
          error: {
            code: 'CLIENT_NOT_FOUND',
            message: 'Client not found or does not belong to this business',
          },
        });
        return;
      }
    }

    const issueDate = rawData.issueDate || rawData.issue_date || (
      currentInvoice.issue_date instanceof Date
        ? currentInvoice.issue_date.toISOString().slice(0, 10)
        : String(currentInvoice.issue_date).slice(0, 10)
    );
    const dueDate = rawData.dueDate || rawData.due_date || (
      currentInvoice.due_date instanceof Date
        ? currentInvoice.due_date.toISOString().slice(0, 10)
        : String(currentInvoice.due_date).slice(0, 10)
    );

    if (dueDate < issueDate) {
      await client.query('ROLLBACK');
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'due_date must be on or after issue_date',
        },
      });
      return;
    }

    const currency = rawData.currency || currentInvoice.currency;
    const taxRateBps = rawData.taxRateBps ?? rawData.tax_rate_bps ?? currentInvoice.tax_rate_bps;
    const notes = rawData.notes !== undefined ? rawData.notes : currentInvoice.notes;

    let subtotalMinor = Number(currentInvoice.subtotal_minor);
    let taxMinor = Number(currentInvoice.tax_minor);
    let totalMinor = Number(currentInvoice.total_minor);
    let currentItems: any[] = [];

    // Replace items collection if provided
    if (rawData.items !== undefined) {
      const normalizedItems = rawData.items.map((item) => {
        const norm = normalizeItem(item);
        const lineTotalMinor = calculateLineTotal(norm.quantityMilli, norm.unitPriceMinor);
        return { ...norm, lineTotalMinor };
      });

      const lineTotals = normalizedItems.map((i) => i.lineTotalMinor);
      subtotalMinor = calculateSubtotal(lineTotals);
      taxMinor = calculateTax(subtotalMinor, taxRateBps);
      totalMinor = calculateTotal(subtotalMinor, taxMinor);

      // Delete old items and insert new ones
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

      for (let i = 0; i < normalizedItems.length; i++) {
        const item = normalizedItems[i];
        const itemRes = await client.query(
          `INSERT INTO invoice_items (
            invoice_id, position, description, quantity_milli, unit_price_minor, line_total_minor
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [id, i + 1, item.description, item.quantityMilli, item.unitPriceMinor, item.lineTotalMinor]
        );
        currentItems.push(itemRes.rows[0]);
      }
    } else {
      // Recompute tax if tax_rate_bps changed
      if (taxRateBps !== currentInvoice.tax_rate_bps) {
        taxMinor = calculateTax(subtotalMinor, taxRateBps);
        totalMinor = calculateTotal(subtotalMinor, taxMinor);
      }
      const existingItems = await client.query(
        'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC',
        [id]
      );
      currentItems = existingItems.rows;
    }

    const updateRes = await client.query(
      `UPDATE invoices
       SET client_id = $1,
           currency = $2,
           issue_date = $3,
           due_date = $4,
           tax_rate_bps = $5,
           subtotal_minor = $6,
           tax_minor = $7,
           total_minor = $8,
           notes = $9,
           updated_at = now()
       WHERE id = $10 AND business_id = $11
       RETURNING *`,
      [newClientId, currency, issueDate, dueDate, taxRateBps, subtotalMinor, taxMinor, totalMinor, notes, id, business.id]
    );

    await client.query('COMMIT');

    res.status(200).json({
      invoice: formatInvoice(updateRes.rows[0], currentItems, business),
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update invoice',
      },
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/v1/invoices/:id
 * Deletes draft invoice only. Sent, paid, and void invoices cannot be deleted.
 */
invoicesRouter.delete('/:id', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found',
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

  const business = req.business!;

  try {
    const checkRes = await pool.query(
      'SELECT id, status FROM invoices WHERE id = $1 AND business_id = $2',
      [id, business.id]
    );

    if (checkRes.rowCount === 0) {
      res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'Invoice not found',
        },
      });
      return;
    }

    if (checkRes.rows[0].status !== 'draft') {
      res.status(422).json({
        error: {
          code: 'DRAFT_ONLY',
          message: 'Only draft invoices can be deleted. Sent, paid, and void invoices cannot be deleted',
        },
      });
      return;
    }

    await pool.query('DELETE FROM invoices WHERE id = $1 AND business_id = $2', [id, business.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete invoice',
      },
    });
  }
});

/**
 * POST /api/v1/invoices/:id/send
 * Sends a draft invoice:
 * - Inside ONE transaction:
 *   - Verifies invoice has at least 1 item and total > 0
 *   - Increments business invoice_counters using UPDATE ... RETURNING
 *   - Sets number, status = 'sent', and sent_at
 * - Returns updated invoice and publicUrl
 */
invoicesRouter.post('/:id/send', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found',
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

  const business = req.business!;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the invoice row
    const invoiceRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [id, business.id]
    );

    if (invoiceRes.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'Invoice not found',
        },
      });
      return;
    }

    const invoice = invoiceRes.rows[0];

    if (invoice.status !== 'draft') {
      await client.query('ROLLBACK');
      res.status(422).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot send invoice with status '${invoice.status}'. Only draft invoices can be sent`,
        },
      });
      return;
    }

    // Verify invoice has items and total > 0
    const itemsRes = await client.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC',
      [id]
    );

    if (itemsRes.rowCount === 0 || Number(invoice.total_minor) <= 0) {
      await client.query('ROLLBACK');
      res.status(422).json({
        error: {
          code: 'CANNOT_SEND_EMPTY_INVOICE',
          message: 'Cannot send invoice with no items or zero total',
        },
      });
      return;
    }

    // Ensure invoice_counters row exists, then atomic increment
    await client.query(
      `INSERT INTO invoice_counters (business_id, last_number)
       VALUES ($1, 0)
       ON CONFLICT (business_id) DO NOTHING`,
      [business.id]
    );

    const counterRes = await client.query<{ last_number: number }>(
      `UPDATE invoice_counters
       SET last_number = last_number + 1
       WHERE business_id = $1
       RETURNING last_number`,
      [business.id]
    );

    const nextNumber = counterRes.rows[0].last_number;

    const updateRes = await client.query(
      `UPDATE invoices
       SET number = $1,
           status = 'sent',
           sent_at = now(),
           updated_at = now()
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [nextNumber, id, business.id]
    );

    await client.query('COMMIT');

    const updatedRow = updateRes.rows[0];
    const formatted = formatInvoice(updatedRow, itemsRes.rows, business);

    res.status(200).json({
      invoice: formatted,
      publicUrl: formatted.publicUrl,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to send invoice',
      },
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/invoices/:id/void
 * Voids a sent invoice only. Number is retained without gaps.
 * Drafts must be deleted; paid invoices cannot be voided.
 */
invoicesRouter.post('/:id/void', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !isValidUuid(id)) {
    res.status(404).json({
      error: {
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found',
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

  const business = req.business!;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const invoiceRes = await client.query(
      'SELECT * FROM invoices WHERE id = $1 AND business_id = $2 FOR UPDATE',
      [id, business.id]
    );

    if (invoiceRes.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: 'Invoice not found',
        },
      });
      return;
    }

    const invoice = invoiceRes.rows[0];

    if (invoice.status !== 'sent') {
      await client.query('ROLLBACK');
      res.status(422).json({
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot void invoice with status '${invoice.status}'. Only sent invoices can be voided`,
        },
      });
      return;
    }

    const updateRes = await client.query(
      `UPDATE invoices
       SET status = 'void',
           voided_at = now(),
           updated_at = now()
       WHERE id = $1 AND business_id = $2
       RETURNING *`,
      [id, business.id]
    );

    const itemsRes = await client.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC',
      [id]
    );

    await client.query('COMMIT');

    res.status(200).json({
      invoice: formatInvoice(updateRes.rows[0], itemsRes.rows, business),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to void invoice',
      },
    });
  } finally {
    client.release();
  }
});
