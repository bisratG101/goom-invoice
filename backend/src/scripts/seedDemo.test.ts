import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { getDbPool, closeDbPool } from '../db/pool';
import { createTestDbHelper, TestDbHelper } from '../db/testDb';
import { signUserToken } from '../utils/jwt';
import {
  seedDemo,
  DEMO_CONFIG,
  createClientService,
  createInvoiceService,
  verifyDemoDataset,
} from './seedDemo';
import { env } from '../config/env';

function buildDatasetMock(overrides: {
  clientsCount?: number;
  invoicesCount?: number;
  paymentsCount?: number;
  statusBreakdown?: Array<{ currency: string; status: string; count: string }>;
  paymentDetailsRows?: any[];
} = {}) {
  const clientsCount = overrides.clientsCount ?? 5;
  const invoicesCount = overrides.invoicesCount ?? 15;
  const paymentsCount = overrides.paymentsCount ?? 7;

  const defaultStatusBreakdown = [
    { currency: 'ETB', status: 'paid', count: '4' },
    { currency: 'ETB', status: 'sent', count: '2' },
    { currency: 'ETB', status: 'draft', count: '1' },
    { currency: 'ETB', status: 'void', count: '1' },
    { currency: 'USD', status: 'paid', count: '3' },
    { currency: 'USD', status: 'sent', count: '3' },
    { currency: 'USD', status: 'draft', count: '1' },
  ];

  const defaultPaymentDetails = [
    // 4 ETB paid
    { invoice_id: 'inv-etb-paid-1', invoice_status: 'paid', invoice_currency: 'ETB', invoice_total: '12075000', payment_id: 'p1', payment_provider: 'simulated', payment_status: 'succeeded', payment_currency: 'ETB', payment_amount: '12075000' },
    { invoice_id: 'inv-etb-paid-2', invoice_status: 'paid', invoice_currency: 'ETB', invoice_total: '6200000', payment_id: 'p2', payment_provider: 'simulated', payment_status: 'succeeded', payment_currency: 'ETB', payment_amount: '6200000' },
    { invoice_id: 'inv-etb-paid-3', invoice_status: 'paid', invoice_currency: 'ETB', invoice_total: '9660000', payment_id: 'p3', payment_provider: 'simulated', payment_status: 'succeeded', payment_currency: 'ETB', payment_amount: '9660000' },
    { invoice_id: 'inv-etb-paid-4', invoice_status: 'paid', invoice_currency: 'ETB', invoice_total: '8500000', payment_id: 'p4', payment_provider: 'simulated', payment_status: 'succeeded', payment_currency: 'ETB', payment_amount: '8500000' },
    // 2 ETB sent
    { invoice_id: 'inv-etb-sent-1', invoice_status: 'sent', invoice_currency: 'ETB', invoice_total: '6325000', payment_id: null, payment_provider: null, payment_status: null, payment_currency: null, payment_amount: null },
    { invoice_id: 'inv-etb-sent-2', invoice_status: 'sent', invoice_currency: 'ETB', invoice_total: '4025000', payment_id: null, payment_provider: null, payment_status: null, payment_currency: null, payment_amount: null },
    // 1 ETB draft
    { invoice_id: 'inv-etb-draft-1', invoice_status: 'draft', invoice_currency: 'ETB', invoice_total: '5750000', payment_id: null, payment_provider: null, payment_status: null, payment_currency: null, payment_amount: null },
    // 1 ETB void
    { invoice_id: 'inv-etb-void-1', invoice_status: 'void', invoice_currency: 'ETB', invoice_total: '4600000', payment_id: null, payment_provider: null, payment_status: null, payment_currency: null, payment_amount: null },
    // 3 USD paid
    { invoice_id: 'inv-usd-paid-1', invoice_status: 'paid', invoice_currency: 'USD', invoice_total: '250000', payment_id: 'p5', payment_provider: 'simulated', payment_status: 'succeeded', payment_currency: 'USD', payment_amount: '250000' },
    { invoice_id: 'inv-usd-paid-2', invoice_status: 'paid', invoice_currency: 'USD', invoice_total: '180000', payment_id: 'p6', payment_provider: 'simulated', payment_status: 'succeeded', payment_currency: 'USD', payment_amount: '180000' },
    { invoice_id: 'inv-usd-paid-3', invoice_status: 'paid', invoice_currency: 'USD', invoice_total: '320000', payment_id: 'p7', payment_provider: 'simulated', payment_status: 'succeeded', payment_currency: 'USD', payment_amount: '320000' },
    // 3 USD sent
    { invoice_id: 'inv-usd-sent-1', invoice_status: 'sent', invoice_currency: 'USD', invoice_total: '150000', payment_id: null, payment_provider: null, payment_status: null, payment_currency: null, payment_amount: null },
    { invoice_id: 'inv-usd-sent-2', invoice_status: 'sent', invoice_currency: 'USD', invoice_total: '120000', payment_id: null, payment_provider: null, payment_status: null, payment_currency: null, payment_amount: null },
    { invoice_id: 'inv-usd-sent-3', invoice_status: 'sent', invoice_currency: 'USD', invoice_total: '95000', payment_id: null, payment_provider: null, payment_status: null, payment_currency: null, payment_amount: null },
    // 1 USD draft
    { invoice_id: 'inv-usd-draft-1', invoice_status: 'draft', invoice_currency: 'USD', invoice_total: '400000', payment_id: null, payment_provider: null, payment_status: null, payment_currency: null, payment_amount: null },
  ];

  const statusBreakdown = overrides.statusBreakdown ?? defaultStatusBreakdown;
  const paymentDetails = overrides.paymentDetailsRows ?? defaultPaymentDetails;

  const mockClient = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('current_database()')) {
        return { rowCount: 1, rows: [{ current_db: 'goom_test', current_user: 'postgres' }] };
      }
      if (sql.includes('SELECT id, email FROM users')) {
        return { rowCount: 1, rows: [{ id: 'existing-demo-user', email: DEMO_CONFIG.EMAIL }] };
      }
      if (sql.includes('SELECT id, name FROM businesses')) {
        return { rowCount: 1, rows: [{ id: 'existing-demo-biz', name: DEMO_CONFIG.BUSINESS_NAME }] };
      }
      if (sql.includes('SELECT count(*)::int AS count FROM clients')) {
        return { rowCount: 1, rows: [{ count: String(clientsCount) }] };
      }
      if (sql.includes('SELECT count(*)::int AS count FROM invoices')) {
        return { rowCount: 1, rows: [{ count: String(invoicesCount) }] };
      }
      if (sql.includes('SELECT count(*)::int AS count FROM payments')) {
        return { rowCount: 1, rows: [{ count: String(paymentsCount) }] };
      }
      if (sql.includes('GROUP BY currency, status')) {
        return { rowCount: statusBreakdown.length, rows: statusBreakdown };
      }
      if (sql.includes('LEFT JOIN payments p ON p.invoice_id = i.id')) {
        return { rowCount: paymentDetails.length, rows: paymentDetails };
      }
      return { rowCount: 0, rows: [] };
    }),
    release: vi.fn(),
  };

  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
  } as any;

  return { mockClient, mockPool, defaultPaymentDetails };
}

