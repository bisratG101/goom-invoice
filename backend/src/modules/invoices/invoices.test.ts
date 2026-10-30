import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { closeDbPool } from '../../db/pool';
import { createTestDbHelper, TestDbHelper } from '../../db/testDb';
import { getTodayInTimezone, isInvoiceOverdue } from '../../utils/timezone';

const testDbUrl = process.env.TEST_DATABASE_URL;
const describeDb = testDbUrl ? describe : describe.skip;

describe('Invoices Unit & Validation Tests (Always runs)', () => {
  it('rejects unauthenticated requests to all invoice endpoints', async () => {
    const fakeId = '11111111-1111-4111-8111-111111111111';

    const res1 = await request(app).get('/api/v1/invoices');
    expect(res1.status).toBe(401);

    const res2 = await request(app).post('/api/v1/invoices').send({});
    expect(res2.status).toBe(401);

    const res3 = await request(app).get(`/api/v1/invoices/${fakeId}`);
    expect(res3.status).toBe(401);

    const res4 = await request(app).patch(`/api/v1/invoices/${fakeId}`).send({});
    expect(res4.status).toBe(401);

    const res5 = await request(app).delete(`/api/v1/invoices/${fakeId}`);
    expect(res5.status).toBe(401);

    const res6 = await request(app).post(`/api/v1/invoices/${fakeId}/send`);
    expect(res6.status).toBe(401);

    const res7 = await request(app).post(`/api/v1/invoices/${fakeId}/void`);
    expect(res7.status).toBe(401);
  });

  describe('Timezone & Overdue Boundary Logic', () => {
    it('accurately derives today across different timezones', () => {
      // 2026-10-30T22:30:00Z is 2026-10-31 01:30 in Addis Ababa (UTC+3)
      // and 2026-10-30 18:30 in New York (UTC-4)
      const testDate = new Date('2026-10-30T22:30:00.000Z');
      expect(getTodayInTimezone('Africa/Addis_Ababa', testDate)).toBe('2026-10-31');
      expect(getTodayInTimezone('America/New_York', testDate)).toBe('2026-10-30');
    });

    it('enforces exact due date boundary: NOT overdue on the due date, overdue only after due date passes', () => {
      const fixedAsOf = new Date('2026-10-30T12:00:00.000Z');
      const tz = 'Africa/Addis_Ababa'; // today is 2026-10-30

      // 1. Due date is today => NOT overdue
      expect(isInvoiceOverdue('sent', '2026-10-30', tz, fixedAsOf)).toBe(false);

      // 2. Due date is in future (tomorrow) => NOT overdue
      expect(isInvoiceOverdue('sent', '2026-10-31', tz, fixedAsOf)).toBe(false);

      // 3. Due date was yesterday => IS overdue
      expect(isInvoiceOverdue('sent', '2026-10-29', tz, fixedAsOf)).toBe(true);

      // 4. Drafts, paid, and void invoices are NEVER overdue regardless of date
      expect(isInvoiceOverdue('draft', '2026-10-25', tz, fixedAsOf)).toBe(false);
      expect(isInvoiceOverdue('paid', '2026-10-25', tz, fixedAsOf)).toBe(false);
      expect(isInvoiceOverdue('void', '2026-10-25', tz, fixedAsOf)).toBe(false);
    });
  });
});

