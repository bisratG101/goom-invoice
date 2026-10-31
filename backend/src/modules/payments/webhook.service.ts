import { Pool } from 'pg';
import { PaymentProvider } from './provider.interface';
import { logger } from '../../utils/logger';

export interface WebhookResult {
  statusCode: number;
  body: Record<string, any>;
}

/**
 * Executes the provider-agnostic 10-step webhook processing algorithm
 * strictly conforming to design.md Section 9.
 */
export async function processWebhook(
  provider: PaymentProvider,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  pool: Pool
): Promise<WebhookResult> {
  // Step 2: Verify signature over raw bytes with timing-safe comparison.
  // Invalid: respond 401, write NOTHING to the database.
  const isValidSignature = provider.verifySignature(rawBody, headers);
  if (!isValidSignature) {
    logger.warn('Webhook signature verification failed', { provider: provider.name });
    return {
      statusCode: 401,
      body: {
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Webhook signature verification failed',
        },
      },
    };
  }

  // Step 3: Parse the event. Unknown event types: respond 200 and stop.
  const event = provider.parseEvent(rawBody);
  if (event.type === 'ignored') {
    logger.info('Webhook event ignored (unknown or unhandled event type)', {
      provider: provider.name,
      eventKey: event.eventKey,
    });
    return {
      statusCode: 200,
      body: { status: 'ignored' },
    };
  }

  let rawJsonPayload: any = {};
  try {
    rawJsonPayload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    rawJsonPayload = {};
  }

  const client = await pool.connect();
  try {
    // Step 4: Begin a transaction.
    await client.query('BEGIN');

    // INSERT INTO payment_events ... ON CONFLICT (provider, event_key) DO NOTHING
    const eventInsertRes = await client.query<{ id: string }>(
      `INSERT INTO payment_events (provider, event_key, event_type, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, event_key) DO NOTHING
       RETURNING id`,
      [provider.name, event.eventKey, event.type, JSON.stringify(rawJsonPayload)]
    );

    // If nothing was inserted, it is a duplicate: commit and respond 200
    if (eventInsertRes.rowCount === 0) {
      await client.query('COMMIT');
      logger.info('Duplicate webhook event received, skipping', {
        provider: provider.name,
        eventKey: event.eventKey,
      });
      return {
        statusCode: 200,
        body: { status: 'duplicate' },
      };
    }

    const eventId = eventInsertRes.rows[0].id;

    // Step 5: Find the payment by (provider, tx_ref) with FOR UPDATE.
    const paymentRes = await client.query<{
      id: string;
      business_id: string;
      invoice_id: string;
      provider: string;
      tx_ref: string;
      amount_minor: string;
      currency: string;
      status: string;
    }>(
      `SELECT id, business_id, invoice_id, provider, tx_ref, amount_minor, currency, status
       FROM payments
       WHERE provider = $1 AND tx_ref = $2
       FOR UPDATE`,
      [provider.name, event.txRef]
    );

    // Not found: set outcome unknown_reference, respond 200
    if (paymentRes.rowCount === 0) {
      await client.query(
        `UPDATE payment_events
         SET outcome = 'unknown_reference', processed_at = now()
         WHERE id = $1`,
        [eventId]
      );
      await client.query('COMMIT');
      logger.warn('Webhook received for unknown transaction reference', {
        provider: provider.name,
        txRef: event.txRef,
      });
      return {
        statusCode: 200,
        body: { status: 'unknown_reference' },
      };
    }

    const payment = paymentRes.rows[0];
    let responseStatus = 'ok';

    // Step 6: For success events, call provider.verifyTransaction(txRef).
    if (event.type === 'payment.succeeded') {
      const verifyRes = await provider.verifyTransaction(event.txRef);

      const isVerified =
        verifyRes.status === 'success' &&
        verifyRes.amountMinor === Number(payment.amount_minor) &&
        verifyRes.currency === payment.currency;

      if (!isVerified) {
        // Amount/currency mismatch or failed status: set outcome mismatch, do NOT mark anything paid
        await client.query(
          `UPDATE payment_events
           SET outcome = 'mismatch', processed_at = now()
           WHERE id = $1`,
          [eventId]
        );
        await client.query('COMMIT');
        logger.warn('Payment verification mismatch', {
          provider: provider.name,
          txRef: event.txRef,
          expectedAmount: Number(payment.amount_minor),
          receivedAmount: verifyRes.amountMinor,
          expectedCurrency: payment.currency,
          receivedCurrency: verifyRes.currency,
          status: verifyRes.status,
        });
        return {
          statusCode: 200,
          body: { status: 'mismatch' },
        };
      }

      // Step 7: Lock the invoice FOR UPDATE.
      const invoiceRes = await client.query<{
        id: string;
        status: string;
        number: number | null;
      }>(
        `SELECT id, status, number
         FROM invoices
         WHERE id = $1 AND business_id = $2
         FOR UPDATE`,
        [payment.invoice_id, payment.business_id]
      );

      if (invoiceRes.rowCount === 0) {
        await client.query(
          `UPDATE payment_events
           SET outcome = 'unknown_invoice', processed_at = now()
           WHERE id = $1`,
          [eventId]
        );
        await client.query('COMMIT');
        return {
          statusCode: 200,
          body: { status: 'unknown_invoice' },
        };
      }

      const invoice = invoiceRes.rows[0];

      if (invoice.status === 'sent') {
        // Mark payment succeeded (confirmed_at)
        await client.query(
          `UPDATE payments
           SET status = 'succeeded', confirmed_at = now()
           WHERE id = $1`,
          [payment.id]
        );

        // Mark invoice paid (paid_at, updated_at)
        await client.query(
          `UPDATE invoices
           SET status = 'paid', paid_at = now(), updated_at = now()
           WHERE id = $1`,
          [invoice.id]
        );

        // Mark event outcome processed
        await client.query(
          `UPDATE payment_events
           SET outcome = 'processed', processed_at = now()
           WHERE id = $1`,
          [eventId]
        );
        responseStatus = 'ok';
      } else if (invoice.status === 'paid') {
        // Flag for review: duplicate_payment
        await client.query(
          `UPDATE payment_events
           SET outcome = 'duplicate_payment', processed_at = now()
           WHERE id = $1`,
          [eventId]
        );
        logger.warn('Payment received for already-paid invoice', {
          invoiceId: invoice.id,
          txRef: event.txRef,
        });
        responseStatus = 'duplicate_payment';
      } else {
        // Status is 'void' or 'draft': outcome paid_on_unpayable_invoice
        await client.query(
          `UPDATE payment_events
           SET outcome = 'paid_on_unpayable_invoice', processed_at = now()
           WHERE id = $1`,
          [eventId]
        );
        logger.warn('Payment received for unpayable invoice (void or draft)', {
          invoiceId: invoice.id,
          invoiceStatus: invoice.status,
          txRef: event.txRef,
        });
        responseStatus = 'paid_on_unpayable_invoice';
      }
    } else if (event.type === 'payment.failed' || event.type === 'payment.cancelled') {
      // Step 8: Failure or cancel events: mark payment failed or cancelled; invoice stays sent.
      const newStatus = event.type === 'payment.failed' ? 'failed' : 'cancelled';
      await client.query(
        `UPDATE payments
         SET status = $1, failure_reason = $2
         WHERE id = $3`,
        [newStatus, event.type, payment.id]
      );

      await client.query(
        `UPDATE payment_events
         SET outcome = 'processed', processed_at = now()
         WHERE id = $1`,
        [eventId]
      );
    }

    // Step 9: Set processed_at and commit. Respond 200.
    await client.query('COMMIT');
    return {
      statusCode: 200,
      body: { status: responseStatus },
    };
  } catch (err: any) {
    // Transient errors (database down / error): roll back and respond 500 so provider retries
    await client.query('ROLLBACK');
    logger.error('Failed to process webhook transaction', {
      error: err.message,
      provider: provider.name,
      txRef: event.txRef,
    });
    return {
      statusCode: 500,
      body: {
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Failed to process webhook transaction',
        },
      },
    };
  } finally {
    client.release();
  }
}