// --- Unit & Guard Tests (Always Runs) ---
describe('Demo Seed - Unit & Guard Tests (always runs)', () => {
  let suiteOptIn: string | undefined;

  beforeEach(() => {
    suiteOptIn = process.env.ALLOW_PORTFOLIO_DEMO_SEED;
    process.env.ALLOW_PORTFOLIO_DEMO_SEED = 'true';
  });

  afterEach(() => {
    if (suiteOptIn === undefined) {
      delete process.env.ALLOW_PORTFOLIO_DEMO_SEED;
    } else {
      process.env.ALLOW_PORTFOLIO_DEMO_SEED = suiteOptIn;
    }
  });
  describe('Production Environment Safeguards & Execution Matrix', () => {
    let originalNodeEnv: string | undefined;
    let originalEnvNodeEnv: any;
    let originalDemoMode: boolean;
    let originalOptIn: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
      originalEnvNodeEnv = env.NODE_ENV;
      originalDemoMode = env.DEMO_MODE;
      originalOptIn = process.env.ALLOW_PORTFOLIO_DEMO_SEED;
      process.env.ALLOW_PORTFOLIO_DEMO_SEED = 'true';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      (env as any).NODE_ENV = originalEnvNodeEnv;
      (env as any).DEMO_MODE = originalDemoMode;
      if (originalOptIn === undefined) {
        delete process.env.ALLOW_PORTFOLIO_DEMO_SEED;
      } else {
        process.env.ALLOW_PORTFOLIO_DEMO_SEED = originalOptIn;
      }
    });

    it('refuses when production + DEMO_MODE=true', async () => {
      process.env.NODE_ENV = 'production';
      (env as any).NODE_ENV = 'production';
      (env as any).DEMO_MODE = true;

      const mockConnect = vi.fn();
      const mockPool = { connect: mockConnect } as any;

      await expect(seedDemo({ force: false, pool: mockPool })).rejects.toThrow(
        'FATAL SAFETY CHECK: Refusing to seed demo data when NODE_ENV is "production".'
      );
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('refuses when production + --force', async () => {
      process.env.NODE_ENV = 'production';
      (env as any).NODE_ENV = 'production';
      (env as any).DEMO_MODE = false;

      const mockConnect = vi.fn();
      const mockPool = { connect: mockConnect } as any;

      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow(
        'FATAL SAFETY CHECK: Refusing to seed demo data when NODE_ENV is "production".'
      );
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('refuses when production + DEMO_MODE=true + --force', async () => {
      process.env.NODE_ENV = 'production';
      (env as any).NODE_ENV = 'production';
      (env as any).DEMO_MODE = true;

      const mockConnect = vi.fn();
      const mockPool = { connect: mockConnect } as any;

      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow(
        'FATAL SAFETY CHECK: Refusing to seed demo data when NODE_ENV is "production".'
      );
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('allows execution when non-production + DEMO_MODE=true', async () => {
      process.env.NODE_ENV = 'development';
      (env as any).NODE_ENV = 'development';
      (env as any).DEMO_MODE = true;

      const { mockPool } = buildDatasetMock();
      const res = await seedDemo({ force: false, pool: mockPool });
      expect(res.alreadySeeded).toBe(true);
      expect(mockPool.connect).toHaveBeenCalled();
    });

    it('allows execution when non-production + --force', async () => {
      process.env.NODE_ENV = 'development';
      (env as any).NODE_ENV = 'development';
      (env as any).DEMO_MODE = false;

      const { mockPool } = buildDatasetMock();
      const res = await seedDemo({ force: true, pool: mockPool });
      expect(res.alreadySeeded).toBe(true);
      expect(mockPool.connect).toHaveBeenCalled();
    });
  });

  it('refuses to run when DEMO_MODE is false and force is false or omitted in non-production', async () => {
    const originalDemoMode = env.DEMO_MODE;
    (env as any).DEMO_MODE = false;

    try {
      await expect(seedDemo({ force: false })).rejects.toThrow(
        'Demo seed refused: DEMO_MODE is not true and --force was not supplied.'
      );
    } finally {
      (env as any).DEMO_MODE = originalDemoMode;
    }
  });

  it('fails with clear error if database pool is unavailable', async () => {
    const originalDemoMode = env.DEMO_MODE;
    const originalDbUrl = env.DATABASE_URL;
    (env as any).DEMO_MODE = true;
    (env as any).DATABASE_URL = undefined;
    await closeDbPool();

    try {
      await expect(seedDemo({ force: false, pool: null as any })).rejects.toThrow(
        'Database connection unavailable for seeding demo data.'
      );
    } finally {
      (env as any).DEMO_MODE = originalDemoMode;
      (env as any).DATABASE_URL = originalDbUrl;
    }
  });

  describe('createClientService', () => {
    it('trims whitespace and stores client with businessId scoping', async () => {
      const mockQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 'client-1', name: 'Test Client' }],
      });
      const mockClient = { query: mockQuery };

      const result = await createClientService(mockClient, {
        businessId: 'biz-1',
        name: '  Test Client  ',
        email: '  test@example.com  ',
        phone: '  +251911223344 ',
        address: '  Bole Road ',
      });

      expect(result).toEqual({ id: 'client-1', name: 'Test Client' });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO clients');
      expect(params).toEqual(['biz-1', 'Test Client', 'test@example.com', '+251911223344', 'Bole Road']);
    });
  });

  describe('createInvoiceService', () => {
    it('calculates subtotal, tax, and total using exact integer minor units without float arithmetic', async () => {
      const mockQueries: Array<{ sql: string; params?: any[] }> = [];
      const mockClient = {
        query: vi.fn(async (sql: string, params?: any[]) => {
          mockQueries.push({ sql, params });
          if (sql.includes('INSERT INTO invoices')) {
            return { rows: [{ id: 'inv-123' }] };
          }
          if (sql.includes('UPDATE invoice_counters')) {
            return { rows: [{ last_number: 1 }] };
          }
          return { rows: [] };
        }),
      };

      // 2.500 units @ 100.50 ETB (10050 minor) -> 25,125 minor (251.25 ETB)
      // taxRateBps = 1500 (15%) -> round((25125 * 1500) / 10000) = round(3768.75) = 3769
      // totalMinor = 25125 + 3769 = 28894
      const res = await createInvoiceService(mockClient, {
        businessId: 'biz-1',
        clientId: 'client-1',
        currency: 'ETB',
        issueDate: '2026-10-01',
        dueDate: '2026-10-15',
        taxRateBps: 1500,
        status: 'sent',
        sentAt: new Date('2026-10-01T10:00:00Z'),
        items: [
          { description: 'Transport freight', quantityMilli: 2500, unitPriceMinor: 10050 },
        ],
      });

      expect(res.id).toBe('inv-123');
      expect(res.number).toBe(1);
      expect(res.totalMinor).toBe(28894);
      expect(res.publicToken).toHaveLength(43); // 32 bytes base64url

      // Check invoice insert query
      const invoiceInsert = mockQueries.find((q) => q.sql.includes('INSERT INTO invoices'));
      expect(invoiceInsert).toBeDefined();
      expect(invoiceInsert!.params).toContain(25125); // subtotal_minor
      expect(invoiceInsert!.params).toContain(3769);  // tax_minor
      expect(invoiceInsert!.params).toContain(28894); // total_minor
    });

    it('assigns null invoice number for draft invoices and does not bump counter', async () => {
      const mockQueries: Array<{ sql: string; params?: any[] }> = [];
      const mockClient = {
        query: vi.fn(async (sql: string, params?: any[]) => {
          mockQueries.push({ sql, params });
          if (sql.includes('INSERT INTO invoices')) {
            return { rows: [{ id: 'draft-inv-1' }] };
          }
          return { rows: [] };
        }),
      };

      const res = await createInvoiceService(mockClient, {
        businessId: 'biz-1',
        clientId: 'client-1',
        currency: 'USD',
        issueDate: '2026-10-10',
        dueDate: '2026-10-24',
        status: 'draft',
        items: [
          { description: 'Consulting item', quantityMilli: 1000, unitPriceMinor: 50000 },
        ],
      });

      expect(res.id).toBe('draft-inv-1');
      expect(res.number).toBeNull();
      // Counter should NOT be queried
      const counterQuery = mockQueries.find((q) => q.sql.includes('invoice_counters'));
      expect(counterQuery).toBeUndefined();
    });

    it('creates payments record when invoice status is paid with payment info', async () => {
      const mockQueries: Array<{ sql: string; params?: any[] }> = [];
      const mockClient = {
        query: vi.fn(async (sql: string, params?: any[]) => {
          mockQueries.push({ sql, params });
          if (sql.includes('INSERT INTO invoices')) {
            return { rows: [{ id: 'paid-inv-1' }] };
          }
          if (sql.includes('UPDATE invoice_counters')) {
            return { rows: [{ last_number: 2 }] };
          }
          return { rows: [] };
        }),
      };

      const paymentDate = new Date('2026-10-12T14:00:00Z');
      const res = await createInvoiceService(mockClient, {
        businessId: 'biz-1',
        clientId: 'client-1',
        currency: 'ETB',
        issueDate: '2026-10-01',
        dueDate: '2026-10-15',
        status: 'paid',
        sentAt: new Date('2026-10-01T10:00:00Z'),
        paidAt: paymentDate,
        payment: {
          provider: 'simulated',
          txRef: 'demo_tx_unit_test',
          confirmedAt: paymentDate,
        },
        items: [
          { description: 'Courier service', quantityMilli: 1000, unitPriceMinor: 100000 },
        ],
      });

      expect(res.id).toBe('paid-inv-1');
      expect(res.number).toBe(2);

      // Verify payment insert query
      const paymentInsert = mockQueries.find((q) => q.sql.includes('INSERT INTO payments'));
      expect(paymentInsert).toBeDefined();
      expect(paymentInsert!.sql).toContain("'succeeded'");
      expect(paymentInsert!.params).toContain('paid-inv-1');
      expect(paymentInsert!.params).toContain('simulated');
      expect(paymentInsert!.params).toContain('demo_tx_unit_test');
      expect(paymentInsert!.params).toContain(100000);
      expect(paymentInsert!.params).toContain('ETB');
    });
  });

  describe('seedDemo unit workflow with mock pool', () => {
    it('executes full seeding flow on empty database and creates demo accounts and 15 invoices', async () => {
      const executedSqls: string[] = [];
      let invoiceCounter = 0;

      const mockClient = {
        query: vi.fn(async (sql: string, params?: any[]) => {
          executedSqls.push(sql);
          if (sql.includes('current_database()')) {
            return { rowCount: 1, rows: [{ current_db: 'goom_test', current_user: 'postgres' }] };
          }
          if (sql.includes('SELECT id, email FROM users')) {
            return { rowCount: 0, rows: [] };
          }
          if (sql.includes('INSERT INTO users')) {
            return { rowCount: 1, rows: [{ id: 'user-demo-1', email: DEMO_CONFIG.EMAIL }] };
          }
          if (sql.includes('INSERT INTO businesses')) {
            return { rowCount: 1, rows: [{ id: 'biz-demo-1' }] };
          }
          // Empty check for verifyDemoDataset
          if (sql.includes('SELECT count(*)::int AS count FROM clients')) {
            return { rowCount: 1, rows: [{ count: '0' }] };
          }
          if (sql.includes('SELECT count(*)::int AS count FROM invoices')) {
            return { rowCount: 1, rows: [{ count: '0' }] };
          }
          if (sql.includes('SELECT count(*)::int AS count FROM payments')) {
            return { rowCount: 1, rows: [{ count: '0' }] };
          }
          if (sql.includes('SELECT id, name FROM clients WHERE business_id = $1')) {
            return { rowCount: 0, rows: [] };
          }
          if (sql.includes('INSERT INTO clients')) {
            return { rowCount: 1, rows: [{ id: `client-${params?.[1]}`, name: params?.[1] }] };
          }
          if (sql.includes('UPDATE invoice_counters')) {
            invoiceCounter++;
            return { rowCount: 1, rows: [{ last_number: invoiceCounter }] };
          }
          if (sql.includes('INSERT INTO invoices')) {
            return { rowCount: 1, rows: [{ id: `inv-${invoiceCounter}` }] };
          }
          return { rowCount: 1, rows: [] };
        }),
        release: vi.fn(),
      };

      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      } as any;

      const result = await seedDemo({ force: true, pool: mockPool });

      expect(result.alreadySeeded).toBe(false);
      expect(result.userId).toBe('user-demo-1');
      expect(result.businessId).toBe('biz-demo-1');
      expect(result.clientsCreated).toBe(5);
      expect(result.invoicesCreated).toBe(15);
      expect(result.paymentsCreated).toBe(7);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back transaction and releases client if an error occurs during seeding', async () => {
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('current_database()')) {
            return { rowCount: 1, rows: [{ current_db: 'goom_test', current_user: 'postgres' }] };
          }
          if (sql.includes('SELECT id, email FROM users')) {
            throw new Error('Database disk error');
          }
          return { rowCount: 1, rows: [] };
        }),
        release: vi.fn(),
      };

      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      } as any;

      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow('Database disk error');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Dataset Verification & Idempotency Tests (Requirement 7 Matrix)', () => {
    it('returns alreadySeeded: true when a complete valid dataset exists', async () => {
      const { mockPool, mockClient } = buildDatasetMock();
      const res = await seedDemo({ force: true, pool: mockPool });

      expect(res.alreadySeeded).toBe(true);
      expect(res.clientsCreated).toBe(0);
      expect(res.invoicesCreated).toBe(0);
      expect(res.paymentsCreated).toBe(0);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('fails safely on partial dataset with fewer than 10 invoices', async () => {
      const { mockPool } = buildDatasetMock({ invoicesCount: 8 });
      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow(
        /Expected exactly 15 demo invoices, found 8/
      );
    });

    it('fails safely on partial dataset with 10 or more invoices', async () => {
      const { mockPool } = buildDatasetMock({ invoicesCount: 12 });
      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow(
        /Expected exactly 15 demo invoices, found 12/
      );
    });

    it('fails safely when clients are missing (< 5 clients)', async () => {
      const { mockPool } = buildDatasetMock({ clientsCount: 4 });
      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow(
        /Expected exactly 5 demo clients, found 4/
      );
    });

    it('fails safely when payment records are missing (< 7 payments)', async () => {
      const { mockPool } = buildDatasetMock({ paymentsCount: 6 });
      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow(
        /Expected exactly 7 payment records, found 6/
      );
    });

    it('fails safely when payment amounts do not match invoice totals', async () => {
      const { defaultPaymentDetails } = buildDatasetMock();
      // Tamper with first payment amount: 12074000 instead of 12075000
      const tampered = defaultPaymentDetails.map((row, idx) =>
        idx === 0 ? { ...row, payment_amount: '12074000' } : row
      );
      const { mockPool } = buildDatasetMock({ paymentDetailsRows: tampered });

      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow(
        /amount \(12074000\) does not match invoice .* total \(12075000\)/
      );
    });

    it('fails safely when invoice statuses or currencies are incorrect', async () => {
      const { mockPool } = buildDatasetMock({
        statusBreakdown: [
          { currency: 'ETB', status: 'paid', count: '5' }, // 5 instead of 4
          { currency: 'ETB', status: 'sent', count: '1' },
          { currency: 'ETB', status: 'draft', count: '1' },
          { currency: 'ETB', status: 'void', count: '1' },
          { currency: 'USD', status: 'paid', count: '3' },
          { currency: 'USD', status: 'sent', count: '3' },
          { currency: 'USD', status: 'draft', count: '1' },
        ],
      });

      await expect(seedDemo({ force: true, pool: mockPool })).rejects.toThrow(
        /Invoice status\/currency distribution mismatch/
      );
    });

    it('proves a second execution on an already-seeded dataset creates zero duplicate records', async () => {
      const { mockPool, mockClient } = buildDatasetMock();

      // First check returns complete dataset
      const res = await seedDemo({ force: true, pool: mockPool });
      expect(res.alreadySeeded).toBe(true);

      // Verify no INSERT statements were executed
      const insertCalls = mockClient.query.mock.calls.filter(([sql]: [string]) =>
        typeof sql === 'string' && sql.trim().toUpperCase().startsWith('INSERT INTO')
      );
      expect(insertCalls.length).toBe(0);
    });
  });
});

