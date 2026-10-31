import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../app';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { paymentRegistry } from './registry';
import { simulatedProvider } from './simulated.provider';
import { closeDbPool, getDbPool } from '../../db/pool';
import { createTestDbHelper, TestDbHelper } from '../../db/testDb';
import { resetRateLimits } from '../../middleware/rateLimit';

const testDbUrl = process.env.TEST_DATABASE_URL;
const describeDb = testDbUrl ? describe : describe.skip;

describe('Payments Unit & Mocked Tests (Always runs)', () => {
  const originalDemoMode = env.DEMO_MODE;
  const originalProviders = env.PAYMENT_PROVIDERS;

  afterAll(() => {
    (env as any).DEMO_MODE = originalDemoMode;
    (env as any).PAYMENT_PROVIDERS = originalProviders;
  });

  describe('Provider Registry', () => {
    it('returns enabled list based on config and excludes simulated when DEMO_MODE=false', () => {
      (env as any).PAYMENT_PROVIDERS = 'chapa,simulated';
      (env as any).DEMO_MODE = false;

      const enabled = paymentRegistry.getEnabledNames();
      expect(enabled).toContain('chapa');
      expect(enabled).not.toContain('simulated');
      expect(paymentRegistry.isEnabled('simulated')).toBe(false);
      expect(paymentRegistry.get('simulated')).toBeUndefined();
    });

    it('includes simulated provider when DEMO_MODE=true', () => {
      (env as any).PAYMENT_PROVIDERS = 'chapa,simulated';
      (env as any).DEMO_MODE = true;

      const enabled = paymentRegistry.getEnabledNames();
      expect(enabled).toContain('simulated');
      expect(paymentRegistry.isEnabled('simulated')).toBe(true);
      expect(paymentRegistry.get('simulated')).toBeDefined();
    });
  });

  describe('Simulated Provider Signature Verification', () => {
    const secret = env.SIMULATED_WEBHOOK_SECRET || 'simulated_secret_default_key';

    it('succeeds on valid HMAC signature', () => {
      const payload = Buffer.from(JSON.stringify({ event: 'payment.succeeded', txRef: 'tx_123' }), 'utf8');
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const isValid = simulatedProvider.verifySignature(payload, {
        'x-simulated-signature': sig,
      });
      expect(isValid).toBe(true);
    });

    it('fails on tampered body', () => {
      const payload = Buffer.from(JSON.stringify({ event: 'payment.succeeded', txRef: 'tx_123' }), 'utf8');
      const tampered = Buffer.from(JSON.stringify({ event: 'payment.succeeded', txRef: 'tx_999' }), 'utf8');
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const isValid = simulatedProvider.verifySignature(tampered, {
        'x-simulated-signature': sig,
      });
      expect(isValid).toBe(false);
    });

    it('fails on invalid signature string', () => {
      const payload = Buffer.from(JSON.stringify({ event: 'payment.succeeded', txRef: 'tx_123' }), 'utf8');
      const isValid = simulatedProvider.verifySignature(payload, {
        'x-simulated-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      });
      expect(isValid).toBe(false);
    });

    it('fails on missing signature header', () => {
      const payload = Buffer.from(JSON.stringify({ event: 'payment.succeeded', txRef: 'tx_123' }), 'utf8');
      const isValid = simulatedProvider.verifySignature(payload, {});
      expect(isValid).toBe(false);
    });
  });

  describe('Simulated Provider Event Parsing', () => {
    it('parses payment.succeeded events', () => {
      const payload = Buffer.from(
        JSON.stringify({
          type: 'payment.succeeded',
          txRef: 'tx_success_123',
          eventKey: 'ev_001',
        }),
        'utf8'
      );

      const parsed = simulatedProvider.parseEvent(payload);
      expect(parsed.type).toBe('payment.succeeded');
      expect(parsed.txRef).toBe('tx_success_123');
      expect(parsed.eventKey).toBe('ev_001');
    });

    it('parses payment.failed events', () => {
      const payload = Buffer.from(
        JSON.stringify({
          type: 'payment.failed',
          txRef: 'tx_fail_123',
        }),
        'utf8'
      );

      const parsed = simulatedProvider.parseEvent(payload);
      expect(parsed.type).toBe('payment.failed');
      expect(parsed.txRef).toBe('tx_fail_123');
    });

    it('parses payment.cancelled events', () => {
      const payload = Buffer.from(
        JSON.stringify({
          type: 'payment.cancelled',
          txRef: 'tx_cancel_123',
        }),
        'utf8'
      );

      const parsed = simulatedProvider.parseEvent(payload);
      expect(parsed.type).toBe('payment.cancelled');
      expect(parsed.txRef).toBe('tx_cancel_123');
    });

    it('returns ignored for unrecognized event types', () => {
      const payload = Buffer.from(
        JSON.stringify({
          type: 'customer.created',
          txRef: 'tx_other_123',
        }),
        'utf8'
      );

      const parsed = simulatedProvider.parseEvent(payload);
      expect(parsed.type).toBe('ignored');
    });

    it('handles malformed JSON payload safely', () => {
      const malformed = Buffer.from('{ not-valid-json', 'utf8');
      const parsed = simulatedProvider.parseEvent(malformed);
      expect(parsed.type).toBe('ignored');
    });
  });

  describe('Privacy & Sensitive Log Sanitization (Unit)', () => {
    it('automatically sanitizes sensitive fields in logger outputs', async () => {
      const sensitiveEmail = 'supersecretpayer@example.com';
      const sensitivePassword = 'SuperSecretPassword!';
      const sensitiveSecret = 'webhook_secret_key_123';

      const entries = await logger.captureLogs(() => {
        logger.info('Processing test transaction', {
          payerEmail: sensitiveEmail,
          payer_email: sensitiveEmail,
          password: sensitivePassword,
          secret: sensitiveSecret,
          txRef: 'tx_safe_ref_999',
        });
      });

      expect(entries.length).toBeGreaterThan(0);
      const entry = entries[0];
      const serialized = JSON.stringify(entry);

      // Sensitive fields must be redacted
      expect(serialized).not.toContain(sensitiveEmail);
      expect(serialized).not.toContain(sensitivePassword);
      expect(serialized).not.toContain(sensitiveSecret);
      expect(entry.meta.payerEmail).toBe('[REDACTED]');
      expect(entry.meta.txRef).toBe('tx_safe_ref_999');
    });
  });
});

describeDb('Payments Integration Tests (Live PostgreSQL)', { timeout: 30000 }, () => {
  let dbHelper: TestDbHelper;
  let userToken: string;
  let businessId: string;
  let clientId: string;

  const originalDemoMode = env.DEMO_MODE;
  const originalProviders = env.PAYMENT_PROVIDERS;

  beforeAll(async () => {
    (env as any).DEMO_MODE = true;
    (env as any).PAYMENT_PROVIDERS = 'simulated';

    dbHelper = createTestDbHelper(testDbUrl);
    await closeDbPool();
    await dbHelper.resetSchema();
  }, 30000);

  afterAll(async () => {
    (env as any).DEMO_MODE = originalDemoMode;
    (env as any).PAYMENT_PROVIDERS = originalProviders;
    if (dbHelper) {
      await dbHelper.close();
    }
    await closeDbPool();
  });

  beforeEach(async () => {
    simulatedProvider.reset();
    resetRateLimits();
    await dbHelper.cleanTables();

    // Register test business owner
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'paymentowner@example.com',
        password: 'Password123!',
        name: 'Payment Owner',
        businessName: 'Payments Test Co',
        defaultCurrency: 'ETB',
      });

    expect(regRes.status).toBe(201);
    userToken = regRes.body.token;
    businessId = regRes.body.business.id;

    // Create client
    const clientRes = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Payment Client',
        email: 'paymentclient@example.com',
        phone: '+251911000000',
      });

    expect(clientRes.status).toBe(201);
    clientId = clientRes.body.client.id;
  });

  /**
   * Helper to create and return an invoice
   */
  async function createInvoice(options?: { send?: boolean }) {
    const createRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        clientId,
        issueDate: '2026-10-30',
        dueDate: '2026-11-15',
        currency: 'ETB',
        items: [
          { description: 'Consulting Services', quantity: 2, unitPriceMinor: 50000 },
        ],
      });

    expect(createRes.status).toBe(201);
    const invoice = createRes.body.invoice;

    if (options?.send) {
      const sendRes = await request(app)
        .post(`/api/v1/invoices/${invoice.id}/send`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(sendRes.status).toBe(200);
      return sendRes.body.invoice;
    }

    return invoice;
  }

  describe('Payer Email & Database Privacy Verification', () => {
    it('never logs payerEmail when initiating checkout', async () => {
      const sentInvoice = await createInvoice({ send: true });
      const sensitivePayerEmail = 'confidential.payer@domain.com';

      const capturedLogs = await logger.captureLogs(async () => {
        const payRes = await request(app)
          .post(`/public/invoices/${sentInvoice.publicToken}/pay`)
          .send({
            payerEmail: sensitivePayerEmail,
            payerFirstName: 'Jane',
            payerLastName: 'Doe',
            provider: 'simulated',
          });

        expect(payRes.status).toBe(200);
      });

      const fullLogOutput = JSON.stringify(capturedLogs);
      expect(fullLogOutput).not.toContain(sensitivePayerEmail);
    });

    it('verifies payments table has no payer_email column (schema guarantee)', async () => {
      const pool = getDbPool()!;

      // 1. Check PostgreSQL information_schema
      const colsRes = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'payments' AND column_name = 'payer_email'`
      );
      expect(colsRes.rowCount).toBe(0);

      // 2. Direct insert attempt with payer_email must fail with undefined_column (code 42703)
      let insertError: any = null;
      try {
        await pool.query(
          `INSERT INTO payments (business_id, invoice_id, provider, tx_ref, amount_minor, currency, status, payer_email)
           VALUES ($1, $2, 'simulated', 'tx_test_illegal_col', 1000, 'ETB', 'pending', 'payer@test.com')`,
          [businessId, '00000000-0000-0000-0000-000000000000']
        );
      } catch (err: any) {
        insertError = err;
      }

      expect(insertError).toBeDefined();
      expect(insertError.code).toBe('42703'); // undefined_column in Postgres
    });
  });

  describe('Public Invoice Endpoints & Privacy Protections', () => {
    it('returns ONLY sanitized fields on GET /public/invoices/:token (never internal IDs or client contact info)', async () => {
      const sentInvoice = await createInvoice({ send: true });

      const res = await request(app).get(`/public/invoices/${sentInvoice.publicToken}`);
      expect(res.status).toBe(200);

      const body = res.body.invoice;

      // Required public fields
      expect(body.businessName).toBe('Payments Test Co');
      expect(body.clientName).toBe('Payment Client');
      expect(body.displayNumber).toMatch(/^INV-\d{4}$/);
      expect(body.issueDate).toBe('2026-10-30');
      expect(body.dueDate).toBe('2026-11-15');
      expect(body.currency).toBe('ETB');
      expect(body.status).toBe('sent');
      expect(body.subtotal).toBe(100000);
      expect(body.taxTotal).toBe(0);
      expect(body.total).toBe(100000);
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items[0]).toEqual({
        description: 'Consulting Services',
        quantity: 2,
        unitPrice: 50000,
        amount: 100000,
      });

      // Strict privacy assertions: NEVER return internal IDs or sensitive client details
      expect(body.id).toBeUndefined();
      expect(body.businessId).toBeUndefined();
      expect(body.business_id).toBeUndefined();
      expect(body.clientId).toBeUndefined();
      expect(body.client_id).toBeUndefined();
      expect(body.clientEmail).toBeUndefined();
      expect(body.client_email).toBeUndefined();
      expect(body.clientPhone).toBeUndefined();
      expect(body.client_phone).toBeUndefined();
      expect(body.ownerId).toBeUndefined();
      expect(body.owner_id).toBeUndefined();
    });

    it('returns 404 for draft invoices on all public endpoints', async () => {
      const draftInvoice = await createInvoice({ send: false });
      expect(draftInvoice.status).toBe('draft');

      // GET /public/invoices/:token
      const viewRes = await request(app).get(`/public/invoices/${draftInvoice.publicToken}`);
      expect(viewRes.status).toBe(404);

      // GET /public/invoices/:token/status
      const statusRes = await request(app).get(`/public/invoices/${draftInvoice.publicToken}/status`);
      expect(statusRes.status).toBe(404);

      // POST /public/invoices/:token/pay
      const payRes = await request(app)
        .post(`/public/invoices/${draftInvoice.publicToken}/pay`)
        .send({ provider: 'simulated' });
      expect(payRes.status).toBe(404);
    });

    it('returns clean minimal polling status on GET /public/invoices/:token/status', async () => {
      const sentInvoice = await createInvoice({ send: true });

      const res = await request(app).get(`/public/invoices/${sentInvoice.publicToken}/status`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'sent',
        currency: 'ETB',
        total: 100000,
        paidAt: null,
      });
    });
  });

  describe('Webhook Processing (10-Step Algorithm)', () => {
    const secret = env.SIMULATED_WEBHOOK_SECRET || 'simulated_secret_default_key';

    function signPayload(payloadObj: any): { rawBodyString: string; signature: string } {
      const rawBodyString = JSON.stringify(payloadObj);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(Buffer.from(rawBodyString, 'utf8'))
        .digest('hex');
      return { rawBodyString, signature };
    }

    it('rejects invalid signature with 401 and writes nothing to the database', async () => {
      const pool = getDbPool()!;
      const beforeEvents = await pool.query('SELECT count(*) FROM payment_events');

      const res = await request(app)
        .post('/webhooks/simulated')
        .set('Content-Type', 'application/json')
        .set('x-simulated-signature', 'bad_invalid_signature_hex')
        .send(JSON.stringify({ event: 'payment.succeeded', txRef: 'tx_does_not_matter' }));

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_SIGNATURE');

      const afterEvents = await pool.query('SELECT count(*) FROM payment_events');
      expect(afterEvents.rows[0].count).toBe(beforeEvents.rows[0].count);
    });

    it('handles duplicate webhook event with 200 { status: "duplicate" } without re-applying state', async () => {
      const sentInvoice = await createInvoice({ send: true });

      // Initiate payment
      const payRes = await request(app)
        .post(`/public/invoices/${sentInvoice.publicToken}/pay`)
        .send({ provider: 'simulated' });
      expect(payRes.status).toBe(200);

      const txRef = payRes.body.checkoutUrl.split('/').pop()!;
      const eventKey = `evt_dedup_${Date.now()}`;

      const { rawBodyString, signature } = signPayload({
        event: 'payment.succeeded',
        txRef,
        eventKey,
      });

      // First webhook
      const firstRes = await request(app)
        .post('/webhooks/simulated')
        .set('Content-Type', 'application/json')
        .set('x-simulated-signature', signature)
        .send(rawBodyString);

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.status).toBe('ok');

      // Second webhook with same eventKey
      const duplicateRes = await request(app)
        .post('/webhooks/simulated')
        .set('Content-Type', 'application/json')
        .set('x-simulated-signature', signature)
        .send(rawBodyString);

      expect(duplicateRes.status).toBe(200);
      expect(duplicateRes.body.status).toBe('duplicate');
    });

    it('records outcome "mismatch" when verified amount differs and does not mark invoice paid', async () => {
      const sentInvoice = await createInvoice({ send: true });

      const payRes = await request(app)
        .post(`/public/invoices/${sentInvoice.publicToken}/pay`)
        .send({ provider: 'simulated' });
      expect(payRes.status).toBe(200);

      const txRef = payRes.body.checkoutUrl.split('/').pop()!;

      // Deliberately tamper with provider transaction registry so verified amount differs
      simulatedProvider.setTransaction(txRef, {
        status: 'success',
        amountMinor: 99999999, // Mismatched amount
        currency: 'ETB',
      });

      const { rawBodyString, signature } = signPayload({
        event: 'payment.succeeded',
        txRef,
        eventKey: `evt_mismatch_${Date.now()}`,
      });

      const res = await request(app)
        .post('/webhooks/simulated')
        .set('Content-Type', 'application/json')
        .set('x-simulated-signature', signature)
        .send(rawBodyString);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('mismatch');

      // Invoice must still be 'sent'
      const checkRes = await request(app).get(`/public/invoices/${sentInvoice.publicToken}/status`);
      expect(checkRes.body.status).toBe('sent');
      expect(checkRes.body.paidAt).toBeNull();
    });

    it('records outcome "unknown_reference" for non-existent txRef', async () => {
      const unknownTxRef = 'tx_non_existent_reference_123';
      const { rawBodyString, signature } = signPayload({
        event: 'payment.succeeded',
        txRef: unknownTxRef,
        eventKey: `evt_unknown_${Date.now()}`,
      });

      const res = await request(app)
        .post('/webhooks/simulated')
        .set('Content-Type', 'application/json')
        .set('x-simulated-signature', signature)
        .send(rawBodyString);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('unknown_reference');
    });

    it('records outcome "duplicate_payment" for payment on already-paid invoice and preserves original paid_at', async () => {
      const sentInvoice = await createInvoice({ send: true });

      // First payment
      const payRes1 = await request(app)
        .post(`/public/invoices/${sentInvoice.publicToken}/pay`)
        .send({ provider: 'simulated' });
      const txRef1 = payRes1.body.checkoutUrl.split('/').pop()!;

      const { rawBodyString: body1, signature: sig1 } = signPayload({
        event: 'payment.succeeded',
        txRef: txRef1,
        eventKey: `evt_pay1_${Date.now()}`,
      });

      await request(app)
        .post('/webhooks/simulated')
        .set('Content-Type', 'application/json')
        .set('x-simulated-signature', sig1)
        .send(body1);

      // Verify invoice is paid
      const pool = getDbPool()!;
      const invAfterFirst = await pool.query<{ paid_at: Date; status: string }>(
        'SELECT paid_at, status FROM invoices WHERE id = $1',
        [sentInvoice.id]
      );
      expect(invAfterFirst.rows[0].status).toBe('paid');
      const originalPaidAt = invAfterFirst.rows[0].paid_at.toISOString();

      // Now create a second payment row on this already-paid invoice
      const txRef2 = `tx_second_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO payments (business_id, invoice_id, provider, tx_ref, amount_minor, currency, status)
         VALUES ($1, $2, 'simulated', $3, 100000, 'ETB', 'pending')`,
        [businessId, sentInvoice.id, txRef2]
      );

      const { rawBodyString: body2, signature: sig2 } = signPayload({
        event: 'payment.succeeded',
        txRef: txRef2,
        eventKey: `evt_pay2_${Date.now()}`,
      });

      const secondWebhookRes = await request(app)
        .post('/webhooks/simulated')
        .set('Content-Type', 'application/json')
        .set('x-simulated-signature', sig2)
        .send(body2);

      expect(secondWebhookRes.status).toBe(200);
      expect(secondWebhookRes.body.status).toBe('duplicate_payment');

      // Assert original paid_at was not modified
      const invAfterSecond = await pool.query<{ paid_at: Date }>(
        'SELECT paid_at FROM invoices WHERE id = $1',
        [sentInvoice.id]
      );
      expect(invAfterSecond.rows[0].paid_at.toISOString()).toBe(originalPaidAt);
    });

    it('records outcome "paid_on_unpayable_invoice" when payment arrives for a void invoice', async () => {
      const sentInvoice = await createInvoice({ send: true });

      // Initiate payment while sent
      const payRes = await request(app)
        .post(`/public/invoices/${sentInvoice.publicToken}/pay`)
        .send({ provider: 'simulated' });
      const txRef = payRes.body.checkoutUrl.split('/').pop()!;

      // Void the invoice
      const voidRes = await request(app)
        .post(`/api/v1/invoices/${sentInvoice.id}/void`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(voidRes.status).toBe(200);

      // Webhook arrives
      const { rawBodyString, signature } = signPayload({
        event: 'payment.succeeded',
        txRef,
        eventKey: `evt_void_${Date.now()}`,
      });

      const res = await request(app)
        .post('/webhooks/simulated')
        .set('Content-Type', 'application/json')
        .set('x-simulated-signature', signature)
        .send(rawBodyString);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paid_on_unpayable_invoice');
    });
  });

  describe('Full End-to-End Demo Payment Flow', () => {
    it('executes full payment cycle: draft -> send -> pay -> demo complete -> poll paid', async () => {
      // 1. Create draft invoice
      const draft = await createInvoice({ send: false });
      expect(draft.status).toBe('draft');

      // 2. Send invoice
      const sendRes = await request(app)
        .post(`/api/v1/invoices/${draft.id}/send`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(sendRes.status).toBe(200);
      expect(sendRes.body.invoice.status).toBe('sent');

      const token = sendRes.body.invoice.publicToken;

      // 3. Initiate payment via POST /public/invoices/:token/pay
      const payRes = await request(app)
        .post(`/public/invoices/${token}/pay`)
        .send({
          payerFirstName: 'Abebe',
          payerLastName: 'Bikila',
          provider: 'simulated',
        });

      expect(payRes.status).toBe(200);
      expect(payRes.body.checkoutUrl).toMatch(/^\/pay\/simulated\/tx_/);
      expect(payRes.body.demoCheckoutUrl).toBe(payRes.body.checkoutUrl);

      const txRef = payRes.body.checkoutUrl.replace('/pay/simulated/', '');

      // 4. Complete payment via POST /demo/simulated/:txRef/complete
      const completeRes = await request(app)
        .post(`/demo/simulated/${txRef}/complete`)
        .send();

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.status).toBe('ok');
      expect(completeRes.body.webhookStatus).toBe(200);

      // 5. Poll invoice status via GET /public/invoices/:token/status
      const statusRes = await request(app).get(`/public/invoices/${token}/status`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('paid');
      expect(statusRes.body.paidAt).toBeDefined();
      expect(statusRes.body.total).toBe(100000);
      expect(statusRes.body.currency).toBe('ETB');

      // 6. View full public invoice and verify payment listed
      const publicViewRes = await request(app).get(`/public/invoices/${token}`);
      expect(publicViewRes.status).toBe(200);
      expect(publicViewRes.body.invoice.status).toBe('paid');
      expect(publicViewRes.body.invoice.payments.length).toBe(1);
      expect(publicViewRes.body.invoice.payments[0].provider).toBe('simulated');
      expect(publicViewRes.body.invoice.payments[0].status).toBe('succeeded');
      expect(publicViewRes.body.invoice.payments[0].amount).toBe(100000);
    });
  });

  describe('POST /auth/demo Endpoint', () => {
    it('returns 404 when DEMO_MODE=false', async () => {
      (env as any).DEMO_MODE = false;

      const res = await request(app).post('/api/v1/auth/demo');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 with 1-hour JWT and demo user info when DEMO_MODE=true', async () => {
      (env as any).DEMO_MODE = true;

      const res = await request(app).post('/api/v1/auth/demo');
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('demo@goominvoice.com');
      expect(res.body.business).toBeDefined();
      expect(res.body.business.defaultCurrency).toBe('ETB');

      // Use the received token to authenticate against a protected endpoint
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.token}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('demo@goominvoice.com');
    });
  });
});
