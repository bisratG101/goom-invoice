import { Pool } from 'pg';
import { runMigrations, getDatabaseSslConfig } from './migrate';
import { resetRateLimits } from '../middleware/rateLimit';

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

  // Safeguard 2: Keyword check for keywords indicating production in URL
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

  // Parse URL to inspect host and pathname
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    throw new Error(`TEST DATABASE ERROR: Invalid database URL format: ${err.message}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  const isNeon = hostname.endsWith('.neon.tech') || hostname.includes('neon.tech');
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local');

  // Safeguard 2b: Explicitly reject development, staging, or demo databases in TEST_DATABASE_URL
  if (
    dbName.includes('dev') ||
    dbName.includes('development') ||
    dbName.includes('staging') ||
    dbName.includes('demo')
  ) {
    throw new Error(
      `FATAL SAFETY CHECK: TEST_DATABASE_URL database name "${dbName}" targets a development, staging, or demo database. ` +
        'Test cleanup and migrations are strictly isolated to dedicated test databases and will never touch development data.'
    );
  }

  // Safeguard 2c: For non-Neon databases, require an explicit test identifier in the database name
  if (!isNeon) {
    const hasTestIdentifier =
      dbName.includes('test') ||
      dbName.includes('_test') ||
      dbName.includes('-test') ||
      dbName === 'test';
    if (!hasTestIdentifier) {
      throw new Error(
        `FATAL SAFETY CHECK: TEST_DATABASE_URL database name "${dbName}" does not contain a "test" identifier. ` +
          'Refusing to run tests against a non-test database.'
      );
    }
  }

  // Safeguard 3: For Neon connections, enforce strict host pinning, timeline ID requirement, and primary separation
  if (isNeon) {
    // 3a. Require EXPECTED_TEST_DB_HOST
    const expectedHost = process.env.EXPECTED_TEST_DB_HOST?.trim().toLowerCase();
    if (!expectedHost) {
      throw new Error(
        'FATAL SAFETY CHECK: EXPECTED_TEST_DB_HOST environment variable is required for Neon test databases. ' +
          'Refusing to run tests against an unpinned Neon host.'
      );
    }

    // 3b. Require exact hostname matching
    if (hostname !== expectedHost) {
      throw new Error(
        `FATAL SAFETY CHECK: TEST_DATABASE_URL hostname "${hostname}" does not match EXPECTED_TEST_DB_HOST "${expectedHost}". ` +
          'Refusing to connect without exact host confirmation.'
      );
    }

    // 3c. Require EXPECTED_TEST_NEON_TIMELINE_ID configuration
    const expectedTimelineId = process.env.EXPECTED_TEST_NEON_TIMELINE_ID?.trim();
    if (!expectedTimelineId) {
      throw new Error(
        'FATAL SAFETY CHECK: EXPECTED_TEST_NEON_TIMELINE_ID environment variable is required for Neon test databases. ' +
          'Provide the 32-character hexadecimal timeline ID for the test branch.'
      );
    }

    // 3d. Reject matching PRIMARY_DATABASE_URL if configured
    if (process.env.PRIMARY_DATABASE_URL && process.env.PRIMARY_DATABASE_URL.trim() !== '') {
      let primaryHostname: string | null = null;
      try {
        primaryHostname = new URL(process.env.PRIMARY_DATABASE_URL.trim()).hostname.toLowerCase();
      } catch {
        // Ignore invalid PRIMARY_DATABASE_URL parsing format
      }
      if (primaryHostname && hostname === primaryHostname) {
        throw new Error(
          `FATAL SAFETY CHECK: TEST_DATABASE_URL hostname "${hostname}" matches PRIMARY_DATABASE_URL hostname. ` +
            'Refusing to run tests against primary or production database.'
        );
      }
    }
  } else if (isLocal) {
    // Safeguard 4: Local development path
    // If DATABASE_URL matches TEST_DATABASE_URL on localhost, verify local database is explicitly named test
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
  } else {
    // Safeguard 5: Other remote non-Neon databases
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
  }

  return trimmed;
}

/**
 * Actively verifies the database identity against the database server before any destructive operation.
 * For Neon connections, verifies that the server-reported neon.timeline_id exactly matches EXPECTED_TEST_NEON_TIMELINE_ID.
 * Missing, empty, unavailable, or mismatched identity will throw an error and abort.
 */
export async function verifyDatabaseIdentity(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  url: string
): Promise<void> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  const isNeon = hostname.endsWith('.neon.tech') || hostname.includes('neon.tech');

  if (isNeon) {
    const expectedTimelineId = process.env.EXPECTED_TEST_NEON_TIMELINE_ID?.trim();
    if (!expectedTimelineId) {
      throw new Error(
        'FATAL SAFETY CHECK: EXPECTED_TEST_NEON_TIMELINE_ID is required for Neon identity verification.'
      );
    }

    const res = await client.query(
      "SELECT current_setting('neon.timeline_id', true) AS timeline_id"
    );
    const actualTimelineId = res.rows[0]?.timeline_id?.trim();

    if (!actualTimelineId) {
      throw new Error(
        'FATAL SAFETY CHECK: Server did not return a valid "neon.timeline_id" setting. ' +
          'Database identity could not be verified on Neon connection. Aborting before destructive operation.'
      );
    }

    if (actualTimelineId !== expectedTimelineId) {
      throw new Error(
        `FATAL SAFETY CHECK: Database timeline ID mismatch. ` +
          `Server returned "${actualTimelineId}", expected "${expectedTimelineId}". ` +
          'Aborting before any destructive operation.'
      );
    }
  }

  // Server-side database identity verification: verify current_database()
  try {
    const dbRes = await client.query(
      'SELECT current_database() AS current_db'
    );
    const actualDb = (dbRes?.rows?.[0]?.current_db || '').toLowerCase().trim();

    if (actualDb) {
      if (
        actualDb.includes('dev') ||
        actualDb.includes('prod') ||
        actualDb.includes('staging') ||
        actualDb.includes('demo') ||
        (!isNeon && !actualDb.includes('test'))
      ) {
        throw new Error(
          `FATAL SAFETY CHECK: Connected database "${actualDb}" is not an authorized test database. ` +
            'Test cleanup and destructive operations aborted.'
        );
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('FATAL SAFETY CHECK')) {
      throw err;
    }
  }
}

export interface TestDbHelper {
  pool: Pool;
  resetSchema: () => Promise<void>;
  cleanTables: () => Promise<void>;
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
      assertSafeTestDatabase(verifiedUrl);

      const client = await pool.connect();
      try {
        // Verify identity immediately before DROP SCHEMA
        await verifyDatabaseIdentity(client, verifiedUrl);

        await client.query('DROP SCHEMA public CASCADE');
        await client.query('CREATE SCHEMA public');
        await client.query('GRANT ALL ON SCHEMA public TO public');
      } finally {
        client.release();
      }

      await runMigrations({
        connectionString: verifiedUrl,
        logger: () => {}, // quiet during automated test resets
      });
      resetRateLimits();
    },
    async cleanTables() {
      assertSafeTestDatabase(verifiedUrl);

      const client = await pool.connect();
      try {
        // Verify identity immediately before TRUNCATE
        await verifyDatabaseIdentity(client, verifiedUrl);

        await client.query(
          'TRUNCATE TABLE users, businesses, clients, invoice_counters, invoices, invoice_items, payments, payment_events, ai_usage RESTART IDENTITY CASCADE'
        );
      } finally {
        client.release();
      }
      resetRateLimits();
    },
    async close() {
      await pool.end();
    },
  };
}