// --- Live Database Integration Tests (Runs when TEST_DATABASE_URL is provided) ---
const testDbUrl = process.env.TEST_DATABASE_URL;
const describeDb = testDbUrl ? describe : describe.skip;

describeDb('Demo Seed Script Tests (Live PostgreSQL)', { timeout: 45000 }, () => {
  let dbHelper: TestDbHelper;

  beforeAll(async () => {
    (env as any).DATABASE_URL = testDbUrl;
    process.env.DATABASE_URL = testDbUrl;
    dbHelper = createTestDbHelper(testDbUrl!);
    await closeDbPool();
    await dbHelper.resetSchema();
  }, 45000);

  afterAll(async () => {
    await closeDbPool();
    await dbHelper.close();
  });

  beforeEach(async () => {
    process.env.ALLOW_PORTFOLIO_DEMO_SEED = 'true';
    await dbHelper.cleanTables();
  });

  describe('Safety Guard', () => {
    it('refuses to run when DEMO_MODE is false and force is false or omitted', async () => {
      const originalDemoMode = env.DEMO_MODE;
      (env as any).DEMO_MODE = false;

      try {
        await expect(seedDemo({ force: false })).rejects.toThrow(
          'Demo seed refused: DEMO_MODE is not true and --force was not supplied.'
        );
      } finally {
        (env as any).DEMO_MODE = originalDemoMode;
      }
    });

    it('allows execution when force is explicitly set to true', async () => {
      const originalDemoMode = env.DEMO_MODE;
      (env as any).DEMO_MODE = false;

      try {
        const pool = dbHelper.pool;
        const res = await seedDemo({ force: true, pool });
        expect(res.alreadySeeded).toBe(false);
        expect(res.invoicesCreated).toBe(15);
      } finally {
        (env as any).DEMO_MODE = originalDemoMode;
      }
    });
  });

  describe('Seeding & Data Generation', () => {
    it('creates demo owner, business, 5 clients, and 15 invoices with valid payments', async () => {
      const pool = dbHelper.pool;

      // Pre-create an unrelated non-demo user and business to verify tenant safety
      const nonDemoUser = await pool.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ('real-customer@corp.com', 'hashed_pwd', 'Real Customer')
         RETURNING id`
      );
      const nonDemoBiz = await pool.query(
        `INSERT INTO businesses (owner_id, name, default_currency, invoice_prefix, timezone)
         VALUES ($1, 'Real Customer Enterprise', 'ETB', 'RCE', 'Africa/Addis_Ababa')
         RETURNING id`,
        [nonDemoUser.rows[0].id]
      );
      const nonDemoClient = await pool.query(
        `INSERT INTO clients (business_id, name)
         VALUES ($1, 'Unrelated Client')
         RETURNING id`,
        [nonDemoBiz.rows[0].id]
      );

      // Run demo seed
      const result = await seedDemo({ force: true, pool });

      expect(result.userEmail).toBe(DEMO_CONFIG.EMAIL);
      expect(result.businessName).toBe(DEMO_CONFIG.BUSINESS_NAME);
      expect(result.clientsCreated).toBe(5);
      expect(result.invoicesCreated).toBe(15);
      expect(result.paymentsCreated).toBe(7);
      expect(result.alreadySeeded).toBe(false);

      // Verify non-demo records were untouched
      const nonDemoBizCheck = await pool.query('SELECT * FROM businesses WHERE id = $1', [nonDemoBiz.rows[0].id]);
      expect(nonDemoBizCheck.rows[0].name).toBe('Real Customer Enterprise');
      const nonDemoClientsCheck = await pool.query('SELECT * FROM clients WHERE business_id = $1', [nonDemoBiz.rows[0].id]);
      expect(nonDemoClientsCheck.rowCount).toBe(1);

      // Verify demo business
      const demoBiz = await pool.query('SELECT * FROM businesses WHERE id = $1', [result.businessId]);
      expect(demoBiz.rows[0].name).toBe(DEMO_CONFIG.BUSINESS_NAME);
      expect(demoBiz.rows[0].timezone).toBe('Africa/Addis_Ababa');

      // Verify demo clients (should be 5)
      const clients = await pool.query('SELECT * FROM clients WHERE business_id = $1', [result.businessId]);
      expect(clients.rowCount).toBe(5);
      const clientNames = clients.rows.map((r) => r.name);
      expect(clientNames).toContain('Abyssinia Trading PLC አቢሲኒያ ንግድ');
      expect(clientNames).toContain('Red Sea Logistics LLC');

      // Verify demo invoices
      const invoices = await pool.query('SELECT * FROM invoices WHERE business_id = $1', [result.businessId]);
      expect(invoices.rowCount).toBe(15);

      // Check currency breakdown
      const etbInvoices = invoices.rows.filter((r) => r.currency === 'ETB');
      const usdInvoices = invoices.rows.filter((r) => r.currency === 'USD');
      expect(etbInvoices.length).toBe(8);
      expect(usdInvoices.length).toBe(7);

      // Check status breakdown
      const paidInvoices = invoices.rows.filter((r) => r.status === 'paid');
      const sentInvoices = invoices.rows.filter((r) => r.status === 'sent');
      const draftInvoices = invoices.rows.filter((r) => r.status === 'draft');
      const voidInvoices = invoices.rows.filter((r) => r.status === 'void');

      expect(paidInvoices.length).toBe(7);
      expect(sentInvoices.length).toBe(5);
      expect(draftInvoices.length).toBe(2);
      expect(voidInvoices.length).toBe(1);

      // Drafts must have NULL number
      for (const d of draftInvoices) {
        expect(d.number).toBeNull();
      }

      // Non-drafts must have positive sequential numbers
      for (const s of [...paidInvoices, ...sentInvoices, ...voidInvoices]) {
        expect(s.number).toBeGreaterThan(0);
      }

      // Verify payments for paid invoices
      const payments = await pool.query('SELECT * FROM payments WHERE invoice_id = ANY($1)', [
        paidInvoices.map((i) => i.id),
      ]);
      expect(payments.rowCount).toBe(7);
      for (const p of payments.rows) {
        expect(p.provider).toBe('simulated');
        expect(p.status).toBe('succeeded');
        expect(BigInt(p.amount_minor)).toBeGreaterThan(0n);
        expect(p.tx_ref).toMatch(/^demo_tx_/);
      }

      // Verify invoice items exist for every invoice
      const itemsRes = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = ANY($1)', [
        invoices.rows.map((i) => i.id),
      ]);
      expect(itemsRes.rowCount).toBeGreaterThanOrEqual(15);
      for (const item of itemsRes.rows) {
        expect(item.quantity_milli).toBeGreaterThan(0);
        expect(BigInt(item.unit_price_minor)).toBeGreaterThan(0n);
        expect(BigInt(item.line_total_minor)).toBeGreaterThan(0n);
      }
    });

    it('is completely idempotent when run multiple times', async () => {
      const pool = dbHelper.pool;

      // First run
      const firstRun = await seedDemo({ force: true, pool });
      expect(firstRun.alreadySeeded).toBe(false);
      expect(firstRun.invoicesCreated).toBe(15);

      // Snapshot invoice counts
      const invoicesBefore = await pool.query('SELECT count(*)::int AS cnt FROM invoices WHERE business_id = $1', [
        firstRun.businessId,
      ]);
      const clientsBefore = await pool.query('SELECT count(*)::int AS cnt FROM clients WHERE business_id = $1', [
        firstRun.businessId,
      ]);
      const paymentsBefore = await pool.query(
        `SELECT count(*)::int AS cnt FROM payments
         WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id = $1)`,
        [firstRun.businessId]
      );

      // Second run
      const secondRun = await seedDemo({ force: true, pool });
      expect(secondRun.alreadySeeded).toBe(true);
      expect(secondRun.invoicesCreated).toBe(0);
      expect(secondRun.clientsCreated).toBe(0);
      expect(secondRun.paymentsCreated).toBe(0);
      expect(secondRun.businessId).toBe(firstRun.businessId);

      // Snapshot invoice counts after second run
      const invoicesAfter = await pool.query('SELECT count(*)::int AS cnt FROM invoices WHERE business_id = $1', [
        firstRun.businessId,
      ]);
      const clientsAfter = await pool.query('SELECT count(*)::int AS cnt FROM clients WHERE business_id = $1', [
        firstRun.businessId,
      ]);
      const paymentsAfter = await pool.query(
        `SELECT count(*)::int AS cnt FROM payments
         WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id = $1)`,
        [firstRun.businessId]
      );

      expect(invoicesAfter.rows[0].cnt).toBe(invoicesBefore.rows[0].cnt);
      expect(clientsAfter.rows[0].cnt).toBe(clientsBefore.rows[0].cnt);
      expect(paymentsAfter.rows[0].cnt).toBe(paymentsBefore.rows[0].cnt);
    });
  });

  describe('Dashboard Verification with Seeded Demo Data', () => {
    it('returns believable, populated ETB and USD dashboard metrics for the demo business', async () => {
      const pool = dbHelper.pool;
      const seedResult = await seedDemo({ force: true, pool });

      const demoToken = signUserToken({
        userId: seedResult.userId,
        email: seedResult.userEmail,
      });

      // 1. Dashboard Summary
      const summaryRes = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${demoToken}`);

      expect(summaryRes.status).toBe(200);
      const { summary, currenciesInUse, hasInvoices } = summaryRes.body;

      expect(hasInvoices).toBe(true);
      expect(currenciesInUse).toContain('ETB');
      expect(currenciesInUse).toContain('USD');

      // Both currencies must be present
      expect(summary).toHaveProperty('ETB');
      expect(summary).toHaveProperty('USD');

      // ETB checks: Has outstanding and overdue invoices
      expect(summary.ETB.outstandingMinor).toBeGreaterThan(0);
      expect(summary.ETB.overdueMinor).toBeGreaterThan(0);
      expect(summary.ETB.paidThisMonthMinor).toBeGreaterThanOrEqual(0);

      // USD checks: Has outstanding and overdue invoices
      expect(summary.USD.outstandingMinor).toBeGreaterThan(0);
      expect(summary.USD.overdueMinor).toBeGreaterThan(0);
      expect(summary.USD.paidThisMonthMinor).toBeGreaterThanOrEqual(0);

      // 2. Dashboard Revenue (6-month chart)
      const revRes = await request(app)
        .get('/api/v1/dashboard/revenue')
        .set('Authorization', `Bearer ${demoToken}`);

      expect(revRes.status).toBe(200);
      const { revenue, months } = revRes.body;

      expect(months).toBe(6);
      expect(revenue).toHaveProperty('ETB');
      expect(revenue).toHaveProperty('USD');
      expect(revenue.ETB.length).toBe(6);
      expect(revenue.USD.length).toBe(6);

      // Total revenue across buckets must be positive
      const sumEtbBuckets = revenue.ETB.reduce((acc: number, b: any) => acc + b.revenueMinor, 0);
      const sumUsdBuckets = revenue.USD.reduce((acc: number, b: any) => acc + b.revenueMinor, 0);
      expect(sumEtbBuckets).toBeGreaterThan(0);
      expect(sumUsdBuckets).toBeGreaterThan(0);

      // Current month revenue bucket matches paidThisMonthMinor in summary
      expect(revenue.ETB[revenue.ETB.length - 1].revenueMinor).toBe(summary.ETB.paidThisMonthMinor);
      expect(revenue.USD[revenue.USD.length - 1].revenueMinor).toBe(summary.USD.paidThisMonthMinor);

      // 3. Dashboard Activity
      const actRes = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Authorization', `Bearer ${demoToken}`);

      expect(actRes.status).toBe(200);
      const { activity } = actRes.body;

      expect(activity).toBeInstanceOf(Array);
      expect(activity.length).toBeGreaterThan(0);

      // Verify event structure
      const ev = activity[0];
      expect(ev).toHaveProperty('invoiceId');
      expect(ev).toHaveProperty('displayNumber');
      expect(ev).toHaveProperty('clientName');
      expect(ev).toHaveProperty('currency');
      expect(ev).toHaveProperty('totalMinor');
      expect(ev).toHaveProperty('eventType');
      expect(ev).toHaveProperty('timestamp');
      expect(['sent', 'paid', 'voided']).toContain(ev.eventType);

      // Verify timestamps are ordered descending
      for (let i = 0; i < activity.length - 1; i++) {
        const t1 = new Date(activity[i].timestamp).getTime();
        const t2 = new Date(activity[i + 1].timestamp).getTime();
        expect(t1).toBeGreaterThanOrEqual(t2);
      }
    });
  });
});