describeDb('Invoices Integration Tests (Live PostgreSQL)', { timeout: 30000 }, () => {
  let dbHelper: TestDbHelper;
  let tokenA: string;
  let businessAId: string;
  let clientAId: string;
  let tokenB: string;
  let businessBId: string;
  let clientBId: string;

  beforeAll(async () => {
    dbHelper = createTestDbHelper(testDbUrl);
    await closeDbPool();
    await dbHelper.resetSchema();
  }, 30000);

  beforeEach(async () => {
    await dbHelper.cleanTables();

    // Register Business A
    const regA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'ownerA@example.com',
        password: 'Password123!',
        name: 'Owner A',
        businessName: 'Business A Corp',
        defaultCurrency: 'ETB',
      });
    expect(regA.status).toBe(201);
    tokenA = regA.body.token;
    businessAId = regA.body.business.id;

    // Create client for Business A
    const clA = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Client A', email: 'clientA@example.com' });
    expect(clA.status).toBe(201);
    clientAId = clA.body.client.id;

    // Register Business B
    const regB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'ownerB@example.com',
        password: 'Password123!',
        name: 'Owner B',
        businessName: 'Business B LLC',
        defaultCurrency: 'USD',
      });
    expect(regB.status).toBe(201);
    tokenB = regB.body.token;
    businessBId = regB.body.business.id;

    // Create client for Business B
    const clB = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Client B', email: 'clientB@example.com' });
    expect(clB.status).toBe(201);
    clientBId = clB.body.client.id;
  });

  afterAll(async () => {
    await closeDbPool();
    if (dbHelper) {
      await dbHelper.close();
    }
  });

  it('creates draft invoice with hand-calculated monetary examples and ignores client-supplied totals', async () => {
    const res = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientAId,
        currency: 'ETB',
        issueDate: '2026-10-01',
        dueDate: '2026-10-15',
        taxRateBps: 1500, // 15% VAT
        notes: 'Hand-calculated test',
        // Client attempts to send spoofed totals:
        subtotal_minor: 999999,
        tax_minor: 999999,
        total_minor: 999999,
        items: [
          {
            description: 'Consulting Services',
            quantityMilli: 2000, // 2.000 items
            unitPriceMinor: 15000, // 150.00 ETB
            line_total_minor: 1, // Spoofed line total
          },
          {
            description: 'Server Setup',
            quantityMilli: 1500, // 1.500 items
            unitPriceMinor: 2000, // 20.00 ETB
          },
        ],
      });

    expect(res.status).toBe(201);
    const inv = res.body.invoice;

    expect(inv.status).toBe('draft');
    expect(inv.number).toBeNull();
    expect(inv.displayNumber).toBeNull();
    expect(inv.publicToken).toHaveLength(43); // 32 bytes in base64url is 43 chars
    expect(inv.items).toHaveLength(2);

    // Hand-calculated verification:
    // Line 1: round_half_up(2000 * 15000 / 1000) = 30000 minor (300.00 ETB)
    expect(inv.items[0].lineTotalMinor).toBe(30000);
    expect(inv.items[0].position).toBe(1);

    // Line 2: round_half_up(1500 * 2000 / 1000) = 3000 minor (30.00 ETB)
    expect(inv.items[1].lineTotalMinor).toBe(3000);
    expect(inv.items[1].position).toBe(2);

    // Subtotal: 30000 + 3000 = 33000 minor (330.00 ETB)
    expect(inv.subtotalMinor).toBe(33000);

    // Tax: round_half_up(33000 * 1500 / 10000) = 4950 minor (49.50 ETB)
    expect(inv.taxMinor).toBe(4950);

    // Total: 33000 + 4950 = 37950 minor (379.50 ETB)
    expect(inv.totalMinor).toBe(37950);
  });

  it('rejects invoice creation if client does not belong to the business', async () => {
    const res = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientBId, // Belongs to Business B
        items: [{ description: 'Test', quantityMilli: 1000, unitPriceMinor: 1000 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLIENT_NOT_FOUND');
  });

  it('rejects dueDate before issueDate', async () => {
    const res = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientAId,
        issueDate: '2026-10-15',
        dueDate: '2026-10-10', // Prior to issue date
        items: [{ description: 'Test', quantityMilli: 1000, unitPriceMinor: 1000 }],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('performs full invoice lifecycle: draft -> update -> send -> void', async () => {
    // 1. Create draft
    const createRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientAId,
        items: [{ description: 'Initial Item', quantityMilli: 1000, unitPriceMinor: 5000 }],
      });
    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.invoice.id;

    // 2. Update draft: replace items collection and update notes
    const updateRes = await request(app)
      .patch(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        notes: 'Updated notes',
        items: [
          { description: 'Replacement Item 1', quantityMilli: 1000, unitPriceMinor: 10000 },
          { description: 'Replacement Item 2', quantityMilli: 2000, unitPriceMinor: 5000 },
        ],
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.invoice.notes).toBe('Updated notes');
    expect(updateRes.body.invoice.items).toHaveLength(2);
    expect(updateRes.body.invoice.subtotalMinor).toBe(20000);

    // 3. Send draft
    const sendRes = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.invoice.status).toBe('sent');
    expect(sendRes.body.invoice.number).toBe(1);
    expect(sendRes.body.invoice.displayNumber).toBe('INV-0001');
    expect(sendRes.body.invoice.sentAt).not.toBeNull();
    expect(sendRes.body).toHaveProperty('publicUrl');
    expect(sendRes.body.publicUrl).toContain(`/i/${sendRes.body.invoice.publicToken}`);

    // 4. Void sent invoice
    const voidRes = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.invoice.status).toBe('void');
    expect(voidRes.body.invoice.number).toBe(1); // Number is retained
    expect(voidRes.body.invoice.displayNumber).toBe('INV-0001');
    expect(voidRes.body.invoice.voidedAt).not.toBeNull();
  });

  it('enforces draft-only editing and deletion rules', async () => {
    // Create and send an invoice
    const createRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientAId,
        items: [{ description: 'Test', quantityMilli: 1000, unitPriceMinor: 5000 }],
      });
    const invoiceId = createRes.body.invoice.id;

    await request(app)
      .post(`/api/v1/invoices/${invoiceId}/send`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Attempt to PATCH sent invoice -> 422 DRAFT_ONLY
    const patchRes = await request(app)
      .patch(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ notes: 'Illegal edit' });
    expect(patchRes.status).toBe(422);
    expect(patchRes.body.error.code).toBe('DRAFT_ONLY');

    // Attempt to DELETE sent invoice -> 422 DRAFT_ONLY
    const deleteRes = await request(app)
      .delete(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(deleteRes.status).toBe(422);
    expect(deleteRes.body.error.code).toBe('DRAFT_ONLY');

    // Void the invoice
    await request(app)
      .post(`/api/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Attempt to PATCH void invoice -> 422 DRAFT_ONLY
    const patchVoidRes = await request(app)
      .patch(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ notes: 'Illegal edit void' });
    expect(patchVoidRes.status).toBe(422);
    expect(patchVoidRes.body.error.code).toBe('DRAFT_ONLY');

    // Attempt to DELETE void invoice -> 422 DRAFT_ONLY
    const deleteVoidRes = await request(app)
      .delete(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(deleteVoidRes.status).toBe(422);
    expect(deleteVoidRes.body.error.code).toBe('DRAFT_ONLY');
  });

  it('rejects illegal status transitions', async () => {
    // 1. Cannot send an invoice with 0 items or total = 0
    const emptyInvRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientAId,
        items: [],
      });
    const emptyId = emptyInvRes.body.invoice.id;

    const sendEmptyRes = await request(app)
      .post(`/api/v1/invoices/${emptyId}/send`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(sendEmptyRes.status).toBe(422);
    expect(sendEmptyRes.body.error.code).toBe('CANNOT_SEND_EMPTY_INVOICE');

    // 2. Cannot void a draft invoice
    const voidDraftRes = await request(app)
      .post(`/api/v1/invoices/${emptyId}/void`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(voidDraftRes.status).toBe(422);
    expect(voidDraftRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    // 3. Draft deletion works
    const delDraftRes = await request(app)
      .delete(`/api/v1/invoices/${emptyId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(delDraftRes.status).toBe(204);

    // Verify invoice is gone
    const getGone = await request(app)
      .get(`/api/v1/invoices/${emptyId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(getGone.status).toBe(404);
  });

  it('enforces cross-business tenant isolation returning 404 for every operation', async () => {
    // Create invoice under Business B
    const createB = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        clientId: clientBId,
        items: [{ description: 'Secret B Item', quantityMilli: 1000, unitPriceMinor: 10000 }],
      });
    const invoiceBId = createB.body.invoice.id;

    // Send under Business B
    await request(app)
      .post(`/api/v1/invoices/${invoiceBId}/send`)
      .set('Authorization', `Bearer ${tokenB}`);

    // Business A attempts GET -> 404
    const getRes = await request(app)
      .get(`/api/v1/invoices/${invoiceBId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe('INVOICE_NOT_FOUND');

    // Business A attempts PATCH -> 404
    const patchRes = await request(app)
      .patch(`/api/v1/invoices/${invoiceBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ notes: 'Hack' });
    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe('INVOICE_NOT_FOUND');

    // Business A attempts DELETE -> 404
    const delRes = await request(app)
      .delete(`/api/v1/invoices/${invoiceBId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(delRes.status).toBe(404);
    expect(delRes.body.error.code).toBe('INVOICE_NOT_FOUND');

    // Business A attempts SEND -> 404
    const sendRes = await request(app)
      .post(`/api/v1/invoices/${invoiceBId}/send`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(sendRes.status).toBe(404);
    expect(sendRes.body.error.code).toBe('INVOICE_NOT_FOUND');

    // Business A attempts VOID -> 404
    const voidRes = await request(app)
      .post(`/api/v1/invoices/${invoiceBId}/void`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(voidRes.status).toBe(404);
    expect(voidRes.body.error.code).toBe('INVOICE_NOT_FOUND');

    // List under Business A does NOT reveal Business B's invoice
    const listRes = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(listRes.body.invoices.find((i: any) => i.id === invoiceBId)).toBeUndefined();
  });

  it('filters invoices by status (including overdue) and search term', async () => {
    // Invoice 1: draft
    await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientAId,
        notes: 'Alpha invoice',
        items: [{ description: 'Item 1', quantityMilli: 1000, unitPriceMinor: 1000 }],
      });

    // Invoice 2: sent, due in future
    const inv2 = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientAId,
        dueDate: '2099-12-31',
        notes: 'Beta invoice',
        items: [{ description: 'Item 2', quantityMilli: 1000, unitPriceMinor: 2000 }],
      });
    await request(app)
      .post(`/api/v1/invoices/${inv2.body.invoice.id}/send`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Invoice 3: sent, due in the past (overdue)
    const inv3 = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: clientAId,
        issueDate: '2020-01-01',
        dueDate: '2020-01-15',
        notes: 'Gamma invoice',
        items: [{ description: 'Item 3', quantityMilli: 1000, unitPriceMinor: 3000 }],
      });
    await request(app)
      .post(`/api/v1/invoices/${inv3.body.invoice.id}/send`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Filter status=draft
    const draftList = await request(app)
      .get('/api/v1/invoices?status=draft')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(draftList.body.invoices).toHaveLength(1);
    expect(draftList.body.invoices[0].notes).toBe('Alpha invoice');

    // Filter status=overdue
    const overdueList = await request(app)
      .get('/api/v1/invoices?status=overdue')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(overdueList.body.invoices).toHaveLength(1);
    expect(overdueList.body.invoices[0].id).toBe(inv3.body.invoice.id);
    expect(overdueList.body.invoices[0].isOverdue).toBe(true);

    // Search query q=Beta
    const searchList = await request(app)
      .get('/api/v1/invoices?q=Beta')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(searchList.body.invoices).toHaveLength(1);
    expect(searchList.body.invoices[0].notes).toBe('Beta invoice');
  });

  // Concurrency Test: 10 drafts sent concurrently produces unique consecutive numbers.
  // We run this 5 times in a loop to prove consistency and no race conditions.
  for (let run = 1; run <= 5; run++) {
    it(`[Run ${run}/5] CONCURRENCY TEST: 10 concurrent draft sends produce unique consecutive numbers without gaps`, async () => {
      // Create 10 separate draft invoices concurrently using Promise.all
      const createPromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/v1/invoices')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({
            clientId: clientAId,
            items: [{ description: `Item ${i + 1}`, quantityMilli: 1000, unitPriceMinor: 1000 * (i + 1) }],
          })
      );
      const createResponses = await Promise.all(createPromises);
      for (const createRes of createResponses) {
        expect(createRes.status).toBe(201);
      }
      const draftIds = createResponses.map((res) => res.body.invoice.id);

      // Concurrently send all 10 drafts at the exact same moment
      const sendPromises = draftIds.map((id) =>
        request(app)
          .post(`/api/v1/invoices/${id}/send`)
          .set('Authorization', `Bearer ${tokenA}`)
      );

      const results = await Promise.all(sendPromises);

      // Verify every request succeeded
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.invoice.status).toBe('sent');
      }

      // Extract assigned invoice numbers
      const assignedNumbers = results
        .map((res) => res.body.invoice.number)
        .sort((a, b) => a - b);

      // Verify exactly 10 numbers
      expect(assignedNumbers).toHaveLength(10);

      // Verify no duplicates
      const uniqueNumbers = new Set(assignedNumbers);
      expect(uniqueNumbers.size).toBe(10);

      // Verify numbers are strictly consecutive (e.g. [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      const startNum = assignedNumbers[0];
      for (let j = 0; j < 10; j++) {
        expect(assignedNumbers[j]).toBe(startNum + j);
      }
    });
  }
});
