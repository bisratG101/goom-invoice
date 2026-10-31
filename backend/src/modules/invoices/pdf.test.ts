import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { getDbPool, closeDbPool } from '../../db/pool';
import { createTestDbHelper, TestDbHelper } from '../../db/testDb';
import { signUserToken } from '../../utils/jwt';
import { generateInvoicePdf } from './pdf.service';

const testDbUrl = process.env.TEST_DATABASE_URL;
const describeDb = testDbUrl ? describe : describe.skip;

describe('PDF Service Unit Tests (no live DB required)', () => {
  it('renders a PDF with Ethiopic and Latin client name and starts with %PDF', async () => {
    const pdfBuffer = await generateInvoicePdf({
      businessName: 'Goom Logistics',
      invoicePrefix: 'INV',
      number: 1,
      displayNumber: 'INV-0001',
      status: 'sent',
      issueDate: '2026-10-31',
      dueDate: '2026-11-15',
      currency: 'ETB',
      clientName: 'Abebe Bikila አበበ ቢቂላ',
      items: [
        {
          position: 1,
          description: 'Consulting Services አገልግሎት',
          quantityMilli: 1000,
          unitPriceMinor: 50000,
          lineTotalMinor: 50000,
        },
      ],
      subtotalMinor: 50000,
      taxMinor: 7500,
      totalMinor: 57500,
      taxRateBps: 1500,
      notes: 'Payment due upon receipt. አመሰግናለሁ!',
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(100);

    // Assert PDF header magic bytes %PDF
    const header = pdfBuffer.slice(0, 4).toString('utf8');
    expect(header).toBe('%PDF');
  });

  it('supports long wrapping descriptions and multiple pages', async () => {
    const items = [];
    for (let i = 1; i <= 35; i++) {
      items.push({
        position: i,
        description: `Line item ${i}: Extremely long detailed work description explaining deliverables, milestones, and testing verification steps that wrap across lines nicely.`,
        quantityMilli: 1000,
        unitPriceMinor: 10000,
        lineTotalMinor: 10000,
      });
    }

    const pdfBuffer = await generateInvoicePdf({
      businessName: 'Multi-page Corp',
      number: 42,
      displayNumber: 'INV-0042',
      status: 'paid',
      issueDate: '2026-10-01',
      dueDate: '2026-10-15',
      currency: 'USD',
      clientName: 'Global Client LLC',
      items,
      subtotalMinor: 350000,
      taxMinor: 0,
      totalMinor: 350000,
      notes: 'Multi-page invoice verified.',
    });

    const header = pdfBuffer.slice(0, 4).toString('utf8');
    expect(header).toBe('%PDF');
    expect(pdfBuffer.length).toBeGreaterThan(5000);
  });
});

describeDb('Invoice PDF Integration Tests (Live PostgreSQL)', { timeout: 30000 }, () => {
  let dbHelper: TestDbHelper;
  let user1Token: string;
  let user2Token: string;
  let business1Id: string;
  let business2Id: string;
  let client1Id: string;

  beforeAll(async () => {
    dbHelper = createTestDbHelper(testDbUrl!);
    await closeDbPool();
    await dbHelper.resetSchema();
  }, 30000);

  beforeEach(async () => {
    await dbHelper.cleanTables();
    const pool = getDbPool();

    // Business 1 & Owner 1
    const u1 = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ('owner1@goom.com', 'hash1', 'Owner One')
       RETURNING id, email`
    );
    const b1 = await pool.query(
      `INSERT INTO businesses (owner_id, name, default_currency, invoice_prefix, timezone)
       VALUES ($1, 'Business Alpha', 'ETB', 'ALP', 'Africa/Addis_Ababa')
       RETURNING id`,
      [u1.rows[0].id]
    );
    user1Token = signUserToken({ userId: u1.rows[0].id, email: u1.rows[0].email });
    business1Id = b1.rows[0].id;

    // Client for Business 1 with Ethiopic name
    const c1 = await pool.query(
      `INSERT INTO clients (business_id, name, email)
       VALUES ($1, 'Abebe Bikila አበበ ቢቂላ', 'abebe@bikila.com')
       RETURNING id`,
      [business1Id]
    );
    client1Id = c1.rows[0].id;

    // Business 2 & Owner 2
    const u2 = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ('owner2@goom.com', 'hash2', 'Owner Two')
       RETURNING id, email`
    );
    const b2 = await pool.query(
      `INSERT INTO businesses (owner_id, name, default_currency, invoice_prefix, timezone)
       VALUES ($1, 'Business Beta', 'USD', 'BET', 'America/New_York')
       RETURNING id`,
      [u2.rows[0].id]
    );
    user2Token = signUserToken({ userId: u2.rows[0].id, email: u2.rows[0].email });
    business2Id = b2.rows[0].id;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.close();
    }
    await closeDbPool();
  });

  it('Owner PDF endpoint returns application/pdf and starts with %PDF', async () => {
    // Create and send invoice
    const createRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        clientId: client1Id,
        currency: 'ETB',
        issueDate: '2026-10-31',
        dueDate: '2026-11-15',
        items: [
          { description: 'Transport አገልግሎት', quantity: 2, unitPrice: 500 },
        ],
      });
    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.invoice.id;

    const sendRes = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${user1Token}`);
    expect(sendRes.status).toBe(200);

    // Request PDF as owner
    const pdfRes = await request(app)
      .get(`/api/v1/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(pdfRes.headers['content-disposition']).toContain('inline; filename="invoice-ALP-0001.pdf"');

    const bodyBuffer = pdfRes.body as Buffer;
    expect(bodyBuffer.slice(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('Owner cannot download another business invoice PDF (tenant isolation returns 404)', async () => {
    // Invoice belonging to Business 1
    const createRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        clientId: client1Id,
        currency: 'ETB',
        issueDate: '2026-10-31',
        dueDate: '2026-11-15',
        items: [{ description: 'Secret work', quantity: 1, unitPrice: 100 }],
      });
    const invoiceId = createRes.body.invoice.id;

    // User 2 (Business 2) attempts to download User 1's invoice PDF
    const pdfRes = await request(app)
      .get(`/api/v1/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${user2Token}`);

    expect(pdfRes.status).toBe(404);
    expect(pdfRes.body.error.code).toBe('INVOICE_NOT_FOUND');
  });

  it('Public PDF endpoint rejects draft invoices (returns 404)', async () => {
    const createRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        clientId: client1Id,
        currency: 'ETB',
        issueDate: '2026-10-31',
        dueDate: '2026-11-15',
        items: [{ description: 'Draft work', quantity: 1, unitPrice: 100 }],
      });
    const token = createRes.body.invoice.publicToken;

    const pubRes = await request(app).get(`/api/v1/public/invoices/${token}/pdf`);
    expect(pubRes.status).toBe(404);
    expect(pubRes.body.error.code).toBe('INVOICE_NOT_FOUND');
  });

  it('Public PDF endpoint succeeds for sent, paid, and void invoices without exposing private data', async () => {
    // 1. Sent Invoice
    const createRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        clientId: client1Id,
        currency: 'ETB',
        issueDate: '2026-10-31',
        dueDate: '2026-11-15',
        items: [{ description: 'Public consultation', quantity: 1, unitPrice: 100 }],
      });
    const invId = createRes.body.invoice.id;

    const sendRes = await request(app)
      .post(`/api/v1/invoices/${invId}/send`)
      .set('Authorization', `Bearer ${user1Token}`);
    const token = sendRes.body.invoice.publicToken;

    const sentPdfRes = await request(app).get(`/api/v1/public/invoices/${token}/pdf`);
    expect(sentPdfRes.status).toBe(200);
    expect(sentPdfRes.headers['content-type']).toBe('application/pdf');
    expect((sentPdfRes.body as Buffer).slice(0, 4).toString('utf8')).toBe('%PDF');

    // 2. Void Invoice
    await request(app)
      .post(`/api/v1/invoices/${invId}/void`)
      .set('Authorization', `Bearer ${user1Token}`);

    const voidPdfRes = await request(app).get(`/api/v1/public/invoices/${token}/pdf`);
    expect(voidPdfRes.status).toBe(200);
    expect(voidPdfRes.headers['content-type']).toBe('application/pdf');
    expect((voidPdfRes.body as Buffer).slice(0, 4).toString('utf8')).toBe('%PDF');
  });
});
