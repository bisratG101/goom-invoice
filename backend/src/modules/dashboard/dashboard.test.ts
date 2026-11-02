import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { getDbPool, closeDbPool } from '../../db/pool';
import { createTestDbHelper, TestDbHelper } from '../../db/testDb';
import { signUserToken } from '../../utils/jwt';
import { determineCurrenciesInUse } from './dashboard.routes';

describe('Dashboard Currencies Unit & Logic Tests (Always runs)', () => {
  it('falls back to business default currency when no invoices exist (ETB default)', () => {
    const currencies = determineCurrenciesInUse('ETB', []);
    expect(currencies).toEqual(['ETB']);
  });

  it('falls back to business default currency when no invoices exist (USD default)', () => {
    const currencies = determineCurrenciesInUse('USD', []);
    expect(currencies).toEqual(['USD']);
  });

  it('recognizes ETB-only invoices for ETB business', () => {
    const currencies = determineCurrenciesInUse('ETB', ['ETB', 'ETB']);
    expect(currencies).toEqual(['ETB']);
  });

  it('recognizes USD-only invoices for USD business', () => {
    const currencies = determineCurrenciesInUse('USD', ['USD', 'USD']);
    expect(currencies).toEqual(['USD']);
  });

  it('recognizes historical USD invoice even when default currency is ETB and current invoices are ETB', () => {
    const currencies = determineCurrenciesInUse('ETB', ['USD', 'ETB']);
    expect(currencies).toContain('ETB');
    expect(currencies).toContain('USD');
    expect(currencies.length).toBe(2);
  });

  it('recognizes historical ETB invoice when default currency is USD', () => {
    const currencies = determineCurrenciesInUse('USD', ['ETB']);
    expect(currencies).toEqual(['USD', 'ETB']);
  });

  it('preserves tenant isolation by only using provided business invoice currencies', () => {
    // Tenant A (ETB default, only ETB invoices)
    const tenantACurrencies = determineCurrenciesInUse('ETB', ['ETB']);
    // Tenant B (USD default, only USD invoices)
    const tenantBCurrencies = determineCurrenciesInUse('USD', ['USD']);

    expect(tenantACurrencies).toEqual(['ETB']);
    expect(tenantBCurrencies).toEqual(['USD']);
    expect(tenantACurrencies).not.toContain('USD');
    expect(tenantBCurrencies).not.toContain('ETB');
  });

  it('handles undefined or unexpected default currency safely', () => {
    const currencies = determineCurrenciesInUse(undefined, ['USD']);
    expect(currencies).toContain('ETB'); // default fallback
    expect(currencies).toContain('USD');
  });
});

const testDbUrl = process.env.TEST_DATABASE_URL;
const describeDb = testDbUrl ? describe : describe.skip;

