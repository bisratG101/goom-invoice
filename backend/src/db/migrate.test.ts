import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations, computeChecksum } from './migrate';
import fs from 'fs';
import path from 'path';

const mClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock('pg', () => {
  return {
    Pool: vi.fn().mockImplementation(function () {
      return {
        connect: vi.fn(() => Promise.resolve(mClient)),
        end: vi.fn(() => Promise.resolve()),
      };
    }),
  };
});

describe('Database Migration Runner Safety Guards (migrate.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EXPECTED_DATABASE_NAME;
    delete process.env.ALLOW_PROD_MIGRATION;
  });

  it('1. rejects connection if EXPECTED_DATABASE_NAME is missing or empty', async () => {
    mClient.query.mockImplementation((sql: string) => {
      if (sql.includes('current_database()')) {
        return Promise.resolve({ rows: [{ current_db: 'goom_dev' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // Test with undefined options and no env var
    await expect(
      runMigrations({
        connectionString: 'postgresql://user:pass@localhost:5434/goom_dev',
        logger: () => {},
      })
    ).rejects.toThrowError(/EXPECTED_DATABASE_NAME is required to run migrations/);

    // Test with empty string
    await expect(
      runMigrations({
        connectionString: 'postgresql://user:pass@localhost:5434/goom_dev',
        expectedDatabaseName: '   ',
        logger: () => {},
      })
    ).rejects.toThrowError(/EXPECTED_DATABASE_NAME is required to run migrations/);

    // Verify advisory lock and DDL were never touched
    expect(mClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock'),
      expect.anything()
    );
    expect(mClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
    );
  });

  it('2. rejects connection if actual database does not match EXPECTED_DATABASE_NAME (wrong database)', async () => {
    mClient.query.mockImplementation((sql: string) => {
      if (sql.includes('current_database()')) {
        return Promise.resolve({ rows: [{ current_db: 'goom_dev' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(
      runMigrations({
        connectionString: 'postgresql://user:pass@localhost:5434/goom_dev',
        expectedDatabaseName: 'goom-invoice-portfolio',
        logger: () => {},
      })
    ).rejects.toThrowError(/does not match required EXPECTED_DATABASE_NAME "goom-invoice-portfolio"/);

    // Verify advisory lock was never requested
    expect(mClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock'),
      expect.anything()
    );
  });

  it('3. rejects production database names regardless of whether EXPECTED_DATABASE_NAME is supplied', async () => {
    // 3a. Production db with mismatched EXPECTED_DATABASE_NAME
    mClient.query.mockImplementation((sql: string) => {
      if (sql.includes('current_database()')) {
        return Promise.resolve({ rows: [{ current_db: 'goom-invoice-prod' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(
      runMigrations({
        connectionString: 'postgresql://user:pass@ep-host.neon.tech/goom-invoice-prod?sslmode=require',
        expectedDatabaseName: 'goom-invoice-portfolio',
        logger: () => {},
      })
    ).rejects.toThrowError(/identified as a production database/);

    // 3b. Production db even when EXPECTED_DATABASE_NAME explicitly matches
    await expect(
      runMigrations({
        connectionString: 'postgresql://user:pass@ep-host.neon.tech/goom-invoice-prod?sslmode=require',
        expectedDatabaseName: 'goom-invoice-prod',
        logger: () => {},
      })
    ).rejects.toThrowError(/identified as a production database/);

    // 3c. Various production token variants (production, live, commercial)
    for (const prodName of ['goom_production', 'app_live', 'company_commercial']) {
      mClient.query.mockImplementation((sql: string) => {
        if (sql.includes('current_database()')) {
          return Promise.resolve({ rows: [{ current_db: prodName }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        runMigrations({
          connectionString: `postgresql://user:pass@host.tech/${prodName}`,
          expectedDatabaseName: prodName,
          logger: () => {},
        })
      ).rejects.toThrowError(/identified as a production database/);
    }

    // Verify advisory lock was never requested on any production attempt
    expect(mClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock'),
      expect.anything()
    );
  });

  it('4. approves and continues when actual database matches EXPECTED_DATABASE_NAME (correct portfolio database)', async () => {
    const migrationsDir = path.resolve(__dirname, '../../migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    const rows = files.map((f) => ({
      filename: f,
      checksum: computeChecksum(fs.readFileSync(path.join(migrationsDir, f), 'utf8')),
    }));

    mClient.query.mockImplementation((sql: string) => {
      if (sql.includes('current_database()')) {
        return Promise.resolve({ rows: [{ current_db: 'goom-invoice-portfolio' }] });
      }
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve({ rows: [{ pg_try_advisory_lock: true }] });
      }
      if (sql.includes('schema_migrations')) {
        return Promise.resolve({ rows });
      }
      if (sql.includes('pg_advisory_unlock')) {
        return Promise.resolve({ rows: [{ pg_advisory_unlock: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // 4a. Via options.expectedDatabaseName
    const result1 = await runMigrations({
      connectionString: 'postgresql://user:pass@ep-host.neon.tech/goom-invoice-portfolio?sslmode=require',
      expectedDatabaseName: 'goom-invoice-portfolio',
      logger: () => {},
    });

    expect(result1).toBeDefined();
    expect(result1.alreadyApplied.length).toBe(files.length);
    expect(mClient.query).toHaveBeenCalledWith(
      expect.stringContaining('current_database() AS current_db')
    );
    expect(mClient.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock'),
      expect.anything()
    );
    expect(mClient.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      expect.anything()
    );

    // 4b. Via process.env.EXPECTED_DATABASE_NAME
    process.env.EXPECTED_DATABASE_NAME = 'goom-invoice-portfolio';
    const result2 = await runMigrations({
      connectionString: 'postgresql://user:pass@ep-host.neon.tech/goom-invoice-portfolio?sslmode=require',
      logger: () => {},
    });
    expect(result2).toBeDefined();
    expect(result2.alreadyApplied.length).toBe(files.length);
  });

  it('5. confirms advisory lock is always released safely even when migration query fails', async () => {
    mClient.query.mockImplementation((sql: string) => {
      if (sql.includes('current_database()')) {
        return Promise.resolve({ rows: [{ current_db: 'goom-invoice-portfolio' }] });
      }
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve({ rows: [{ pg_try_advisory_lock: true }] });
      }
      if (sql.includes('schema_migrations')) {
        throw new Error('Simulated DDL table query failure');
      }
      if (sql.includes('pg_advisory_unlock')) {
        return Promise.resolve({ rows: [{ pg_advisory_unlock: true }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(
      runMigrations({
        connectionString: 'postgresql://user:pass@ep-host.neon.tech/goom-invoice-portfolio?sslmode=require',
        expectedDatabaseName: 'goom-invoice-portfolio',
        logger: () => {},
      })
    ).rejects.toThrowError(/Simulated DDL table query failure/);

    // Advisory lock must have been unlocked despite the error
    expect(mClient.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      expect.anything()
    );
    expect(mClient.release).toHaveBeenCalled();
  });
});
