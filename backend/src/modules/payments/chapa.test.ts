import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { Pool } from 'pg';
import { chapaProvider, CHAPA_CONSTANTS, getChapaKeyMode } from './chapa';
import { processWebhook } from './webhook.service';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

describe('Chapa Provider Unit & Mock Tests', () => {
  const originalFetch = global.fetch;
  const originalEnvSecret = env.CHAPA_SECRET_KEY;
  const originalWebhookSecret = env.CHAPA_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.restoreAllMocks();
    (env as any).CHAPA_SECRET_KEY = 'CHASECK_TEST-mock-chapa-secret-key-12345';
    (env as any).CHAPA_WEBHOOK_SECRET = 'mock-webhook-secret-hash-67890';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (env as any).CHAPA_SECRET_KEY = originalEnvSecret;
    (env as any).CHAPA_WEBHOOK_SECRET = originalWebhookSecret;
  });

  describe('Operational Key Mode Evaluation', () => {
    it('evaluates test mode for keys starting with CHASECK_TEST-', () => {
      expect(getChapaKeyMode('CHASECK_TEST-12345')).toBe('test');
    });

    it('evaluates live mode for keys starting with CHASECK-', () => {
      expect(getChapaKeyMode('CHASECK-98765')).toBe('live');
    });

    it('checks CHASECK_TEST- before CHASECK- so test keys are never evaluated as live', () => {
      const testKey = 'CHASECK_TEST-live-prefix-overlap';
      expect(getChapaKeyMode(testKey)).toBe('test');
    });

    it('throws for unrecognized or invalid key prefixes', () => {
      expect(() => getChapaKeyMode('INVALID-PREFIX-123')).toThrow(
        /Invalid CHAPA_SECRET_KEY prefix/
      );
    });
  });

  describe('createCheckout', () => {
    it('initializes checkout and returns checkout_url without floating-point math', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Hosted Link',
          data: {
            checkout_url: 'https://checkout.chapa.co/checkout/payment/mock-checkout-id',
          },
        }),
      });
      global.fetch = mockFetch;

      const result = await chapaProvider.createCheckout({
        txRef: 'chapa_tx_12345678',
        amountMinor: 10000, // 100.00 ETB
        currency: 'ETB',
        returnUrl: 'https://example.com/invoices/public/token123',
        description: 'Invoice INV-0001',
        payer: {
          name: 'Abebe Bikila',
          email: 'abebe@example.com',
        },
      });

      expect(result.checkoutUrl).toBe(
        'https://checkout.chapa.co/checkout/payment/mock-checkout-id'
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.chapa.co/v1/transaction/initialize');
      expect(options.method).toBe('POST');
      expect(options.headers[CHAPA_CONSTANTS.HEADER_AUTHORIZATION]).toBe(
        'Bearer CHASECK_TEST-mock-chapa-secret-key-12345'
      );

      const sentBody = JSON.parse(options.body);
      expect(sentBody).toEqual({
        amount: '100.00',
        currency: 'ETB',
        email: 'abebe@example.com',
        tx_ref: 'chapa_tx_12345678',
        return_url: 'https://example.com/invoices/public/token123',
        first_name: 'Abebe',
        last_name: 'Bikila',
        customization: {
          title: 'Invoice INV-0001',
        },
      });
      // callback_url must be omitted
      expect(sentBody.callback_url).toBeUndefined();
    });

    it('rejects if payer email is missing per design.md §9', async () => {
      await expect(
        chapaProvider.createCheckout({
          txRef: 'chapa_tx_999',
          amountMinor: 5000,
          currency: 'ETB',
          returnUrl: 'https://example.com/return',
          description: 'No email invoice',
          payer: {
            name: 'Payer Without Email',
            email: '',
          },
        })
      ).rejects.toThrow(/Payer email is required/);
    });

    it('throws if Chapa initialize API rejects or returns non-success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          status: 'failed',
          message: 'Invalid transaction reference',
        }),
      });

      await expect(
        chapaProvider.createCheckout({
          txRef: 'chapa_tx_bad',
          amountMinor: 5000,
          currency: 'ETB',
          returnUrl: 'https://example.com/return',
          description: 'Bad invoice',
          payer: {
            name: 'Test Payer',
            email: 'test@example.com',
          },
        })
      ).rejects.toThrow(/Chapa initialize rejected: Invalid transaction reference/);
    });

    it('never logs payer email, credentials, or full payload', async () => {
      const loggerInfoSpy = vi.spyOn(logger, 'info');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            checkout_url: 'https://checkout.chapa.co/checkout/payment/safe',
          },
        }),
      });

      await chapaProvider.createCheckout({
        txRef: 'chapa_tx_safe_log',
        amountMinor: 7500,
        currency: 'USD',
        returnUrl: 'https://example.com/safe',
        description: 'Safe Logging Invoice',
        payer: {
          name: 'Sensitive Customer',
          email: 'sensitive-customer@secret.com',
        },
      });

      for (const call of loggerInfoSpy.mock.calls) {
        const logContent = JSON.stringify(call);
        expect(logContent).not.toContain('sensitive-customer@secret.com');
        expect(logContent).not.toContain('CHASECK_TEST-');
      }
    });
  });

  describe('verifySignature', () => {
    const rawPayload = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        tx_ref: 'chapa_tx_123',
        amount: '100.00',
        currency: 'ETB',
      }),
      'utf8'
    );

    function computeSignature(payload: Buffer, secret: string) {
      return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    }

    it('accepts valid x-chapa-signature matching raw request body bytes', () => {
      const validSig = computeSignature(rawPayload, env.CHAPA_WEBHOOK_SECRET!);
      const isValid = chapaProvider.verifySignature(rawPayload, {
        'x-chapa-signature': validSig,
      });
      expect(isValid).toBe(true);
    });

    it('rejects tampered raw payload', () => {
      const validSig = computeSignature(rawPayload, env.CHAPA_WEBHOOK_SECRET!);
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          tx_ref: 'chapa_tx_123',
          amount: '10000.00', // tampered amount
          currency: 'ETB',
        }),
        'utf8'
      );

      const isValid = chapaProvider.verifySignature(tamperedPayload, {
        'x-chapa-signature': validSig,
      });
      expect(isValid).toBe(false);
    });

    it('rejects missing x-chapa-signature header', () => {
      const isValid = chapaProvider.verifySignature(rawPayload, {});
      expect(isValid).toBe(false);
    });

    it('rejects Chapa-Signature header without fallback', () => {
      const validSig = computeSignature(rawPayload, env.CHAPA_WEBHOOK_SECRET!);
      // Even if Chapa-Signature is provided, x-chapa-signature is exclusively required
      const isValid = chapaProvider.verifySignature(rawPayload, {
        'chapa-signature': validSig,
      });
      expect(isValid).toBe(false);
    });
  });

  describe('parseEvent', () => {
    it('extracts tx_ref and maps charge.success to payment.succeeded', () => {
      const raw = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          tx_ref: 'our_tx_ref_001',
          reference: 'chapa_internal_ref_999',
          status: 'success',
        }),
        'utf8'
      );

      const event = chapaProvider.parseEvent(raw);
      expect(event.type).toBe('payment.succeeded');
      expect(event.txRef).toBe('our_tx_ref_001');
      expect(event.eventKey).toBe('chapa:ref:chapa_internal_ref_999:charge.success');
    });

    it('extracts tx_ref and maps charge.failed to payment.failed', () => {
      const raw = Buffer.from(
        JSON.stringify({
          event: 'charge.failed',
          tx_ref: 'our_tx_ref_002',
          reference: 'chapa_internal_ref_888',
          status: 'failed',
        }),
        'utf8'
      );

      const event = chapaProvider.parseEvent(raw);
      expect(event.type).toBe('payment.failed');
      expect(event.txRef).toBe('our_tx_ref_002');
      expect(event.eventKey).toBe('chapa:ref:chapa_internal_ref_888:charge.failed');
    });

    it('constructs reference-based keys when reference is present', () => {
      const raw = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          tx_ref: 'my_tx_123',
          reference: 'my_ref_456',
        }),
        'utf8'
      );
      const event = chapaProvider.parseEvent(raw);
      expect(event.eventKey).toBe('chapa:ref:my_ref_456:charge.success');
    });

    it('constructs tx_ref fallback keys when reference is missing', () => {
      const raw = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          tx_ref: 'my_tx_123',
        }),
        'utf8'
      );
      const event = chapaProvider.parseEvent(raw);
      expect(event.eventKey).toBe('chapa:tx:my_tx_123:charge.success');
    });

    it('distinguishes identical values in different identifier fields preventing collisions', () => {
      const eventWithRef = chapaProvider.parseEvent(
        Buffer.from(
          JSON.stringify({
            event: 'charge.success',
            tx_ref: 'ANOTHER_VAL',
            reference: 'SHARED_VAL',
          }),
          'utf8'
        )
      );

      const eventWithTx = chapaProvider.parseEvent(
        Buffer.from(
          JSON.stringify({
            event: 'charge.success',
            tx_ref: 'SHARED_VAL',
          }),
          'utf8'
        )
      );

      // Namespaces ref: vs tx: prevent collision when reference and tx_ref carry identical string values
      expect(eventWithRef.eventKey).toBe('chapa:ref:SHARED_VAL:charge.success');
      expect(eventWithTx.eventKey).toBe('chapa:tx:SHARED_VAL:charge.success');
      expect(eventWithRef.eventKey).not.toBe(eventWithTx.eventKey);
    });

    it('generates deterministic identical keys for repeated delivery of the same event', () => {
      const payloadObj = {
        event: 'charge.success',
        tx_ref: 'tx_repeat_123',
        reference: 'ref_repeat_456',
      };
      const delivery1 = chapaProvider.parseEvent(Buffer.from(JSON.stringify(payloadObj), 'utf8'));
      const delivery2 = chapaProvider.parseEvent(Buffer.from(JSON.stringify(payloadObj), 'utf8'));

      expect(delivery1.eventKey).toBe(delivery2.eventKey);
      expect(delivery1.eventKey).toBe('chapa:ref:ref_repeat_456:charge.success');
    });

    it('maps charge.refunded, charge.reversed, payouts, or unknown events to ignored', () => {
      const refunded = chapaProvider.parseEvent(
        Buffer.from(
          JSON.stringify({
            event: 'charge.refunded',
            tx_ref: 'tx_refund',
          }),
          'utf8'
        )
      );
      expect(refunded.type).toBe('ignored');

      const payout = chapaProvider.parseEvent(
        Buffer.from(
          JSON.stringify({
            event: 'payout.success',
            tx_ref: 'tx_payout',
          }),
          'utf8'
        )
      );
      expect(payout.type).toBe('ignored');
    });

    it('never uses Chapa reference as our txRef', () => {
      const raw = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          reference: 'chapa_internal_only',
        }),
        'utf8'
      );

      const event = chapaProvider.parseEvent(raw);
      expect(event.txRef).toBe('');
      expect(event.txRef).not.toBe('chapa_internal_only');
    });
  });

  describe('verifyTransaction', () => {
    it('successfully verifies transaction with dual status checks and decimal parsing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Transaction fetched',
          data: {
            status: 'success',
            amount: '250.50',
            currency: 'ETB',
            mode: 'test',
            tx_ref: 'chapa_tx_valid',
            reference: 'chapa_ref_1',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_tx_valid');
      expect(res.status).toBe('success');
      expect(res.amountMinor).toBe(25050); // Exact integer 25050 minor units
      expect(res.currency).toBe('ETB');
    });

    it('handles USD amounts accurately', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'success',
            amount: '19.99',
            currency: 'USD',
            mode: 'test',
            tx_ref: 'chapa_usd',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_usd');
      expect(res.status).toBe('success');
      expect(res.amountMinor).toBe(1999);
      expect(res.currency).toBe('USD');
    });

    it('rejects test/live mode mismatch (key is test, transaction mode is live)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'success',
            amount: '100.00',
            currency: 'ETB',
            mode: 'live', // mismatch against CHASECK_TEST-
            tx_ref: 'chapa_mode_mismatch',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_mode_mismatch');
      expect(res.status).toBe('failed');
    });

    it('rejects verification when data.mode is missing (undefined)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'success',
            amount: '100.00',
            currency: 'ETB',
            // mode omitted
            tx_ref: 'chapa_missing_mode',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_missing_mode');
      expect(res.status).toBe('failed');
    });

    it('rejects verification when data.mode is null', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'success',
            amount: '100.00',
            currency: 'ETB',
            mode: null,
            tx_ref: 'chapa_null_mode',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_null_mode');
      expect(res.status).toBe('failed');
    });

    it('rejects verification when data.mode is an empty string', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'success',
            amount: '100.00',
            currency: 'ETB',
            mode: '',
            tx_ref: 'chapa_empty_mode',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_empty_mode');
      expect(res.status).toBe('failed');
    });

    it('rejects verification when data.mode is an unexpected arbitrary string', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'success',
            amount: '100.00',
            currency: 'ETB',
            mode: 'sandbox_or_custom',
            tx_ref: 'chapa_unexpected_mode',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_unexpected_mode');
      expect(res.status).toBe('failed');
    });

    it('accepts verification when data.mode is explicitly present and matches the configured key mode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'success',
            amount: '100.00',
            currency: 'ETB',
            mode: 'test', // matches CHASECK_TEST-
            tx_ref: 'chapa_valid_mode',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_valid_mode');
      expect(res.status).toBe('success');
      expect(res.amountMinor).toBe(10000);
      expect(res.currency).toBe('ETB');
    });

    it('returns failed status when data.status is failed', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'failed',
            amount: '100.00',
            currency: 'ETB',
            mode: 'test',
            tx_ref: 'chapa_failed_tx',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_failed_tx');
      expect(res.status).toBe('failed');
    });

    it('returns pending status when data.status is pending', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          data: {
            status: 'pending',
            amount: '100.00',
            currency: 'ETB',
            mode: 'test',
            tx_ref: 'chapa_pending_tx',
          },
        }),
      });

      const res = await chapaProvider.verifyTransaction('chapa_pending_tx');
      expect(res.status).toBe('pending');
    });

    it('throws on network failure so webhook service can roll back and return 500', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        chapaProvider.verifyTransaction('chapa_network_fail')
      ).rejects.toThrow(/Chapa verify network failure: ETIMEDOUT/);
    });

    it('throws on Chapa 500 server error so webhook service can roll back and return 500', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      });

      await expect(
        chapaProvider.verifyTransaction('chapa_502_fail')
      ).rejects.toThrow(/Chapa verify API server error: HTTP 502/);
    });
  });

  describe('Transient Failure Rollback Guarantee in processWebhook', () => {
    it('rolls back database transaction and returns 500 on transient verification error, leaving event key unconsumed', async () => {
      // Mock pool and client to inspect rollback execution
      const queriesExecuted: string[] = [];
      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
          queriesExecuted.push(sql.trim().split(/\s+/)[0].toUpperCase());
          if (sql.includes('INSERT INTO payment_events')) {
            return { rowCount: 1, rows: [{ id: 'mock-event-id-123' }] };
          }
          if (sql.includes('SELECT id, business_id, invoice_id')) {
            return {
              rowCount: 1,
              rows: [
                {
                  id: 'payment-1',
                  business_id: 'biz-1',
                  invoice_id: 'inv-1',
                  provider: 'chapa',
                  tx_ref: 'tx-rollback-test',
                  amount_minor: '10000',
                  currency: 'ETB',
                  status: 'pending',
                },
              ],
            };
          }
          return { rowCount: 0, rows: [] };
        }),
        release: vi.fn(),
      };

      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      } as unknown as Pool;

      // Mock verifyTransaction to simulate a network timeout
      vi.spyOn(chapaProvider, 'verifyTransaction').mockRejectedValueOnce(
        new Error('ETIMEDOUT connection to Chapa')
      );

      const rawPayload = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          tx_ref: 'tx-rollback-test',
          reference: 'chapa-ref-rollback',
          status: 'success',
        }),
        'utf8'
      );

      const signature = crypto
        .createHmac('sha256', env.CHAPA_WEBHOOK_SECRET!)
        .update(rawPayload)
        .digest('hex');

      const result = await processWebhook(
        chapaProvider,
        rawPayload,
        { 'x-chapa-signature': signature },
        mockPool
      );

      // Webhook handler must return HTTP 500
      expect(result.statusCode).toBe(500);
      expect(result.body.error.code).toBe('WEBHOOK_PROCESSING_FAILED');

      // Crucial: ROLLBACK must have been executed, and COMMIT must NEVER have been called
      expect(queriesExecuted).toContain('BEGIN');
      expect(queriesExecuted).toContain('ROLLBACK');
      expect(queriesExecuted).not.toContain('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
