import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDbPool } from '../db/pool';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  calculateLineTotal,
  calculateSubtotal,
  calculateTax,
  calculateTotal,
} from '../utils/money';
import { getTodayInTimezone } from '../utils/timezone';

export interface SeedDemoOptions {
  force?: boolean;
  pool?: Pool;
  allowPortfolioDemoSeed?: boolean;
  connectionString?: string;
}

export interface SeedDemoResult {
  userId: string;
  userEmail: string;
  businessId: string;
  businessName: string;
  clientsCreated: number;
  invoicesCreated: number;
  paymentsCreated: number;
  alreadySeeded: boolean;
}

export const DEMO_CONFIG = {
  EMAIL: 'demo@goominvoice.com',
  PASSWORD: 'DemoPassword123!',
  OWNER_NAME: 'Demo Owner',
  BUSINESS_NAME: 'Demo Logistics',
  DEFAULT_CURRENCY: 'ETB' as const,
  INVOICE_PREFIX: 'INV',
  TIMEZONE: 'Africa/Addis_Ababa',
};

export type Queryable = {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[]; rowCount?: number | null } | any>;
};

export interface DemoDatasetVerification {
  isComplete: boolean;
  isEmpty: boolean;
  reason?: string;
}

/**
 * Validates whether the demo dataset for a business is complete and consistent,
 * completely empty (ready for fresh seeding), or in a partial/inconsistent state.
 */
