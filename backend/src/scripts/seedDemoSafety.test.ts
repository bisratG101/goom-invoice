import { describe, it, expect, afterAll } from 'vitest';
import {
  assertSafeDemoDatabase,
  seedDemo,
  Queryable,
  PROHIBITED_DB_TOKENS,
  ALLOWED_DEMO_DB_TOKENS,
} from './seedDemo';
import { createTestDbHelper, TestDbHelper } from '../db/testDb';

const testDbUrl = process.env.TEST_DATABASE_URL;

describe('Demo Seed Target & Safeguard Verification', () => {
  const envSnapshot = { ...process.env };

  afterAll(() => {
    // Restore all process.env to original state
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(envSnapshot)) {
      process.env[key] = value;
    }
  });

  // Mock Queryable builder
  function createMockClient(options: {
    currentDb: string;
    currentUser?: string;
    nonDemoUsers?: number;
    nonDemoBusinesses?: number;
  }): Queryable {
    return {
      query: async (sql: string, params?: any[]) => {
        const normalized = sql.toLowerCase();
        if (normalized.includes('current_database()')) {
          return {
            rows: [
              {
                current_db: options.currentDb,
                current_user: options.currentUser || 'postgres',
              },
            ],
            rowCount: 1,
          };
        }
        if (normalized.includes('from users where email !=')) {
          return {
            rows: [{ count: String(options.nonDemoUsers ?? 0) }],
            rowCount: 1,
          };
        }
        if (normalized.includes('from businesses') && normalized.includes('where u.email !=')) {
          return {
            rows: [{ count: String(options.nonDemoBusinesses ?? 0) }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };
  }

  describe('NODE_ENV=production Guard', () => {
    it('strictly rejects seedDemo when NODE_ENV is "production", even with force and opt-in', async () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(
          seedDemo({ force: true, allowPortfolioDemoSeed: true })
        ).rejects.toThrowError(/Refusing to seed demo data when NODE_ENV is "production"/);
      } finally {
        process.env.NODE_ENV = original;
      }
    });
  });

  describe('Explicit Opt-in Guard (ALLOW_PORTFOLIO_DEMO_SEED)', () => {
    it('rejects seedDemo when opt-in is missing, even with force=true', async () => {
      const originalOptIn = process.env.ALLOW_PORTFOLIO_DEMO_SEED;
      delete process.env.ALLOW_PORTFOLIO_DEMO_SEED;
      try {
        await expect(
          seedDemo({ force: true, allowPortfolioDemoSeed: false })
        ).rejects.toThrowError(/Missing required opt-in permission/);
      } finally {
        if (originalOptIn) {
          process.env.ALLOW_PORTFOLIO_DEMO_SEED = originalOptIn;
        }
      }
    });
  });

  describe('Production & Commercial Database Rejection', () => {
    it('rejects production database names even when local process is NODE_ENV=development', async () => {
      const prodTargets = [
        'goom_prod',
        'goom-invoice-prod',
        'goom_production',
        'prod_cluster',
        'prod-db',
        'company_primary',
        'main_db',
        'live_production',
      ];

      for (const target of prodTargets) {
        const client = createMockClient({ currentDb: target });
        await expect(
          assertSafeDemoDatabase(client, {
            connectionString: `postgresql://user:pass@ep-host.neon.tech/${target}?sslmode=require`,
          })
        ).rejects.toThrowError(/is identified as a production\/live\/commercial database/);
      }
    });

    it('rejects commercial database names even with NODE_ENV=development and force=true', async () => {
      const commercialTargets = [
        'goom_commercial',
        'commercial_invoicing',
        'company_live_commercial',
        'telebirr_commercial_prod',
      ];

      for (const target of commercialTargets) {
        const client = createMockClient({ currentDb: target });
        await expect(
          assertSafeDemoDatabase(client, {
            connectionString: `postgresql://user:pass@ep-host.neon.tech/${target}?sslmode=require`,
          })
        ).rejects.toThrowError(/is identified as a production\/live\/commercial database/);
      }
    });

    it('rejects when connection URL host or path contains production/commercial tokens', async () => {
      const client = createMockClient({ currentDb: 'goom_dev' }); // dbName alone looks ok
      await expect(
        assertSafeDemoDatabase(client, {
          connectionString: 'postgresql://user:pass@ep-live-commercial.neon.tech/goom_dev?sslmode=require',
        })
      ).rejects.toThrowError(/is identified as a production\/live\/commercial database/);
    });
  });

  describe('Non-Recognized Target Classification', () => {
    it('rejects generic or ambiguous database names lacking demo/portfolio keywords', async () => {
      const unclassified = [
        'goom_billing',
        'invoice_app',
        'custom_target',
        'arbitrary_company_db',
      ];

      for (const target of unclassified) {
        const client = createMockClient({ currentDb: target });
        await expect(
          assertSafeDemoDatabase(client, {
            connectionString: `postgresql://user:pass@ep-host.neon.tech/${target}?sslmode=require`,
          })
        ).rejects.toThrowError(/not a recognized portfolio or demo database/);
      }
    });
  });

  describe('Approved Dedicated Demo Database Recognition', () => {
    it('approves properly identified dedicated demo and portfolio databases', async () => {
      const approvedTargets = [
        'goom-invoice-portfolio',
        'goom_demo',
        'goom_demo_db',
        'goom_dev',
        'goom_test',
        'portfolio_showcase',
        'sandbox_demo',
      ];

      for (const target of approvedTargets) {
        const client = createMockClient({
          currentDb: target,
          nonDemoUsers: 0,
          nonDemoBusinesses: 0,
        });

        const res = await assertSafeDemoDatabase(client, {
          connectionString: `postgresql://user:pass@ep-host.neon.tech/${target}?sslmode=require`,
        });

        expect(res.dbName).toBe(target);
      }
    });
  });

  // Integration test with live test database
  const describeLive = testDbUrl ? describe : describe.skip;
  describeLive('Live Test Database Execution', () => {
    let helper: TestDbHelper;

    beforeAll(async () => {
      helper = createTestDbHelper(testDbUrl);
    });

    afterAll(async () => {
      if (helper) {
        await helper.close();
      }
    });

    it('successfully seeds demo data into approved test database when opt-in is granted', async () => {
      // Cleanup to guarantee clean test database state
      await helper.cleanTables();

      const result = await seedDemo({
        pool: helper.pool,
        allowPortfolioDemoSeed: true,
        force: true,
      });

      expect(result.userEmail).toBe('demo@goominvoice.com');
      expect(result.businessName).toBe('Demo Logistics');
      expect(result.clientsCreated).toBe(5);
      expect(result.invoicesCreated).toBe(15);
      expect(result.alreadySeeded).toBe(false);

      // Verify idempotency: second call skips gracefully
      const secondResult = await seedDemo({
        pool: helper.pool,
        allowPortfolioDemoSeed: true,
        force: true,
      });

      expect(secondResult.alreadySeeded).toBe(true);
      expect(secondResult.clientsCreated).toBe(0);
    });
  });
});
