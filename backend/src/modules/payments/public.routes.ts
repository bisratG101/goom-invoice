import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import supertest from 'supertest';
import { env } from '../../config/env';
import { getDbPool } from '../../db/pool';
import { publicRateLimiter, payRateLimiter } from '../../middleware/rateLimit';
import { paymentRegistry } from './registry';
import { logger } from '../../utils/logger';
import { formatInvoiceDisplayNumber } from '../invoices/invoices.routes';
import { generateInvoicePdf, PdfInvoiceData } from '../invoices/pdf.service';
import { simulatedProvider } from './simulated.provider';
import { processWebhook } from './webhook.service';

export const publicInvoicesRouter = Router();
export const demoRouter = Router();

export function formatDateOnly(val: Date | string): string {
  if (typeof val === 'string') {
    return val.slice(0, 10);
  }
  const y = val.getFullYear();
  const m = String(val.getMonth() + 1).padStart(2, '0');
  const d = String(val.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const paySchema = z.object({
  payerEmail: z.string().email('Invalid payer email').optional(),
  payerFirstName: z.string().optional(),
  payerLastName: z.string().optional(),
  provider: z.string().optional(),
});

/**
 * GET /public/invoices/:token
 * Public sanitised view of an invoice.
 * Drafts are NEVER publicly visible (returns 404).
 * Returns ONLY businessName, clientName, displayNumber, dates, currency, items, totals, status.
 * NEVER returns businessId, clientId, clientEmail, clientPhone, owner info, or internal IDs.
 */
publicInvoicesRouter.get('/:token', publicRateLimiter, async (req: Request, res: Response) => {
  const token = req.params.token;
  if (!token || typeof token !== 'string') {
    res.status(404).json({
      error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
    });
    return;
  }

  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  try {
    const invoiceRes = await pool.query<{
      id: string;
      number: number | null;
      currency: 'ETB' | 'USD';
      status: string;
      issue_date: string | Date;
      due_date: string | Date;
      tax_rate_bps: number;
      subtotal_minor: string;
      tax_minor: string;
      total_minor: string;
      notes: string | null;
      sent_at: string | Date | null;
      paid_at: string | Date | null;
      business_name: string;
      invoice_prefix: string;
      client_name: string;
    }>(
      `SELECT
         i.id, i.number, i.currency, i.status, i.issue_date, i.due_date,
         i.tax_rate_bps, i.subtotal_minor, i.tax_minor, i.total_minor,
         i.notes, i.sent_at, i.paid_at,
         b.name AS business_name, b.invoice_prefix,
         c.name AS client_name
       FROM invoices i
       JOIN businesses b ON b.id = i.business_id
       JOIN clients c ON c.id = i.client_id
       WHERE i.public_token = $1`,
      [token]
    );

    if (invoiceRes.rowCount === 0) {
      res.status(404).json({
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
      return;
    }

    const row = invoiceRes.rows[0];

    // Draft invoices are never publicly accessible
    if (row.status === 'draft') {
      res.status(404).json({
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
      return;
    }

    // Fetch invoice items
    const itemsRes = await pool.query<{
      position: number;
      description: string;
      quantity_milli: number;
      unit_price_minor: string;
      line_total_minor: string;
    }>(
      `SELECT position, description, quantity_milli, unit_price_minor, line_total_minor
       FROM invoice_items
       WHERE invoice_id = $1
       ORDER BY position ASC`,
      [row.id]
    );

    // Fetch payments for this invoice
    const paymentsRes = await pool.query<{
      provider: string;
      status: string;
      confirmed_at: Date | string | null;
      amount_minor: string;
    }>(
      `SELECT provider, status, confirmed_at, amount_minor
       FROM payments
       WHERE invoice_id = $1
       ORDER BY created_at ASC`,
      [row.id]
    );

    const displayNumber =
      row.number !== null ? formatInvoiceDisplayNumber(row.invoice_prefix, row.number) : null;

    const issueDateStr = formatDateOnly(row.issue_date);
    const dueDateStr = formatDateOnly(row.due_date);

    // Sanitised public object (strictly no internal IDs, client email/phone, or payer email)
    const sanitisedInvoice = {
      displayNumber,
      businessName: row.business_name,
      clientName: row.client_name,
      currency: row.currency,
      status: row.status,
      issueDate: issueDateStr,
      dueDate: dueDateStr,
      items: itemsRes.rows.map((item) => ({
        description: item.description,
        quantity: item.quantity_milli / 1000,
        unitPrice: Number(item.unit_price_minor),
        amount: Number(item.line_total_minor),
      })),
      subtotal: Number(row.subtotal_minor),
      taxTotal: Number(row.tax_minor),
      total: Number(row.total_minor),
      notes: row.notes || null,
      sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      payments: paymentsRes.rows.map((p) => ({
        provider: p.provider,
        status: p.status,
        paidAt: p.confirmed_at ? new Date(p.confirmed_at).toISOString() : null,
        amount: Number(p.amount_minor),
      })),
    };

    res.status(200).json({ invoice: sanitisedInvoice });
  } catch (err: any) {
    logger.error('Failed to retrieve public invoice', { error: err.message });
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve invoice' },
    });
  }
});

/**
 * GET /public/invoices/:token/status
 * Small payload for polling every 2s after payment.
 * Drafts are NEVER publicly visible (returns 404).
 */
publicInvoicesRouter.get('/:token/status', publicRateLimiter, async (req: Request, res: Response) => {
  const token = req.params.token;
  if (!token || typeof token !== 'string') {
    res.status(404).json({
      error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
    });
    return;
  }

  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  try {
    const invoiceRes = await pool.query<{
      status: string;
      currency: 'ETB' | 'USD';
      total_minor: string;
      paid_at: string | Date | null;
    }>(
      `SELECT status, currency, total_minor, paid_at
       FROM invoices
       WHERE public_token = $1`,
      [token]
    );

    if (invoiceRes.rowCount === 0 || invoiceRes.rows[0].status === 'draft') {
      res.status(404).json({
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
      return;
    }

    const row = invoiceRes.rows[0];
    res.status(200).json({
      status: row.status,
      currency: row.currency,
      total: Number(row.total_minor),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    });
  } catch (err: any) {
    logger.error('Failed to poll invoice status', { error: err.message });
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to poll invoice status' },
    });
  }
});

/**
 * GET /public/invoices/:token/pdf
 * Public invoice PDF download.
 * Drafts are NEVER publicly visible (returns 404).
 * Accessible only for sent, paid, and void invoices.
 * NEVER exposes internal IDs, client email/phone, or private owner info.
 */
publicInvoicesRouter.get('/:token/pdf', publicRateLimiter, async (req: Request, res: Response) => {
  const token = req.params.token;
  if (!token || typeof token !== 'string') {
    res.status(404).json({
      error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
    });
    return;
  }

  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  try {
    const invoiceRes = await pool.query<{
      id: string;
      number: number | null;
      invoice_prefix: string;
      business_name: string;
      client_name: string;
      currency: 'ETB' | 'USD';
      status: 'draft' | 'sent' | 'paid' | 'void';
      issue_date: Date | string;
      due_date: Date | string;
      tax_rate_bps: number;
      subtotal_minor: string;
      tax_minor: string;
      total_minor: string;
      notes: string | null;
    }>(
      `SELECT i.id, i.number, i.currency, i.status, i.issue_date, i.due_date,
              i.tax_rate_bps, i.subtotal_minor, i.tax_minor, i.total_minor, i.notes,
              b.invoice_prefix, b.name AS business_name, c.name AS client_name
       FROM invoices i
       JOIN businesses b ON b.id = i.business_id
       JOIN clients c ON c.id = i.client_id
       WHERE i.public_token = $1`,
      [token]
    );

    if (invoiceRes.rowCount === 0) {
      res.status(404).json({
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
      return;
    }

    const row = invoiceRes.rows[0];

    // Draft invoices are never publicly accessible
    if (row.status === 'draft') {
      res.status(404).json({
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
      return;
    }

    const itemsRes = await pool.query<{
      position: number;
      description: string;
      quantity_milli: number;
      unit_price_minor: string;
      line_total_minor: string;
    }>(
      `SELECT position, description, quantity_milli, unit_price_minor, line_total_minor
       FROM invoice_items
       WHERE invoice_id = $1
       ORDER BY position ASC`,
      [row.id]
    );

    const issueDateStr = formatDateOnly(row.issue_date);
    const dueDateStr = formatDateOnly(row.due_date);
    const displayNumber = formatInvoiceDisplayNumber(row.invoice_prefix, row.number);

    const pdfData: PdfInvoiceData = {
      businessName: row.business_name,
      invoicePrefix: row.invoice_prefix,
      number: row.number,
      displayNumber: displayNumber || undefined,
      status: row.status,
      issueDate: issueDateStr,
      dueDate: dueDateStr,
      currency: row.currency,
      clientName: row.client_name,
      items: itemsRes.rows.map((item) => ({
        position: item.position,
        description: item.description,
        quantityMilli: item.quantity_milli,
        unitPriceMinor: Number(item.unit_price_minor),
        lineTotalMinor: Number(item.line_total_minor),
      })),
      subtotalMinor: Number(row.subtotal_minor),
      taxMinor: Number(row.tax_minor),
      totalMinor: Number(row.total_minor),
      taxRateBps: row.tax_rate_bps,
      notes: row.notes,
    };

    const pdfBuffer = await generateInvoicePdf(pdfData);

    const filename = displayNumber ? `invoice-${displayNumber}.pdf` : `invoice-${row.id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.status(200).send(pdfBuffer);
  } catch (err: any) {
    logger.error('Failed to generate public invoice PDF', { error: err.message });
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to generate invoice PDF' },
    });
  }
});

/**
 * POST /public/invoices/:token/pay
 * Initiates payment checkout for a sent invoice.
 * Body: { payerEmail?, payerFirstName?, payerLastName?, provider? }
 */
publicInvoicesRouter.post('/:token/pay', payRateLimiter, async (req: Request, res: Response) => {
  const token = req.params.token;
  if (!token || typeof token !== 'string') {
    res.status(404).json({
      error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
    });
    return;
  }

  const parseResult = paySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid payment parameters',
        details: parseResult.error.flatten().fieldErrors,
      },
    });
    return;
  }

  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  try {
    // 1. Fetch invoice and client info
    const invoiceRes = await pool.query<{
      id: string;
      business_id: string;
      number: number | null;
      currency: 'ETB' | 'USD';
      status: string;
      total_minor: string;
      client_name: string;
      client_email: string | null;
    }>(
      `SELECT
         i.id, i.business_id, i.number, i.currency, i.status, i.total_minor,
         c.name AS client_name, c.email AS client_email
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE i.public_token = $1`,
      [token]
    );

    if (invoiceRes.rowCount === 0 || invoiceRes.rows[0].status === 'draft') {
      res.status(404).json({
        error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' },
      });
      return;
    }

    const invoice = invoiceRes.rows[0];

    // Check payable status: only 'sent' invoices can be paid
    if (invoice.status !== 'sent') {
      res.status(422).json({
        error: {
          code: 'INVOICE_NOT_PAYABLE',
          message: `Invoice cannot be paid because its status is "${invoice.status}"`,
        },
      });
      return;
    }

    const { payerEmail: bodyEmail, payerFirstName, payerLastName, provider: requestedProvider } =
      parseResult.data;

    // 2. Select Payment Provider
    let providerName: string;
    if (requestedProvider) {
      const normalizedReq = requestedProvider.trim().toLowerCase();
      if (!paymentRegistry.isEnabled(normalizedReq)) {
        res.status(422).json({
          error: {
            code: 'INVALID_PROVIDER',
            message: `Payment provider "${requestedProvider}" is not enabled`,
          },
        });
        return;
      }
      providerName = normalizedReq;
    } else {
      const defaultProvider = paymentRegistry.getDefault();
      providerName = defaultProvider.name;
    }

    const provider = paymentRegistry.get(providerName);
    if (!provider) {
      res.status(422).json({
        error: {
          code: 'INVALID_PROVIDER',
          message: `Payment provider "${providerName}" is not available`,
        },
      });
      return;
    }

    // 3. Resolve payer email (client's email if available, else body)
    const effectiveEmail = invoice.client_email || bodyEmail;

    // Chapa requires an email address; Simulated provider ignores it
    if (provider.name === 'chapa' && !effectiveEmail) {
      res.status(422).json({
        error: {
          code: 'PAYER_EMAIL_REQUIRED',
          message: 'Payer email is required to proceed with payment',
        },
      });
      return;
    }

    const payerName =
      [payerFirstName, payerLastName].filter(Boolean).join(' ') ||
      invoice.client_name ||
      'Customer';

    // 4. Amount and currency are strictly sourced from invoice on the server
    const amountMinor = Number(invoice.total_minor);
    const currency = invoice.currency;

    // 5. Generate random, cryptographically secure tx_ref
    const txRef = `tx_${crypto.randomBytes(16).toString('hex')}`;

    // 6. Record pending payment row in payments table
    // (Never insert payer_email into payments table!)
    await pool.query(
      `INSERT INTO payments (
         business_id, invoice_id, provider, tx_ref, amount_minor, currency, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [invoice.business_id, invoice.id, provider.name, txRef, amountMinor, currency]
    );

    // 7. Request checkout URL from provider
    // Note: NEVER log effectiveEmail!
    logger.info('Initiating checkout with provider', {
      provider: provider.name,
      txRef,
      currency,
      amountMinor,
    });

    const checkout = await provider.createCheckout({
      txRef,
      amountMinor,
      currency,
      returnUrl: `${env.APP_BASE_URL}/i/${token}/return`,
      description: `Payment for Invoice #${invoice.number || ''}`,
      payer: {
        name: payerName,
        email: effectiveEmail || '',
      },
    });

    // 8. If DEMO_MODE=true, provide demoCheckoutUrl for the Simulated provider
    let demoCheckoutUrl: string | undefined;
    if (env.DEMO_MODE) {
      if (provider.name === 'simulated') {
        demoCheckoutUrl = checkout.checkoutUrl;
      } else if (paymentRegistry.isEnabled('simulated')) {
        const simProvider = paymentRegistry.get('simulated');
        if (simProvider) {
          const simTxRef = `tx_demo_${crypto.randomBytes(16).toString('hex')}`;
          await pool.query(
            `INSERT INTO payments (
               business_id, invoice_id, provider, tx_ref, amount_minor, currency, status
             )
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [invoice.business_id, invoice.id, 'simulated', simTxRef, amountMinor, currency]
          );
          const simCheckout = await simProvider.createCheckout({
            txRef: simTxRef,
            amountMinor,
            currency,
            returnUrl: `${env.APP_BASE_URL}/i/${token}/return`,
            description: `Demo payment for Invoice #${invoice.number || ''}`,
            payer: { name: payerName, email: effectiveEmail || '' },
          });
          demoCheckoutUrl = simCheckout.checkoutUrl;
        }
      }
    }

    res.status(200).json({
      checkoutUrl: checkout.checkoutUrl,
      ...(demoCheckoutUrl ? { demoCheckoutUrl } : {}),
    });
  } catch (err: any) {
    logger.error('Failed to initiate payment', { error: err.message });
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to initiate payment' },
    });
  }
});

/**
 * POST /demo/simulated/:txRef/complete
 * Demo mode only.
 * The frontend demo checkout button calls this endpoint.
 * The server builds an event, signs it with SIMULATED_WEBHOOK_SECRET,
 * and POSTs it to its own /webhooks/simulated endpoint to trigger the real webhook pipeline.
 */
demoRouter.post('/simulated/:txRef/complete', async (req: Request, res: Response) => {
  if (!env.DEMO_MODE) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Demo mode is not enabled' },
    });
    return;
  }

  const txRef = req.params.txRef;
  if (!txRef || typeof txRef !== 'string') {
    res.status(404).json({
      error: { code: 'PAYMENT_NOT_FOUND', message: 'Transaction reference is missing' },
    });
    return;
  }

  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  try {
    const paymentRes = await pool.query<{
      id: string;
      amount_minor: string;
      currency: 'ETB' | 'USD';
      status: string;
    }>(
      `SELECT id, amount_minor, currency, status
       FROM payments
       WHERE tx_ref = $1 AND provider = 'simulated'`,
      [txRef]
    );

    if (paymentRes.rowCount === 0) {
      res.status(404).json({
        error: { code: 'PAYMENT_NOT_FOUND', message: 'Simulated payment not found' },
      });
      return;
    }

    const payment = paymentRes.rows[0];

    // Ensure simulatedProvider records this transaction
    simulatedProvider.setTransaction(txRef, {
      status: 'success',
      amountMinor: Number(payment.amount_minor),
      currency: payment.currency,
    });

    // Build event payload
    const eventPayload = {
      event: 'charge.success',
      txRef,
      eventKey: `sim_${txRef}_success`,
      status: 'success',
      amount: Number(payment.amount_minor),
      currency: payment.currency,
    };

    const rawPayloadString = JSON.stringify(eventPayload);
    const secret = env.SIMULATED_WEBHOOK_SECRET || 'simulated_secret_default_key';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(Buffer.from(rawPayloadString, 'utf8'))
      .digest('hex');

    // POST to own /webhooks/simulated endpoint
    // Using supertest against req.app dispatches the real HTTP request through Express
    const webhookRes = await supertest(req.app)
      .post('/webhooks/simulated')
      .set('Content-Type', 'application/json')
      .set('x-simulated-signature', signature)
      .send(rawPayloadString);

    res.status(200).json({
      status: 'ok',
      webhookStatus: webhookRes.status,
      result: webhookRes.body,
    });
  } catch (err: any) {
    logger.error('Failed to complete simulated payment', { error: err.message });
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to complete demo payment' },
    });
  }
});

/**
 * Webhook handler for /webhooks/:provider
 * Mounted with express.raw({ type: 'application/json' }) BEFORE express.json()
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const providerParam = req.params.provider;
  const providerName = (Array.isArray(providerParam) ? providerParam[0] : providerParam || '').toLowerCase();
  const provider = paymentRegistry.get(providerName);

  if (!provider) {
    res.status(404).json({
      error: { code: 'PROVIDER_NOT_FOUND', message: `Payment provider "${providerName}" not found or disabled` },
    });
    return;
  }

  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8');

  const result = await processWebhook(provider, rawBody, req.headers, pool);
  res.status(result.statusCode).json(result.body);
}