export async function verifyDemoDataset(
  client: Queryable,
  businessId: string
): Promise<DemoDatasetVerification> {
  // 1. Check client, invoice, and payment counts
  const clientsRes = await client.query<{ count: string }>(
    'SELECT count(*)::int AS count FROM clients WHERE business_id = $1',
    [businessId]
  );
  const clientsCount = parseInt(clientsRes.rows[0]?.count ?? '0', 10);

  const invoicesRes = await client.query<{ count: string }>(
    'SELECT count(*)::int AS count FROM invoices WHERE business_id = $1',
    [businessId]
  );
  const invoicesCount = parseInt(invoicesRes.rows[0]?.count ?? '0', 10);

  const paymentsRes = await client.query<{ count: string }>(
    'SELECT count(*)::int AS count FROM payments WHERE business_id = $1',
    [businessId]
  );
  const paymentsCount = parseInt(paymentsRes.rows[0]?.count ?? '0', 10);

  // If completely empty (no clients, invoices, or payments for this business)
  if (clientsCount === 0 && invoicesCount === 0 && paymentsCount === 0) {
    return { isComplete: false, isEmpty: true };
  }

  // If partially seeded or inconsistent, identify specific violations
  if (clientsCount !== 5) {
    return {
      isComplete: false,
      isEmpty: false,
      reason: `Expected exactly 5 demo clients, found ${clientsCount}`,
    };
  }

  if (invoicesCount !== 15) {
    return {
      isComplete: false,
      isEmpty: false,
      reason: `Expected exactly 15 demo invoices, found ${invoicesCount}`,
    };
  }

  // 2. Check invoice statuses and currencies breakdown
  const statusRes = await client.query<{
    currency: string;
    status: string;
    count: string;
  }>(
    `SELECT currency, status, count(*)::int AS count
     FROM invoices
     WHERE business_id = $1
     GROUP BY currency, status`,
    [businessId]
  );

  let etbPaid = 0, etbSent = 0, etbDraft = 0, etbVoid = 0;
  let usdPaid = 0, usdSent = 0, usdDraft = 0, usdVoid = 0;

  for (const row of statusRes.rows) {
    const count = parseInt(row.count, 10);
    if (row.currency === 'ETB') {
      if (row.status === 'paid') etbPaid += count;
      else if (row.status === 'sent') etbSent += count;
      else if (row.status === 'draft') etbDraft += count;
      else if (row.status === 'void') etbVoid += count;
    } else if (row.currency === 'USD') {
      if (row.status === 'paid') usdPaid += count;
      else if (row.status === 'sent') usdSent += count;
      else if (row.status === 'draft') usdDraft += count;
      else if (row.status === 'void') usdVoid += count;
    }
  }

  if (
    etbPaid !== 4 || etbSent !== 2 || etbDraft !== 1 || etbVoid !== 1 ||
    usdPaid !== 3 || usdSent !== 3 || usdDraft !== 1 || usdVoid !== 0
  ) {
    return {
      isComplete: false,
      isEmpty: false,
      reason: `Invoice status/currency distribution mismatch (ETB: ${etbPaid} paid, ${etbSent} sent, ${etbDraft} draft, ${etbVoid} void; USD: ${usdPaid} paid, ${usdSent} sent, ${usdDraft} draft, ${usdVoid} void)`,
    };
  }

  // 3. Check payments count
  if (paymentsCount !== 7) {
    return {
      isComplete: false,
      isEmpty: false,
      reason: `Expected exactly 7 payment records, found ${paymentsCount}`,
    };
  }

  // 4. Verify payment-to-invoice relationships and amounts
  const paymentDetails = await client.query<{
    invoice_id: string;
    invoice_status: string;
    invoice_currency: string;
    invoice_total: string;
    payment_id: string | null;
    payment_provider: string | null;
    payment_status: string | null;
    payment_currency: string | null;
    payment_amount: string | null;
  }>(
    `SELECT
       i.id AS invoice_id,
       i.status AS invoice_status,
       i.currency AS invoice_currency,
       i.total_minor AS invoice_total,
       p.id AS payment_id,
       p.provider AS payment_provider,
       p.status AS payment_status,
       p.currency AS payment_currency,
       p.amount_minor AS payment_amount
     FROM invoices i
     LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE i.business_id = $1`,
    [businessId]
  );

  for (const row of paymentDetails.rows) {
    if (row.invoice_status === 'paid') {
      if (!row.payment_id) {
        return {
          isComplete: false,
          isEmpty: false,
          reason: `Paid invoice ${row.invoice_id} is missing a payment record`,
        };
      }
      if (row.payment_provider !== 'simulated' || row.payment_status !== 'succeeded') {
        return {
          isComplete: false,
          isEmpty: false,
          reason: `Payment ${row.payment_id} for invoice ${row.invoice_id} has invalid provider or status (${row.payment_provider}, ${row.payment_status})`,
        };
      }
      if (row.payment_currency !== row.invoice_currency) {
        return {
          isComplete: false,
          isEmpty: false,
          reason: `Payment ${row.payment_id} currency (${row.payment_currency}) does not match invoice ${row.invoice_id} currency (${row.invoice_currency})`,
        };
      }
      if (Number(row.payment_amount) !== Number(row.invoice_total)) {
        return {
          isComplete: false,
          isEmpty: false,
          reason: `Payment ${row.payment_id} amount (${row.payment_amount}) does not match invoice ${row.invoice_id} total (${row.invoice_total})`,
        };
      }
    } else {
      // Non-paid invoice must NOT have a succeeded payment
      if (row.payment_id && row.payment_status === 'succeeded') {
        return {
          isComplete: false,
          isEmpty: false,
          reason: `Non-paid invoice ${row.invoice_id} (status: ${row.invoice_status}) unexpectedly has a succeeded payment record`,
        };
      }
    }
  }

  return { isComplete: true, isEmpty: false };
}

/**
 * Service function to create a client within a database transaction or connection.
 * Validates and preserves tenant scoping by business_id.
 */
export async function createClientService(
  client: Queryable,
  input: {
    businessId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  }
): Promise<{ id: string; name: string }> {
  const res = await client.query(
    `INSERT INTO clients (business_id, name, email, phone, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name`,
    [input.businessId, input.name.trim(), input.email?.trim() || null, input.phone?.trim() || null, input.address?.trim() || null]
  );
  return res.rows[0];
}

/**
 * Service function to create an invoice with items, computing exact minor units
 * without floating-point math, and applying standard gapless numbering when sent.
 */
