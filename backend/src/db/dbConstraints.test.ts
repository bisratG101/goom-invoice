import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSafeTestDatabase, createTestDbHelper, TestDbHelper } from './testDb';
import { runMigrations, computeChecksum } from './migrate';
import fs from 'fs';
import path from 'path';

const testDbUrl = process.env.TEST_DATABASE_URL;

describe('Database Safety & Safeguards (always runs)', () => {
  it('throws when TEST_DATABASE_URL is missing or empty', () => {
    expect(() => assertSafeTestDatabase(undefined)).toThrowError(/TEST DATABASE ERROR/);
    expect(() => assertSafeTestDatabase('')).toThrowError(/TEST DATABASE ERROR/);
  });

  it('rejects URLs containing production keywords', () => {
    expect(() =>
      assertSafeTestDatabase('postgresql://user:pass@ep-prod-123.neon.tech/goom_production?sslmode=require')
    ).toThrowError(/production keywords/);

    expect(() =>
      assertSafeTestDatabase('postgresql://user:pass@ep-cold-123.neon.tech/prod_db?sslmode=require')
    ).toThrowError(/production keywords/);

    expect(() =>
      assertSafeTestDatabase('postgresql://user:pass@live-cluster.neon.tech/goom?sslmode=require')
    ).toThrowError(/production keywords/);
  });

  it('rejects test database execution when NODE_ENV is production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() =>
        assertSafeTestDatabase('postgresql://user:pass@ep-test-123.neon.tech/goom_test?sslmode=require')
      ).toThrowError(/NODE_ENV is "production"/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('computes sha256 checksums deterministically', () => {
    const hash1 = computeChecksum('CREATE TABLE test (id int);');
    const hash2 = computeChecksum('CREATE TABLE test (id int);');
    const hash3 = computeChecksum('CREATE TABLE other (id int);');
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(64);
  });
});

// The following constraint tests run against a real PostgreSQL database when TEST_DATABASE_URL is provided.
const describeDb = testDbUrl ? describe : describe.skip;

describeDb('PostgreSQL Schema & Constraint Tests (Prompt 3)', () => {
  let dbHelper: TestDbHelper;

  beforeAll(async () => {
    dbHelper = createTestDbHelper(testDbUrl);
  });

  beforeEach(async () => {
    await dbHelper.resetSchema();
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.close();
    }
  });

  it('migration is idempotent: running twice does not reapply or fail', async () => {
    const result = await runMigrations({
      connectionString: testDbUrl,
      logger: () => {},
    });
    expect(result.applied).toHaveLength(0);
    expect(result.alreadyApplied).toContain('001_initial.sql');
  });

  it('migrator refuses to run if an already-applied migration checksum changes', async () => {
    const client = await dbHelper.pool.connect();
    try {
      // Tamper with the recorded checksum
      await client.query(
        "UPDATE schema_migrations SET checksum = 'tampered_bad_checksum' WHERE filename = '001_initial.sql'"
      );
    } finally {
      client.release();
    }

    await expect(
      runMigrations({
        connectionString: testDbUrl,
        logger: () => {},
      })
    ).rejects.toThrowError(/checksum mismatch for already-applied file/);
  });

  // Rule 1: A client of business B cannot be attached to an invoice of business A (expect an error)
  it('RULE 1: A client belonging to business B cannot be attached to an invoice belonging to business A', async () => {
    const client = await dbHelper.pool.connect();
    try {
      // 1. Create two users
      const u1 = await client.query(
        "INSERT INTO users (email, password_hash, name) VALUES ('u1@test.com', 'hash1', 'Owner 1') RETURNING id"
      );
      const u2 = await client.query(
        "INSERT INTO users (email, password_hash, name) VALUES ('u2@test.com', 'hash2', 'Owner 2') RETURNING id"
      );

      // 2. Create two businesses
      const b1 = await client.query(
        "INSERT INTO businesses (owner_id, name) VALUES ($1, 'Business A') RETURNING id",
        [u1.rows[0].id]
      );
      const b2 = await client.query(
        "INSERT INTO businesses (owner_id, name) VALUES ($1, 'Business B') RETURNING id",
        [u2.rows[0].id]
      );

      const b1Id = b1.rows[0].id;
      const b2Id = b2.rows[0].id;

      // 3. Create client belonging to business B
      const cB = await client.query(
        'INSERT INTO clients (business_id, name) VALUES ($1, $2) RETURNING id',
        [b2Id, 'Client of B']
      );
      const cBId = cB.rows[0].id;

      // 4. Attempt to create invoice for business A referencing client of business B
      // Composite FK: FOREIGN KEY (client_id, business_id) REFERENCES clients (id, business_id)
      await expect(
        client.query(
          `INSERT INTO invoices (
            business_id, client_id, currency, status, issue_date, due_date,
            subtotal_minor, tax_minor, total_minor, public_token
          ) VALUES (
            $1, $2, 'ETB', 'draft', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days',
            1000, 0, 1000, 'token_cross_tenant_1'
          )`,
          [b1Id, cBId]
        )
      ).rejects.toThrowError(/violates foreign key constraint/);
    } finally {
      client.release();
    }
  });

  // Rule 2: Two invoices cannot share (business_id, number)
  it('RULE 2: Two invoices cannot share the same (business_id, number)', async () => {
    const client = await dbHelper.pool.connect();
    try {
      const u = await client.query(
        "INSERT INTO users (email, password_hash, name) VALUES ('u@test.com', 'hash', 'Owner') RETURNING id"
      );
      const b = await client.query(
        "INSERT INTO businesses (owner_id, name) VALUES ($1, 'Biz 1') RETURNING id",
        [u.rows[0].id]
      );
      const c = await client.query(
        'INSERT INTO clients (business_id, name) VALUES ($1, $2) RETURNING id',
        [b.rows[0].id, 'Client 1']
      );

      const bId = b.rows[0].id;
      const cId = c.rows[0].id;

      // Insert first invoice with number 1
      await client.query(
        `INSERT INTO invoices (
          business_id, client_id, number, currency, status, issue_date, due_date,
          subtotal_minor, tax_minor, total_minor, public_token
        ) VALUES (
          $1, $2, 1, 'ETB', 'sent', CURRENT_DATE, CURRENT_DATE,
          1000, 0, 1000, 'token_num_1'
        )`,
        [bId, cId]
      );

      // Attempt to insert second invoice for SAME business with SAME number 1
      await expect(
        client.query(
          `INSERT INTO invoices (
            business_id, client_id, number, currency, status, issue_date, due_date,
            subtotal_minor, tax_minor, total_minor, public_token
          ) VALUES (
            $1, $2, 1, 'ETB', 'sent', CURRENT_DATE, CURRENT_DATE,
            2000, 0, 2000, 'token_num_2'
          )`,
          [bId, cId]
        )
      ).rejects.toThrowError(/duplicate key value violates unique constraint/);
    } finally {
      client.release();
    }
  });

  // Rule 3: A second succeeded payment for one invoice is rejected (payments_one_success_per_invoice)
  it('RULE 3: A second succeeded payment for one invoice is rejected by partial unique index', async () => {
    const client = await dbHelper.pool.connect();
    try {
      const u = await client.query(
        "INSERT INTO users (email, password_hash, name) VALUES ('u@test.com', 'hash', 'Owner') RETURNING id"
      );
      const b = await client.query(
        "INSERT INTO businesses (owner_id, name) VALUES ($1, 'Biz 1') RETURNING id",
        [u.rows[0].id]
      );
      const cl = await client.query(
        'INSERT INTO clients (business_id, name) VALUES ($1, $2) RETURNING id',
        [b.rows[0].id, 'Client 1']
      );
      const inv = await client.query(
        `INSERT INTO invoices (
          business_id, client_id, number, currency, status, issue_date, due_date,
          subtotal_minor, tax_minor, total_minor, public_token
        ) VALUES (
          $1, $2, 1, 'ETB', 'sent', CURRENT_DATE, CURRENT_DATE,
          5000, 0, 5000, 'token_pay_1'
        ) RETURNING id`,
        [b.rows[0].id, cl.rows[0].id]
      );

      const bId = b.rows[0].id;
      const invId = inv.rows[0].id;

      // Insert first succeeded payment
      await client.query(
        `INSERT INTO payments (
          business_id, invoice_id, provider, tx_ref, amount_minor, currency, status
        ) VALUES ($1, $2, 'simulated', 'tx_ref_success_1', 5000, 'ETB', 'succeeded')`,
        [bId, invId]
      );

      // Attempt second succeeded payment for the same invoice
      await expect(
        client.query(
          `INSERT INTO payments (
            business_id, invoice_id, provider, tx_ref, amount_minor, currency, status
          ) VALUES ($1, $2, 'simulated', 'tx_ref_success_2', 5000, 'ETB', 'succeeded')`,
          [bId, invId]
        )
      ).rejects.toThrowError(/payments_one_success_per_invoice/);
    } finally {
      client.release();
    }
  });

  // Rule 4: The same (provider, event_key) cannot be inserted twice
  it('RULE 4: The same (provider, event_key) cannot be inserted twice into payment_events', async () => {
    const client = await dbHelper.pool.connect();
    try {
      await client.query(
        `INSERT INTO payment_events (provider, event_key, event_type, payload)
         VALUES ('chapa', 'evt_key_100', 'payment.success', '{"id": 100}'::jsonb)`
      );

      await expect(
        client.query(
          `INSERT INTO payment_events (provider, event_key, event_type, payload)
           VALUES ('chapa', 'evt_key_100', 'payment.success', '{"id": 100}'::jsonb)`
        )
      ).rejects.toThrowError(/payment_events_provider_event_key_key|duplicate key value violates unique constraint/);
    } finally {
      client.release();
    }
  });

  // Rule 5: total_minor must equal subtotal_minor + tax_minor
  it('RULE 5: total_minor must equal subtotal_minor + tax_minor', async () => {
    const client = await dbHelper.pool.connect();
    try {
      const u = await client.query(
        "INSERT INTO users (email, password_hash, name) VALUES ('u@test.com', 'hash', 'Owner') RETURNING id"
      );
      const b = await client.query(
        "INSERT INTO businesses (owner_id, name) VALUES ($1, 'Biz 1') RETURNING id",
        [u.rows[0].id]
      );
      const cl = await client.query(
        'INSERT INTO clients (business_id, name) VALUES ($1, $2) RETURNING id',
        [b.rows[0].id, 'Client 1']
      );

      // Invalid: subtotal 1000 + tax 150 != total 1200
      await expect(
        client.query(
          `INSERT INTO invoices (
            business_id, client_id, currency, status, issue_date, due_date,
            subtotal_minor, tax_minor, total_minor, public_token
          ) VALUES (
            $1, $2, 'ETB', 'draft', CURRENT_DATE, CURRENT_DATE,
            1000, 150, 1200, 'token_invalid_total'
          )`,
          [b.rows[0].id, cl.rows[0].id]
        )
      ).rejects.toThrowError(/violates check constraint/);

      // Valid: subtotal 1000 + tax 150 == total 1150
      const valid = await client.query(
        `INSERT INTO invoices (
          business_id, client_id, currency, status, issue_date, due_date,
          subtotal_minor, tax_minor, total_minor, public_token
        ) VALUES (
          $1, $2, 'ETB', 'draft', CURRENT_DATE, CURRENT_DATE,
          1000, 150, 1150, 'token_valid_total'
        ) RETURNING id`,
        [b.rows[0].id, cl.rows[0].id]
      );
      expect(valid.rows[0].id).toBeDefined();
    } finally {
      client.release();
    }
  });

  // Rule 6: A non-draft invoice must have a number
  it('RULE 6: A non-draft invoice must have a number', async () => {
    const client = await dbHelper.pool.connect();
    try {
      const u = await client.query(
        "INSERT INTO users (email, password_hash, name) VALUES ('u@test.com', 'hash', 'Owner') RETURNING id"
      );
      const b = await client.query(
        "INSERT INTO businesses (owner_id, name) VALUES ($1, 'Biz 1') RETURNING id",
        [u.rows[0].id]
      );
      const cl = await client.query(
        'INSERT INTO clients (business_id, name) VALUES ($1, $2) RETURNING id',
        [b.rows[0].id, 'Client 1']
      );

      // Invalid: status is 'sent' but number is NULL
      await expect(
        client.query(
          `INSERT INTO invoices (
            business_id, client_id, number, currency, status, issue_date, due_date,
            subtotal_minor, tax_minor, total_minor, public_token
          ) VALUES (
            $1, $2, NULL, 'ETB', 'sent', CURRENT_DATE, CURRENT_DATE,
            1000, 0, 1000, 'token_sent_no_num'
          )`,
          [b.rows[0].id, cl.rows[0].id]
        )
      ).rejects.toThrowError(/violates check constraint/);

      // Valid: status is 'draft' with number NULL
      const draft = await client.query(
        `INSERT INTO invoices (
          business_id, client_id, number, currency, status, issue_date, due_date,
          subtotal_minor, tax_minor, total_minor, public_token
        ) VALUES (
          $1, $2, NULL, 'ETB', 'draft', CURRENT_DATE, CURRENT_DATE,
          1000, 0, 1000, 'token_draft_no_num'
        ) RETURNING id`,
        [b.rows[0].id, cl.rows[0].id]
      );
      expect(draft.rows[0].id).toBeDefined();

      // Valid: status is 'sent' with number 10
      const sent = await client.query(
        `INSERT INTO invoices (
          business_id, client_id, number, currency, status, issue_date, due_date,
          subtotal_minor, tax_minor, total_minor, public_token
        ) VALUES (
          $1, $2, 10, 'ETB', 'sent', CURRENT_DATE, CURRENT_DATE,
          1000, 0, 1000, 'token_sent_with_num'
        ) RETURNING id`,
        [b.rows[0].id, cl.rows[0].id]
      );
      expect(sent.rows[0].id).toBeDefined();
    } finally {
      client.release();
    }
  });
});
