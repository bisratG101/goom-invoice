import { Pool } from 'pg';
import { runMigrations, getDatabaseSslConfig } from './migrate';

/**
 * Validates that a database URL is strictly safe for testing and is NOT targeting production.
 * Throws an informative error if any dangerous or ambiguous conditions are detected.
 */
export function assertSafeTestDatabase(url: string | undefined): string {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new Error(
      'TEST DATABASE ERROR: TEST_DATABASE_URL is not set. ' +
        'Automated database tests require an explicit TEST_DATABASE_URL. ' +
        'Set TEST_DATABASE_URL to a dedicated test database (e.g. Neon test branch or local Postgres).'
    );
  }

  const trimmed = url.trim();

  // Safeguard 1: Never allow NODE_ENV=production
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL SAFETY CHECK: Attempted to run test database reset while NODE_ENV is "production". Operation aborted.'
    );
  }

  // Safeguard 2: Never allow matching DATABASE_URL unless DATABASE_URL explicitly indicates test
  const prodUrl = process.env.DATABASE_URL;
  if (prodUrl && trimmed === prodUrl.trim()) {
    const isExplicitTestName =
      trimmed.includes('_test') ||
      trimmed.includes('-test') ||
      trimmed.includes('/test') ||
      trimmed.includes('test_branch');
    if (!isExplicitTestName) {
      throw new Error(
        'FATAL SAFETY CHECK: TEST_DATABASE_URL matches DATABASE_URL and does not contain a "test" identifier. ' +
          'Refusing to run tests against primary or production database.'
      );
    }
  }

  // Safeguard 3: Check for keywords indicating production in host or dbname
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('prod') ||
    lower.includes('production') ||
    lower.includes('live') ||
    lower.includes('primary')
  ) {
    throw new Error(
      'FATAL SAFETY CHECK: TEST_DATABASE_URL contains production keywords ("prod", "production", "live", "primary"). ' +
        'Refusing to reset test schema.'
    );
  }

  return trimmed;
}

export interface TestDbHelper {
  pool: Pool;
  resetSchema: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Creates a test database helper that safely resets the public schema and reapplies migrations.
 * Only targets the explicitly validated test database URL.
 */
export function createTestDbHelper(testUrl?: string): TestDbHelper {
  const verifiedUrl = assertSafeTestDatabase(testUrl || process.env.TEST_DATABASE_URL);

  const pool = new Pool({
    connectionString: verifiedUrl,
    ssl: getDatabaseSslConfig(verifiedUrl),
  });

  return {
    pool,
    async resetSchema() {
      // Re-verify before wiping
      assertSafeTestDatabase(verifiedUrl);

      const client = await pool.connect();
      try {
        // Drop all tables in public schema cleanly and recreate it
        await client.query('DROP SCHEMA public CASCADE');
        await client.query('CREATE SCHEMA public');
        await client.query('GRANT ALL ON SCHEMA public TO public');
      } finally {
        client.release();
      }

      // Reapply migrations cleanly
      await runMigrations({
        connectionString: verifiedUrl,
        logger: () => {}, // quiet during automated test resets
      });
    },
    async close() {
      await pool.end();
    },
  };
}
