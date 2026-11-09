import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Deterministic 64-bit integer advisory lock key for Goom Invoice migrations
// Hash of string 'goom_invoice_migrations'
const MIGRATION_ADVISORY_LOCK_ID = '4829374029482019482';

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export interface MigrationOptions {
  connectionString?: string;
  migrationsDir?: string;
  logger?: (msg: string) => void;
  expectedDatabaseName?: string;
}

export function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function getDatabaseSslConfig(databaseUrl: string) {
  // If connection string explicitly disables ssl or is a plain local URL, disable ssl
  if (
    databaseUrl.includes('sslmode=disable') ||
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1')
  ) {
    return false;
  }
  // Neon and secure PostgreSQL hosts require TLS with certificate verification.
  // Using true enables standard Node.js root CAs certificate verification without bypassing security.
  return true;
}

export async function runMigrations(options?: MigrationOptions): Promise<MigrationResult> {
  const log = options?.logger || ((msg: string) => console.log(`[migrate] ${msg}`));
  const dbUrl = options?.connectionString || process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  const migrationsDir =
    options?.migrationsDir || path.resolve(__dirname, '../../migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: getDatabaseSslConfig(dbUrl),
  });

  const client = await pool.connect();
  let lockAcquired = false;

  try {
    // 0. Verify database identity guard before acquiring lock or applying migrations
    // MUST happen before advisory lock acquisition, schema creation, or any DDL.
    const identityRes = await client.query<{ current_db: string }>(
      'SELECT current_database() AS current_db'
    );
    const actualDb = (identityRes.rows[0]?.current_db || '').trim().toLowerCase();

    // 0a. Reject production database names unconditionally, regardless of whether EXPECTED_DATABASE_NAME is supplied
    const prohibitedTokens = ['prod', 'production', 'live', 'commercial'];
    const isProhibited = prohibitedTokens.some((tok) => {
      if (tok === 'prod') {
        return /(^|[_\-.0-9])prod([_\-.0-9]|$)/i.test(actualDb);
      }
      return actualDb.includes(tok);
    });

    if (isProhibited) {
      throw new Error(
        `FATAL SAFETY CHECK: Connected database "${actualDb}" is identified as a production database. Migration refused.`
      );
    }

    // 0b. EXPECTED_DATABASE_NAME must be explicitly supplied and non-empty
    const expectedDb = (
      options?.expectedDatabaseName ||
      process.env.EXPECTED_DATABASE_NAME ||
      ''
    )
      .trim()
      .toLowerCase();

    if (!expectedDb) {
      throw new Error(
        'FATAL SAFETY CHECK: EXPECTED_DATABASE_NAME is required to run migrations. Migration refused.'
      );
    }

    // 0c. Verify current_database() matches EXPECTED_DATABASE_NAME exactly
    if (actualDb !== expectedDb) {
      throw new Error(
        `FATAL SAFETY CHECK: Connected database "${actualDb}" does not match required EXPECTED_DATABASE_NAME "${expectedDb}". Migration refused.`
      );
    }

    log(`Verified database identity: "${actualDb}" matches EXPECTED_DATABASE_NAME "${expectedDb}".`);

    // 1. Acquire advisory lock with bounded retry (max 5 seconds)
    log('Acquiring migration advisory lock...');
    const lockDeadline = Date.now() + 5000;
    while (!lockAcquired && Date.now() < lockDeadline) {
      const lockRes = await client.query<{ pg_try_advisory_lock: boolean }>(
        'SELECT pg_try_advisory_lock($1)',
        [MIGRATION_ADVISORY_LOCK_ID]
      );
      if (lockRes.rows[0]?.pg_try_advisory_lock) {
        lockAcquired = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!lockAcquired) {
      throw new Error(
        `Failed to acquire migration advisory lock within 5000ms. ` +
          `Another migration or active database session may be holding lock ${MIGRATION_ADVISORY_LOCK_ID}.`
      );
    }
    log('Advisory lock acquired.');

    // 2. Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 3. Query already applied migrations
    const appliedRows = await client.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM schema_migrations ORDER BY filename ASC'
    );
    const appliedMap = new Map<string, string>();
    for (const row of appliedRows.rows) {
      appliedMap.set(row.filename, row.checksum);
    }

    // 4. Read migration files from directory in alphabetical order
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied: string[] = [];
    const alreadyApplied: string[] = [];

    // 5. Verify existing checksums and run unapplied migrations in individual transactions
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const checksum = computeChecksum(sqlContent);

      if (appliedMap.has(file)) {
        const storedChecksum = appliedMap.get(file);
        if (storedChecksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for already-applied file "${file}". ` +
              `Expected ${storedChecksum}, got ${checksum}. Migration refused.`
          );
        }
        alreadyApplied.push(file);
        continue;
      }

      // Apply unapplied migration in a transaction
      log(`Applying migration: ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES ($1, $2, now())',
          [file, checksum]
        );
        await client.query('COMMIT');
        applied.push(file);
        log(`Successfully applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        log(`Failed to apply migration: ${file}. Transaction rolled back.`);
        throw err;
      }
    }

    log(`Migrations complete. Applied: ${applied.length}, Already applied: ${alreadyApplied.length}.`);
    return { applied, alreadyApplied };
  } finally {
    // 6. Release advisory lock and database connection safely
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
        log('Advisory lock released.');
      } catch (unlockErr) {
        console.error('[migrate] Failed to release advisory lock:', unlockErr);
      }
    }
    client.release();
    await pool.end();
  }
}

// Direct execution from CLI (e.g. npm run migrate)
if (require.main === module) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] Migration failed:', err.message);
      process.exit(1);
    });
}