export async function createInvoiceService(
  client: Queryable,
  input: {
    businessId: string;
    clientId: string;
    currency: 'ETB' | 'USD';
    issueDate: string; // YYYY-MM-DD
    dueDate: string;   // YYYY-MM-DD
    taxRateBps?: number;
    notes?: string | null;
    items: Array<{
      description: string;
      quantityMilli: number;
      unitPriceMinor: number;
    }>;
    status: 'draft' | 'sent' | 'paid' | 'void';
    sentAt?: Date | null;
    paidAt?: Date | null;
    voidedAt?: Date | null;
    payment?: {
      provider: 'chapa' | 'simulated';
      txRef: string;
      confirmedAt: Date;
    };
  }
): Promise<{ id: string; number: number | null; totalMinor: number; publicToken: string }> {
  const taxRateBps = input.taxRateBps ?? 0;
  const normalizedItems = input.items.map((item, idx) => {
    const lineTotalMinor = calculateLineTotal(item.quantityMilli, item.unitPriceMinor);
    return {
      position: idx + 1,
      description: item.description,
      quantityMilli: item.quantityMilli,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor,
    };
  });

  const lineTotals = normalizedItems.map((i) => i.lineTotalMinor);
  const subtotalMinor = calculateSubtotal(lineTotals);
  const taxMinor = calculateTax(subtotalMinor, taxRateBps);
  const totalMinor = calculateTotal(subtotalMinor, taxMinor);
  const publicToken = crypto.randomBytes(32).toString('base64url');

  let invoiceNumber: number | null = null;
  let sentAt: Date | null = input.sentAt ?? null;
  const paidAt: Date | null = input.paidAt ?? null;
  const voidedAt: Date | null = input.voidedAt ?? null;

  // Invoices that are sent, paid, or void must have sequential numbering
  if (input.status !== 'draft') {
    await client.query(
      `INSERT INTO invoice_counters (business_id, last_number)
       VALUES ($1, 0)
       ON CONFLICT (business_id) DO NOTHING`,
      [input.businessId]
    );

    const counterRes = await client.query<{ last_number: number }>(
      `UPDATE invoice_counters
       SET last_number = last_number + 1
       WHERE business_id = $1
       RETURNING last_number`,
      [input.businessId]
    );
    invoiceNumber = counterRes.rows[0].last_number;
    if (!sentAt) {
      sentAt = new Date();
    }
  }

  const invoiceRes = await client.query<{ id: string }>(
    `INSERT INTO invoices (
      business_id, client_id, number, currency, status, issue_date, due_date,
      tax_rate_bps, subtotal_minor, tax_minor, total_minor, notes, public_token,
      sent_at, paid_at, voided_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id`,
    [
      input.businessId,
      input.clientId,
      invoiceNumber,
      input.currency,
      input.status,
      input.issueDate,
      input.dueDate,
      taxRateBps,
      subtotalMinor,
      taxMinor,
      totalMinor,
      input.notes ?? null,
      publicToken,
      sentAt,
      paidAt,
      voidedAt,
    ]
  );

  const invoiceId = invoiceRes.rows[0].id;

  for (const item of normalizedItems) {
    await client.query(
      `INSERT INTO invoice_items (
        invoice_id, position, description, quantity_milli, unit_price_minor, line_total_minor
      )
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [invoiceId, item.position, item.description, item.quantityMilli, item.unitPriceMinor, item.lineTotalMinor]
    );
  }

  if (input.status === 'paid' && input.payment) {
    await client.query(
      `INSERT INTO payments (
        business_id, invoice_id, provider, tx_ref, amount_minor, currency, status, created_at, confirmed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'succeeded', $7, $7)`,
      [
        input.businessId,
        invoiceId,
        input.payment.provider,
        input.payment.txRef,
        totalMinor,
        input.currency,
        input.payment.confirmedAt,
      ]
    );
  }

  return { id: invoiceId, number: invoiceNumber, totalMinor, publicToken };
}

export const PROHIBITED_DB_TOKENS = ['prod', 'production', 'live', 'commercial', 'primary', 'main'] as const;
export const ALLOWED_DEMO_DB_TOKENS = ['demo', 'portfolio', 'dev', 'development', 'test', 'sandbox'] as const;

/**
 * Validates that the connected database is strictly an approved dedicated demo/portfolio
 * database, and NOT a production, live, or commercial database target.
 * Verifies live database identity directly via SQL before any write operation.
 */
export async function assertSafeDemoDatabase(
  client: Queryable,
  options?: { connectionString?: string }
): Promise<{ dbName: string; dbUser: string }> {
  // 1. Query live database identity from PostgreSQL
  const identityRes = await client.query<{ current_db: string; current_user: string }>(
    'SELECT current_database() AS current_db, current_user AS current_user'
  );

  const dbName = (identityRes.rows[0]?.current_db || '').trim().toLowerCase();
  const dbUser = (identityRes.rows[0]?.current_user || '').trim().toLowerCase();

  if (!dbName) {
    throw new Error('FATAL SAFETY CHECK: Unable to determine connected database identity.');
  }

  // 2. Parse connection string URL if available
  const rawUrl = options?.connectionString || env.DATABASE_URL || process.env.DATABASE_URL || '';
  let urlDb = '';
  let urlHost = '';
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      urlDb = parsed.pathname.replace(/^\//, '').trim().toLowerCase();
      urlHost = parsed.hostname.toLowerCase();
    } catch {
      // Ignore URL parsing errors if database is already connected
    }
  }

  const checkProhibited = (val: string): string | null => {
    if (!val) return null;
    const lower = val.toLowerCase();
    for (const token of PROHIBITED_DB_TOKENS) {
      if (token === 'prod') {
        // Discrete word boundary check for 'prod' (e.g. prod, _prod, prod_, -prod, prod-)
        if (/(^|[_\-.0-9])prod([_\-.0-9]|$)/i.test(lower)) {
          return token;
        }
      } else if (lower.includes(token)) {
        return token;
      }
    }
    return null;
  };

  // 3. Reject any target identified as production, live, or commercial
  const matchedProhibited =
    checkProhibited(dbName) || (urlDb && checkProhibited(urlDb)) || (urlHost && checkProhibited(urlHost));

  if (matchedProhibited) {
    throw new Error(
      `FATAL SAFETY CHECK: Database target "${dbName}" is identified as a production/live/commercial database (matched prohibited token "${matchedProhibited}"). Demo seeding is strictly prohibited on production targets regardless of local NODE_ENV.`
    );
  }

  // 4. Require the database name to be explicitly classified as a dedicated demo/portfolio target
  const checkAllowed = (val: string): boolean => {
    if (!val) return false;
    const lower = val.toLowerCase();
    return ALLOWED_DEMO_DB_TOKENS.some((token) => lower.includes(token));
  };

  const isApprovedTarget = checkAllowed(dbName) || (urlDb && checkAllowed(urlDb));
  if (!isApprovedTarget) {
    throw new Error(
      `FATAL SAFETY CHECK: Database target "${dbName}" is not a recognized portfolio or demo database. Target database name must explicitly contain one of: ${ALLOWED_DEMO_DB_TOKENS.join(', ')}.`
    );
  }

  return { dbName, dbUser };
}

/**
 * Seeds the database with demo account data.
 * Safe and idempotent:
 * - Refuses to run if NODE_ENV === 'production' (cannot be bypassed by --force, opt-in, or DEMO_MODE)
 * - Requires explicit opt-in via ALLOW_PORTFOLIO_DEMO_SEED=true (cannot be bypassed by --force)
 * - Refuses to run unless DEMO_MODE=true or options.force=true
 * - Verifies connected database identity before any writes (rejects commercial/prod targets)
 * - If demo data already exists, skips gracefully and returns existing counts
 * - Never modifies non-demo user accounts or other businesses
 */
export async function seedDemo(options: SeedDemoOptions = {}): Promise<SeedDemoResult> {
  // 1. Strict production safeguard: demo seeding is strictly prohibited in production
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
    throw new Error('FATAL SAFETY CHECK: Refusing to seed demo data when NODE_ENV is "production".');
  }

  // 2. Explicit opt-in permission check: ALLOW_PORTFOLIO_DEMO_SEED=true
  // Note: --force alone DOES NOT bypass this safeguard.
  const isOptedIn =
    process.env.ALLOW_PORTFOLIO_DEMO_SEED === 'true' ||
    options.allowPortfolioDemoSeed === true;

  if (!isOptedIn) {
    throw new Error(
      'FATAL SAFETY CHECK: Demo seed refused: Missing required opt-in permission. ' +
        'Set ALLOW_PORTFOLIO_DEMO_SEED=true (or options.allowPortfolioDemoSeed: true) to authorize demo seeding.'
    );
  }

  // 3. Demo mode / force safeguard for non-production environments
  const isDemoEnabled = env.DEMO_MODE || options.force;
  if (!isDemoEnabled) {
    throw new Error('Demo seed refused: DEMO_MODE is not true and --force was not supplied.');
  }

  // 4. Acquire database connection
  const pool = options.pool || getDbPool();
  if (!pool) {
    throw new Error('Database connection unavailable for seeding demo data.');
  }

  const client = await pool.connect();
  try {
    // 5. Pre-write database identity, target categorization, and non-demo content verification
    await assertSafeDemoDatabase(client, { connectionString: options.connectionString });

    await client.query('BEGIN');

    // Check if demo user already exists
    const userRes = await client.query<{ id: string; email: string }>(
      'SELECT id, email FROM users WHERE email = $1',
      [DEMO_CONFIG.EMAIL]
    );

    let userId: string;
    let businessId: string;

    if (userRes.rowCount && userRes.rowCount > 0) {
      userId = userRes.rows[0].id;
      const bizRes = await client.query<{ id: string; name: string }>(
        'SELECT id, name FROM businesses WHERE owner_id = $1',
        [userId]
      );
      if (bizRes.rowCount && bizRes.rowCount > 0) {
        businessId = bizRes.rows[0].id;
      } else {
        const newBiz = await client.query<{ id: string }>(
          `INSERT INTO businesses (owner_id, name, default_currency, invoice_prefix, timezone)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [userId, DEMO_CONFIG.BUSINESS_NAME, DEMO_CONFIG.DEFAULT_CURRENCY, DEMO_CONFIG.INVOICE_PREFIX, DEMO_CONFIG.TIMEZONE]
        );
        businessId = newBiz.rows[0].id;
      }
    } else {
      const passwordHash = await bcrypt.hash(DEMO_CONFIG.PASSWORD, 10);
      const newUser = await client.query<{ id: string; email: string }>(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email',
        [DEMO_CONFIG.EMAIL, passwordHash, DEMO_CONFIG.OWNER_NAME]
      );
      userId = newUser.rows[0].id;

      const newBiz = await client.query<{ id: string }>(
        `INSERT INTO businesses (owner_id, name, default_currency, invoice_prefix, timezone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, DEMO_CONFIG.BUSINESS_NAME, DEMO_CONFIG.DEFAULT_CURRENCY, DEMO_CONFIG.INVOICE_PREFIX, DEMO_CONFIG.TIMEZONE]
      );
      businessId = newBiz.rows[0].id;

      await client.query(
        'INSERT INTO invoice_counters (business_id, last_number) VALUES ($1, 0) ON CONFLICT (business_id) DO NOTHING',
        [businessId]
      );
    }

    // Verify dataset state: complete, empty, or inconsistent
    const verification = await verifyDemoDataset(client, businessId);

    if (verification.isComplete) {
      await client.query('COMMIT');
      return {
        userId,
        userEmail: DEMO_CONFIG.EMAIL,
        businessId,
        businessName: DEMO_CONFIG.BUSINESS_NAME,
        clientsCreated: 0,
        invoicesCreated: 0,
        paymentsCreated: 0,
        alreadySeeded: true,
      };
    }

    if (!verification.isEmpty) {
      throw new Error(
        `Demo seed aborted: Inconsistent or partial demo dataset detected for business ${businessId}. ${verification.reason}. Manual inspection required.`
      );
    }

    // 1. Create 5 diverse clients (including Ethiopic and English names)
    const clientsData = [
      {
        name: 'Abyssinia Trading PLC አቢሲኒያ ንግድ',
        email: 'billing@abyssiniatrading.com',
        phone: '+251 91 123 4567',
        address: 'Bole Medhanialem, Addis Ababa',
      },
      {
        name: 'Red Sea Logistics LLC',
        email: 'finance@redsealogistics.com',
        phone: '+251 92 234 5678',
        address: 'Meskel Flower Road, Addis Ababa',
      },
      {
        name: 'Zoma Agro Industries ዞማ አግሮ',
        email: 'accounts@zomaagro.et',
        phone: '+251 93 345 6789',
        address: 'Kazanchis, Addis Ababa',
      },
      {
        name: 'Nile Valley Tech Consultancy',
        email: 'invoicing@nilevalleytech.com',
        phone: '+251 94 456 7890',
        address: 'CMC Michael, Addis Ababa',
      },
      {
        name: 'Hana Bekele & Associates ሐና በቀለ',
        email: 'hana@bekelelaw.et',
        phone: '+251 95 567 8901',
        address: 'Piassa, Churchill Avenue, Addis Ababa',
      },
    ];

    const seededClients: Array<{ id: string; name: string }> = [];
    for (const c of clientsData) {
      // Avoid duplicate client names for this business
      const existingClient = await client.query<{ id: string; name: string }>(
        'SELECT id, name FROM clients WHERE business_id = $1 AND name = $2',
        [businessId, c.name]
      );
      if (existingClient.rowCount && existingClient.rowCount > 0) {
        seededClients.push(existingClient.rows[0]);
      } else {
        const created = await createClientService(client, {
          businessId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          address: c.address,
        });
        seededClients.push(created);
      }
    }

    // Helper to compute dates relative to today in the business timezone
    const nowInTz = new Date();
    const todayStr = getTodayInTimezone(DEMO_CONFIG.TIMEZONE, nowInTz);

    const relativeDate = (offsetDays: number): string => {
      const d = new Date(nowInTz.getTime() + offsetDays * 86400000);
      return getTodayInTimezone(DEMO_CONFIG.TIMEZONE, d);
    };

    const relativeTimestamp = (offsetDays: number, hour: number = 14): Date => {
      const d = new Date(nowInTz.getTime() + offsetDays * 86400000);
      d.setUTCHours(hour, 30, 0, 0);
      return d;
    };

    // 2. Create approximately 15 realistic invoices across ETB and USD
    // Spread: Drafts (2), Sent (4), Overdue (2), Paid (6 across last 5 months), Void (1)
    const invoicesPlan = [
      // --- ETB Invoices ---
      // 1. Paid this month (ETB)
      {
        clientId: seededClients[0].id,
        currency: 'ETB' as const,
        issueDate: relativeDate(-10),
        dueDate: relativeDate(5),
        status: 'paid' as const,
        sentAt: relativeTimestamp(-10),
        paidAt: relativeTimestamp(-2),
        payment: { provider: 'simulated' as const, txRef: 'demo_tx_etb_1', confirmedAt: relativeTimestamp(-2) },
        taxRateBps: 1500, // 15% VAT
        notes: 'Monthly freight transport settlement. አመሰግናለሁ!',
        items: [
          { description: 'Cross-border container haulage (Addis - Djibouti)', quantityMilli: 2000, unitPriceMinor: 4500000 }, // 45,000 ETB * 2
          { description: 'Terminal handling and warehouse fees', quantityMilli: 1000, unitPriceMinor: 1500000 },
        ],
      },
      // 2. Paid this month (ETB)
      {
        clientId: seededClients[1].id,
        currency: 'ETB' as const,
        issueDate: relativeDate(-14),
        dueDate: relativeDate(1),
        status: 'paid' as const,
        sentAt: relativeTimestamp(-14),
        paidAt: relativeTimestamp(-4),
        payment: { provider: 'simulated' as const, txRef: 'demo_tx_etb_2', confirmedAt: relativeTimestamp(-4) },
        taxRateBps: 0,
        notes: 'Refrigerated logistics dispatch.',
        items: [
          { description: 'Cold chain transit dispatch', quantityMilli: 1000, unitPriceMinor: 6200000 },
        ],
      },
      // 3. Paid 1 month ago (ETB)
      {
        clientId: seededClients[2].id,
        currency: 'ETB' as const,
        issueDate: relativeDate(-45),
        dueDate: relativeDate(-30),
        status: 'paid' as const,
        sentAt: relativeTimestamp(-45),
        paidAt: relativeTimestamp(-32),
        payment: { provider: 'simulated' as const, txRef: 'demo_tx_etb_3', confirmedAt: relativeTimestamp(-32) },
        taxRateBps: 1500,
        notes: 'Bulk agricultural delivery.',
        items: [
          { description: 'Bulk grain transfer (Modjo dry port)', quantityMilli: 3000, unitPriceMinor: 2800000 },
        ],
      },
      // 4. Paid 2 months ago (ETB)
      {
        clientId: seededClients[3].id,
        currency: 'ETB' as const,
        issueDate: relativeDate(-75),
        dueDate: relativeDate(-60),
        status: 'paid' as const,
        sentAt: relativeTimestamp(-75),
        paidAt: relativeTimestamp(-61),
        payment: { provider: 'simulated' as const, txRef: 'demo_tx_etb_4', confirmedAt: relativeTimestamp(-61) },
        taxRateBps: 0,
        notes: 'IT infrastructure dispatch.',
        items: [
          { description: 'Dedicated IT equipment haulage', quantityMilli: 1000, unitPriceMinor: 8500000 },
        ],
      },
      // 5. Sent - Not overdue (ETB)
      {
        clientId: seededClients[0].id,
        currency: 'ETB' as const,
        issueDate: relativeDate(-3),
        dueDate: relativeDate(12),
        status: 'sent' as const,
        sentAt: relativeTimestamp(-3),
        taxRateBps: 1500,
        notes: 'Payment due within 15 days.',
        items: [
          { description: 'Scheduled logistics convoy support', quantityMilli: 1500, unitPriceMinor: 3000000 },
          { description: 'Security escort fees', quantityMilli: 1000, unitPriceMinor: 1000000 },
        ],
      },
      // 6. Sent - OVERDUE (ETB) (due 5 days ago)
      {
        clientId: seededClients[4].id,
        currency: 'ETB' as const,
        issueDate: relativeDate(-25),
        dueDate: relativeDate(-5),
        status: 'sent' as const,
        sentAt: relativeTimestamp(-25),
        taxRateBps: 1500,
        notes: 'OVERDUE: Immediate settlement requested.',
        items: [
          { description: 'Legal document express couriering', quantityMilli: 1000, unitPriceMinor: 3500000 },
        ],
      },
      // 7. Draft (ETB)
      {
        clientId: seededClients[2].id,
        currency: 'ETB' as const,
        issueDate: todayStr,
        dueDate: relativeDate(14),
        status: 'draft' as const,
        taxRateBps: 1500,
        notes: 'Draft quote under review.',
        items: [
          { description: 'Seasonal harvest distribution planning', quantityMilli: 1000, unitPriceMinor: 5000000 },
        ],
      },
      // 8. Void (ETB)
      {
        clientId: seededClients[1].id,
        currency: 'ETB' as const,
        issueDate: relativeDate(-20),
        dueDate: relativeDate(-5),
        status: 'void' as const,
        sentAt: relativeTimestamp(-20),
        voidedAt: relativeTimestamp(-15),
        taxRateBps: 1500,
        notes: 'Order cancelled by mutual agreement.',
        items: [
          { description: 'Cancelled route freight assignment', quantityMilli: 1000, unitPriceMinor: 4000000 },
        ],
      },

      // --- USD Invoices ---
      // 9. Paid this month (USD)
      {
        clientId: seededClients[3].id,
        currency: 'USD' as const,
        issueDate: relativeDate(-12),
        dueDate: relativeDate(2),
        status: 'paid' as const,
        sentAt: relativeTimestamp(-12),
        paidAt: relativeTimestamp(-3),
        payment: { provider: 'simulated' as const, txRef: 'demo_tx_usd_1', confirmedAt: relativeTimestamp(-3) },
        taxRateBps: 0,
        notes: 'International IT consulting retainer.',
        items: [
          { description: 'Cross-border software logistics and cloud sync', quantityMilli: 1000, unitPriceMinor: 250000 }, // $2,500.00
        ],
      },
      // 10. Paid 1 month ago (USD)
      {
        clientId: seededClients[1].id,
        currency: 'USD' as const,
        issueDate: relativeDate(-40),
        dueDate: relativeDate(-20),
        status: 'paid' as const,
        sentAt: relativeTimestamp(-40),
        paidAt: relativeTimestamp(-22),
        payment: { provider: 'simulated' as const, txRef: 'demo_tx_usd_2', confirmedAt: relativeTimestamp(-22) },
        taxRateBps: 0,
        notes: 'Air freight express forwarding.',
        items: [
          { description: 'Direct air cargo consignment (NBO -> ADD)', quantityMilli: 1000, unitPriceMinor: 180000 }, // $1,800.00
        ],
      },
      // 11. Paid 3 months ago (USD)
      {
        clientId: seededClients[0].id,
        currency: 'USD' as const,
        issueDate: relativeDate(-100),
        dueDate: relativeDate(-80),
        status: 'paid' as const,
        sentAt: relativeTimestamp(-100),
        paidAt: relativeTimestamp(-81),
        payment: { provider: 'simulated' as const, txRef: 'demo_tx_usd_3', confirmedAt: relativeTimestamp(-81) },
        taxRateBps: 0,
        notes: 'Quarterly customs facilitation.',
        items: [
          { description: 'International customs compliance audit', quantityMilli: 1000, unitPriceMinor: 320000 }, // $3,200.00
        ],
      },
      // 12. Sent - Not overdue (USD)
      {
        clientId: seededClients[3].id,
        currency: 'USD' as const,
        issueDate: relativeDate(-4),
        dueDate: relativeDate(11),
        status: 'sent' as const,
        sentAt: relativeTimestamp(-4),
        taxRateBps: 0,
        notes: 'Net 15 terms.',
        items: [
          { description: 'Cloud architecture deployment logistics', quantityMilli: 1000, unitPriceMinor: 150000 }, // $1,500.00
        ],
      },
      // 13. Sent - Not overdue (USD)
      {
        clientId: seededClients[1].id,
        currency: 'USD' as const,
        issueDate: relativeDate(-2),
        dueDate: relativeDate(18),
        status: 'sent' as const,
        sentAt: relativeTimestamp(-2),
        taxRateBps: 0,
        notes: 'Regional maritime clearance.',
        items: [
          { description: 'Port clearance and logistics manifest oversight', quantityMilli: 1000, unitPriceMinor: 120000 }, // $1,200.00
        ],
      },
      // 14. Sent - OVERDUE (USD) (due 8 days ago)
      {
        clientId: seededClients[4].id,
        currency: 'USD' as const,
        issueDate: relativeDate(-30),
        dueDate: relativeDate(-8),
        status: 'sent' as const,
        sentAt: relativeTimestamp(-30),
        taxRateBps: 0,
        notes: 'OVERDUE NOTICE: Payment was due 8 days ago.',
        items: [
          { description: 'Expedited diplomatic freight pouch delivery', quantityMilli: 1000, unitPriceMinor: 95000 }, // $950.00
        ],
      },
      // 15. Draft (USD)
      {
        clientId: seededClients[0].id,
        currency: 'USD' as const,
        issueDate: todayStr,
        dueDate: relativeDate(30),
        status: 'draft' as const,
        taxRateBps: 0,
        notes: 'Upcoming international fleet expansion contract.',
        items: [
          { description: 'Fleet expansion advisory services', quantityMilli: 1000, unitPriceMinor: 400000 }, // $4,000.00
        ],
      },
    ];

    let invoicesCreated = 0;
    let paymentsCreated = 0;

    for (const plan of invoicesPlan) {
      await createInvoiceService(client, {
        businessId,
        clientId: plan.clientId,
        currency: plan.currency,
        issueDate: plan.issueDate,
        dueDate: plan.dueDate,
        taxRateBps: plan.taxRateBps,
        notes: plan.notes,
        items: plan.items,
        status: plan.status,
        sentAt: plan.sentAt,
        paidAt: plan.paidAt,
        voidedAt: (plan as any).voidedAt,
        payment: (plan as any).payment,
      });
      invoicesCreated++;
      if (plan.status === 'paid' && (plan as any).payment) {
        paymentsCreated++;
      }
    }

    await client.query('COMMIT');

    logger.info('Demo seed completed successfully', {
      businessId,
      clientsCount: seededClients.length,
      invoicesCount: invoicesCreated,
      paymentsCount: paymentsCreated,
    });

    return {
      userId,
      userEmail: DEMO_CONFIG.EMAIL,
      businessId,
      businessName: DEMO_CONFIG.BUSINESS_NAME,
      clientsCreated: seededClients.length,
      invoicesCreated,
      paymentsCreated,
      alreadySeeded: false,
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to seed demo data', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

// CLI Execution entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const allowPortfolioDemoSeed =
    process.env.ALLOW_PORTFOLIO_DEMO_SEED === 'true' ||
    args.includes('--allow-portfolio-demo-seed');

  seedDemo({ force, allowPortfolioDemoSeed })
    .then((result) => {
      console.log('----------------------------------------------------');
      console.log('Goom Invoice: Demo Seed Summary');
      console.log('----------------------------------------------------');
      if (result.alreadySeeded) {
        console.log(`Demo account (${result.userEmail}) is already seeded.`);
      } else {
        console.log(`Demo Owner:   ${result.userEmail}`);
        console.log(`Business:     ${result.businessName} (ID: ${result.businessId})`);
        console.log(`Clients:      ${result.clientsCreated} created`);
        console.log(`Invoices:     ${result.invoicesCreated} created`);
        console.log(`Payments:     ${result.paymentsCreated} recorded`);
      }
      console.log('----------------------------------------------------');
      console.log(`Demo Login:   ${DEMO_CONFIG.EMAIL}`);
      console.log(`Password:     ${DEMO_CONFIG.PASSWORD}`);
      console.log('----------------------------------------------------');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Demo seed execution failed:', err.message);
      process.exit(1);
    });
}