describeDb('Dashboard Integration Tests (Live PostgreSQL)', { timeout: 30000 }, () => {
  let dbHelper: TestDbHelper;
  let ownerToken: string;
  let otherOwnerToken: string;
  let businessId: string;
  let otherBusinessId: string;
  let clientId: string;

  beforeAll(async () => {
    dbHelper = createTestDbHelper(testDbUrl!);
    await closeDbPool();
    await dbHelper.resetSchema();
  }, 30000);

  beforeEach(async () => {
    await dbHelper.cleanTables();
    const pool = getDbPool();

    // Primary test user with business in Africa/Addis_Ababa
    const u1 = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ('dashboard-owner@goom.com', 'hash', 'Dashboard Owner')
       RETURNING id, email`
    );
    const b1 = await pool.query(
      `INSERT INTO businesses (owner_id, name, default_currency, invoice_prefix, timezone)
       VALUES ($1, 'Goom Dashboard Ltd', 'ETB', 'DB', 'Africa/Addis_Ababa')
       RETURNING id`,
      [u1.rows[0].id]
    );
    ownerToken = signUserToken({ userId: u1.rows[0].id, email: u1.rows[0].email });
    businessId = b1.rows[0].id;

    // Client for business 1
    const c1 = await pool.query(
      `INSERT INTO clients (business_id, name)
       VALUES ($1, 'Primary Client')
       RETURNING id`,
      [businessId]
    );
    clientId = c1.rows[0].id;

    // Other business for tenant isolation
    const u2 = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ('other-owner@goom.com', 'hash', 'Other Owner')
       RETURNING id, email`
    );
    const b2 = await pool.query(
      `INSERT INTO businesses (owner_id, name, default_currency, invoice_prefix, timezone)
       VALUES ($1, 'Other Business', 'USD', 'OTH', 'UTC')
       RETURNING id`,
      [u2.rows[0].id]
    );
    otherOwnerToken = signUserToken({ userId: u2.rows[0].id, email: u2.rows[0].email });
    otherBusinessId = b2.rows[0].id;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.close();
    }
    await closeDbPool();
  });

  /**
   * Hand-calculated dataset:
   *
   * Business Timezone: Africa/Addis_Ababa (UTC+3)
   * As of current execution:
   *
   * Invoices seeded:
   * 1. ETB - Sent, due today + 5 days (NOT overdue):
   *    total_minor: 100,000 (1,000.00 ETB)
   * 2. ETB - Sent, due yesterday (OVERDUE):
   *    total_minor: 50,000 (500.00 ETB)
   * 3. ETB - Paid this month:
   *    total_minor: 250,000 (2,500.00 ETB)
   *    paid_at: within current month in Africa/Addis_Ababa
   * 4. ETB - Paid last month:
   *    total_minor: 150,000 (1,500.00 ETB)
   *    paid_at: 45 days ago
   * 5. ETB - Draft (must be excluded from summary and revenue):
   *    total_minor: 80,000
   * 6. ETB - Void (must be excluded from outstanding/paid):
   *    total_minor: 30,000
   *
   * 7. USD - Sent, due today + 10 days (NOT overdue):
   *    total_minor: 40,000 ($400.00 USD)
   * 8. USD - Sent, due 3 days ago (OVERDUE):
   *    total_minor: 60,000 ($600.00 USD)
   * 9. USD - Paid this month:
   *    total_minor: 90,000 ($900.00 USD)
   *
   * Expected Summary:
   * ETB:
   * - outstanding: 100,000 + 50,000 = 150,000
   * - overdue: 50,000
   * - paidThisMonth: 250,000
   *
   * USD:
   * - outstanding: 40,000 + 60,000 = 100,000
   * - overdue: 60,000
   * - paidThisMonth: 90,000
   */
  async function seedTestDataset(pool: any) {
    // Determine current date in Africa/Addis_Ababa
    const dateRes = await pool.query(
      `SELECT
        (now() AT TIME ZONE 'Africa/Addis_Ababa')::date AS today_tz,
        ((now() AT TIME ZONE 'Africa/Addis_Ababa')::date - 1) AS yesterday_tz,
        ((now() AT TIME ZONE 'Africa/Addis_Ababa')::date + 5) AS future_tz,
        ((now() AT TIME ZONE 'Africa/Addis_Ababa')::date - 3) AS past_3d_tz,
        ((now() AT TIME ZONE 'Africa/Addis_Ababa')::date + 10) AS future_10d_tz,
        date_trunc('month', now() AT TIME ZONE 'Africa/Addis_Ababa') AT TIME ZONE 'Africa/Addis_Ababa' AS start_of_this_month,
        (date_trunc('month', now() AT TIME ZONE 'Africa/Addis_Ababa') - interval '1 month') AT TIME ZONE 'Africa/Addis_Ababa' AS last_month_date`
    );
    const d = dateRes.rows[0];

    // 1. ETB Sent not overdue
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at)
       VALUES ($1, $2, 1, 'ETB', 'sent', $3, $4, 100000, 0, 100000, 'tok-1', now())`,
      [businessId, clientId, d.yesterday_tz, d.future_tz]
    );

    // 2. ETB Sent OVERDUE (due yesterday)
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at)
       VALUES ($1, $2, 2, 'ETB', 'sent', $3, $4, 50000, 0, 50000, 'tok-2', now())`,
      [businessId, clientId, d.past_3d_tz, d.yesterday_tz]
    );

    // 3. ETB Paid this month
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at, paid_at)
       VALUES ($1, $2, 3, 'ETB', 'paid', $3, $4, 250000, 0, 250000, 'tok-3', now(), now())`,
      [businessId, clientId, d.yesterday_tz, d.future_tz]
    );

    // 4. ETB Paid last month
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at, paid_at)
       VALUES ($1, $2, 4, 'ETB', 'paid', $3, $4, 150000, 0, 150000, 'tok-4', now(), $5)`,
      [businessId, clientId, d.yesterday_tz, d.future_tz, d.last_month_date]
    );

    // 5. ETB Draft
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token)
       VALUES ($1, $2, NULL, 'ETB', 'draft', $3, $4, 80000, 0, 80000, 'tok-5')`,
      [businessId, clientId, d.yesterday_tz, d.future_tz]
    );

    // 6. ETB Void
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at, voided_at)
       VALUES ($1, $2, 5, 'ETB', 'void', $3, $4, 30000, 0, 30000, 'tok-6', now(), now())`,
      [businessId, clientId, d.yesterday_tz, d.future_tz]
    );

    // 7. USD Sent not overdue
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at)
       VALUES ($1, $2, 6, 'USD', 'sent', $3, $4, 40000, 0, 40000, 'tok-7', now())`,
      [businessId, clientId, d.yesterday_tz, d.future_10d_tz]
    );

    // 8. USD Sent OVERDUE
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at)
       VALUES ($1, $2, 7, 'USD', 'sent', $3, $4, 60000, 0, 60000, 'tok-8', now())`,
      [businessId, clientId, d.past_3d_tz, d.past_3d_tz]
    );

    // 9. USD Paid this month
    await pool.query(
      `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at, paid_at)
       VALUES ($1, $2, 8, 'USD', 'paid', $3, $4, 90000, 0, 90000, 'tok-9', now(), now())`,
      [businessId, clientId, d.yesterday_tz, d.future_tz]
    );
  }

  describe('GET /api/v1/dashboard/summary', () => {
    it('returns exact hand-calculated per-currency outstanding, overdue, and paid-this-month figures', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const summary = res.body.summary;

      // ETB assertions
      expect(summary.ETB.outstandingMinor).toBe(150000);
      expect(summary.ETB.overdueMinor).toBe(50000);
      expect(summary.ETB.paidThisMonthMinor).toBe(250000);

      // USD assertions
      expect(summary.USD.outstandingMinor).toBe(100000);
      expect(summary.USD.overdueMinor).toBe(60000);
      expect(summary.USD.paidThisMonthMinor).toBe(90000);

      // Currencies in use and hasInvoices assertions
      expect(res.body.currenciesInUse).toContain('ETB');
      expect(res.body.currenciesInUse).toContain('USD');
      expect(res.body.hasInvoices).toBe(true);
    });

    it('returns default currency and hasInvoices=false when business has no invoices', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.currenciesInUse).toEqual(['ETB']);
      expect(res.body.hasInvoices).toBe(false);
      expect(res.body.summary.ETB.outstandingMinor).toBe(0);
      expect(res.body.summary.USD.outstandingMinor).toBe(0);
    });

    it('strictly preserves tenant isolation for currencies and invoices', async () => {
      const pool = getDbPool();
      // Insert a client for otherBusinessId first to satisfy foreign key & not-null constraints
      const otherClientRes = await pool.query(
        `INSERT INTO clients (business_id, name)
         VALUES ($1, 'Other Business Client')
         RETURNING id`,
        [otherBusinessId]
      );
      const otherClientId = otherClientRes.rows[0].id;

      // Insert a USD invoice for otherBusinessId
      await pool.query(
        `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at)
         VALUES ($1, $2, 1, 'USD', 'sent', CURRENT_DATE, CURRENT_DATE + 5, 50000, 0, 50000, 'tok-other-usd', now())`,
        [otherBusinessId, otherClientId]
      );

      // Business 1 (default ETB, no invoices) should NOT see USD
      const res1 = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res1.status).toBe(200);
      expect(res1.body.currenciesInUse).toEqual(['ETB']);
      expect(res1.body.hasInvoices).toBe(false);

      // Other Business (default USD, has USD invoice) should see USD and hasInvoices=true
      const res2 = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${otherOwnerToken}`);
      expect(res2.status).toBe(200);
      expect(res2.body.currenciesInUse).toEqual(['USD']);
      expect(res2.body.hasInvoices).toBe(true);
    });

    it('verifies overdue boundary: due today is NOT overdue, yesterday IS overdue', async () => {
      const pool = getDbPool();
      const dateRes = await pool.query(
        `SELECT
          (now() AT TIME ZONE 'Africa/Addis_Ababa')::date AS today_tz,
          ((now() AT TIME ZONE 'Africa/Addis_Ababa')::date - 1) AS yesterday_tz`
      );
      const { today_tz, yesterday_tz } = dateRes.rows[0];

      // Invoice due today
      await pool.query(
        `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at)
         VALUES ($1, $2, 10, 'ETB', 'sent', $3, $3, 11000, 0, 11000, 'tok-due-today', now())`,
        [businessId, clientId, today_tz]
      );

      // Invoice due yesterday
      await pool.query(
        `INSERT INTO invoices (business_id, client_id, number, currency, status, issue_date, due_date, subtotal_minor, tax_minor, total_minor, public_token, sent_at)
         VALUES ($1, $2, 11, 'ETB', 'sent', $3, $3, 22000, 0, 22000, 'tok-due-yesterday', now())`,
        [businessId, clientId, yesterday_tz]
      );

      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      // Both are outstanding: 11000 + 22000 = 33000
      expect(res.body.summary.ETB.outstandingMinor).toBe(33000);
      // Only yesterday is overdue: 22000
      expect(res.body.summary.ETB.overdueMinor).toBe(22000);
    });

    it('isolates summary data by business tenant', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      // Other business requests summary (must be 0 for all figures)
      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${otherOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.ETB.outstandingMinor).toBe(0);
      expect(res.body.summary.ETB.overdueMinor).toBe(0);
      expect(res.body.summary.ETB.paidThisMonthMinor).toBe(0);
      expect(res.body.summary.USD.outstandingMinor).toBe(0);
      expect(res.body.summary.USD.overdueMinor).toBe(0);
      expect(res.body.summary.USD.paidThisMonthMinor).toBe(0);
    });
  });

  describe('GET /api/v1/dashboard/revenue', () => {
    it('returns monthly revenue series for the default 6 months without combining currencies', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      const res = await request(app)
        .get('/api/v1/dashboard/revenue')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.months).toBe(6);
      expect(res.body.revenue.ETB.length).toBe(6);
      expect(res.body.revenue.USD.length).toBe(6);

      // Current month revenue in ETB should be 250,000 (invoice 3)
      const currentMonthIndex = res.body.revenue.ETB.length - 1;
      expect(res.body.revenue.ETB[currentMonthIndex].revenueMinor).toBe(250000);

      // Last month revenue in ETB should be 150,000 (invoice 4)
      const lastMonthIndex = currentMonthIndex - 1;
      expect(res.body.revenue.ETB[lastMonthIndex].revenueMinor).toBe(150000);

      // Current month revenue in USD should be 90,000 (invoice 9)
      expect(res.body.revenue.USD[currentMonthIndex].revenueMinor).toBe(90000);
    });

    it('validates months query parameter (1 to 24)', async () => {
      const bad0 = await request(app)
        .get('/api/v1/dashboard/revenue?months=0')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(bad0.status).toBe(400);
      expect(bad0.body.error.code).toBe('INVALID_MONTHS_PARAMETER');

      const bad25 = await request(app)
        .get('/api/v1/dashboard/revenue?months=25')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(bad25.status).toBe(400);

      const badStr = await request(app)
        .get('/api/v1/dashboard/revenue?months=invalid')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(badStr.status).toBe(400);

      const valid3 = await request(app)
        .get('/api/v1/dashboard/revenue?months=3')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(valid3.status).toBe(200);
      expect(valid3.body.months).toBe(3);
      expect(valid3.body.revenue.ETB.length).toBe(3);
    });
  });

  describe('GET /api/v1/dashboard/analytics', () => {
    it('validates period query parameter (7d, 30d, 3m, 6m, 12m, all)', async () => {
      const bad = await request(app)
        .get('/api/v1/dashboard/analytics?period=invalid')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('INVALID_PERIOD_PARAMETER');

      const badEmpty = await request(app)
        .get('/api/v1/dashboard/analytics?period=')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(badEmpty.status).toBe(400);
    });

    it('returns 6 monthly buckets by default with dual-metric series (paid and invoiced)', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      const res = await request(app)
        .get('/api/v1/dashboard/analytics')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('6m');
      expect(res.body.interval).toBe('month');
      expect(res.body.series.ETB.length).toBe(6);
      expect(res.body.series.USD.length).toBe(6);

      // Verify structure of points
      const etbLatest = res.body.series.ETB[res.body.series.ETB.length - 1];
      expect(etbLatest).toHaveProperty('key');
      expect(etbLatest).toHaveProperty('label');
      expect(etbLatest).toHaveProperty('paidMinor');
      expect(etbLatest).toHaveProperty('paidCount');
      expect(etbLatest).toHaveProperty('invoicedMinor');
      expect(etbLatest).toHaveProperty('invoicedCount');

      // Paid in current month for ETB should match invoice 3 (250,000)
      expect(etbLatest.paidMinor).toBe(250000);
      expect(etbLatest.paidCount).toBe(1);

      // Totals should be computed accurately
      expect(res.body.totals.ETB.totalPaidMinor).toBeGreaterThan(0);
      expect(res.body.totals.ETB.totalInvoicedMinor).toBeGreaterThan(0);
      expect(res.body.totals.ETB.collectionRatePercent).toBeGreaterThanOrEqual(0);
    });

    it('returns exactly 7 daily buckets for period=7d with interval day', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      const res = await request(app)
        .get('/api/v1/dashboard/analytics?period=7d')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('7d');
      expect(res.body.interval).toBe('day');
      expect(res.body.series.ETB.length).toBe(7);
      expect(res.body.series.USD.length).toBe(7);

      // Check daily bucket key format YYYY-MM-DD
      expect(res.body.series.ETB[0].key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns exactly 30 daily buckets for period=30d with interval day', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      const res = await request(app)
        .get('/api/v1/dashboard/analytics?period=30d')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.period).toBe('30d');
      expect(res.body.interval).toBe('day');
      expect(res.body.series.ETB.length).toBe(30);
      expect(res.body.series.USD.length).toBe(30);
    });

    it('supports 3m, 12m, and all periods', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      const res3m = await request(app)
        .get('/api/v1/dashboard/analytics?period=3m')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res3m.status).toBe(200);
      expect(res3m.body.period).toBe('3m');
      expect(res3m.body.series.ETB.length).toBe(3);

      const res12m = await request(app)
        .get('/api/v1/dashboard/analytics?period=12m')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res12m.status).toBe(200);
      expect(res12m.body.period).toBe('12m');
      expect(res12m.body.series.ETB.length).toBe(12);

      const resAll = await request(app)
        .get('/api/v1/dashboard/analytics?period=all')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resAll.status).toBe(200);
      expect(resAll.body.period).toBe('all');
      expect(resAll.body.series.ETB.length).toBeGreaterThanOrEqual(6);
    });

    it('strictly isolates analytics across businesses (tenant isolation)', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      // Fetch analytics for owner 1
      const res1 = await request(app)
        .get('/api/v1/dashboard/analytics?period=6m')
        .set('Authorization', `Bearer ${ownerToken}`);

      // Fetch analytics for owner 2
      const res2 = await request(app)
        .get('/api/v1/dashboard/analytics?period=6m')
        .set('Authorization', `Bearer ${otherOwnerToken}`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Business 2 has no paid invoices seeded, so totalPaidMinor must be 0
      expect(res2.body.totals.ETB.totalPaidMinor).toBe(0);
      expect(res2.body.totals.USD.totalPaidMinor).toBe(0);
      expect(res1.body.totals.ETB.totalPaidMinor).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/dashboard/activity', () => {
    it('returns the latest 10 events ordered by timestamp newest first', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      const res = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      const activity = res.body.activity;
      expect(Array.isArray(activity)).toBe(true);
      expect(activity.length).toBeLessThanOrEqual(10);
      expect(activity.length).toBeGreaterThan(0);

      // Assert chronological descending order
      for (let i = 0; i < activity.length - 1; i++) {
        const t1 = new Date(activity[i].timestamp).getTime();
        const t2 = new Date(activity[i + 1].timestamp).getTime();
        expect(t1).toBeGreaterThanOrEqual(t2);
      }

      // Assert event structure
      const item = activity[0];
      expect(item).toHaveProperty('invoiceId');
      expect(item).toHaveProperty('displayNumber');
      expect(item).toHaveProperty('clientName');
      expect(item).toHaveProperty('currency');
      expect(item).toHaveProperty('totalMinor');
      expect(item).toHaveProperty('eventType');
      expect(item).toHaveProperty('timestamp');
      expect(['sent', 'paid', 'voided']).toContain(item.eventType);
    });

    it('strictly enforces tenant isolation on GET /api/v1/dashboard/activity', async () => {
      const pool = getDbPool();
      await seedTestDataset(pool);

      // ownerToken should see activities for businessId
      const resA = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resA.status).toBe(200);
      expect(resA.body.activity.length).toBeGreaterThan(0);

      // otherOwnerToken should NOT see any activities from businessId
      const resB = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Authorization', `Bearer ${otherOwnerToken}`);
      expect(resB.status).toBe(200);
      expect(resB.body.activity).toEqual([]);
    });
  });
});
