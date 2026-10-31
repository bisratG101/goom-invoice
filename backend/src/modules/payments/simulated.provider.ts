import crypto from 'crypto';
import { env } from '../../config/env';
import { getDbPool } from '../../db/pool';
import { CheckoutInput, Currency, PaymentProvider, ProviderEvent } from './provider.interface';

export class SimulatedProvider implements PaymentProvider {
  readonly name = 'simulated' as const;

  // In-memory transaction registry for simulated checkouts
  private transactions = new Map<
    string,
    { status: 'success' | 'failed' | 'pending'; amountMinor: number; currency: Currency }
  >();

  /**
   * Clears internal state (useful for test isolation).
   */
  reset(): void {
    this.transactions.clear();
  }

  /**
   * Explicitly sets or overrides transaction verification details (useful for testing mismatch).
   */
  setTransaction(
    txRef: string,
    data: { status: 'success' | 'failed' | 'pending'; amountMinor: number; currency: Currency }
  ): void {
    this.transactions.set(txRef, data);
  }

  async createCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }> {
    if (!env.DEMO_MODE) {
      throw new Error('Simulated payment provider is only available when DEMO_MODE=true');
    }

    // Record the expected transaction details
    this.transactions.set(input.txRef, {
      status: 'success',
      amountMinor: input.amountMinor,
      currency: input.currency,
    });

    return {
      checkoutUrl: `/pay/simulated/${input.txRef}`,
    };
  }

  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const secret = env.SIMULATED_WEBHOOK_SECRET || 'simulated_secret_default_key';

    // Normalize header keys to lowercase
    const normalizedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : v || '';
    }

    const providedSig =
      normalizedHeaders['x-simulated-signature'] ||
      normalizedHeaders['x-signature'] ||
      normalizedHeaders['signature'];

    if (!providedSig || typeof providedSig !== 'string') {
      return false;
    }

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const providedBuf = Buffer.from(providedSig.trim(), 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  parseEvent(rawBody: Buffer): ProviderEvent {
    try {
      const payload = JSON.parse(rawBody.toString('utf8'));
      const txRef = String(payload.txRef || payload.tx_ref || payload.data?.tx_ref || '').trim();
      const eventKey = String(
        payload.eventKey ||
          payload.event_key ||
          payload.id ||
          `sim_${txRef}_${payload.event || payload.type || payload.status || 'success'}`
      ).trim();

      const rawType = String(payload.type || payload.event || payload.status || '').toLowerCase();

      let type: ProviderEvent['type'] = 'ignored';
      if (
        rawType === 'payment.succeeded' ||
        rawType === 'charge.success' ||
        rawType === 'success' ||
        rawType === 'succeeded'
      ) {
        type = 'payment.succeeded';
      } else if (
        rawType === 'payment.failed' ||
        rawType === 'charge.failed' ||
        rawType === 'failed'
      ) {
        type = 'payment.failed';
      } else if (
        rawType === 'payment.cancelled' ||
        rawType === 'charge.cancelled' ||
        rawType === 'cancelled'
      ) {
        type = 'payment.cancelled';
      }

      return {
        eventKey,
        type,
        txRef,
      };
    } catch {
      return {
        eventKey: 'invalid_json',
        type: 'ignored',
        txRef: '',
      };
    }
  }

  async verifyTransaction(txRef: string): Promise<{
    status: 'success' | 'failed' | 'pending';
    amountMinor: number;
    currency: Currency;
  }> {
    // 1. Check in-memory transaction registry first
    const recorded = this.transactions.get(txRef);
    if (recorded) {
      return recorded;
    }

    // 2. Fall back to database payment row if available
    const pool = getDbPool();
    if (pool) {
      try {
        const res = await pool.query<{ amount_minor: string; currency: Currency }>(
          'SELECT amount_minor, currency FROM payments WHERE tx_ref = $1 AND provider = $2',
          [txRef, this.name]
        );
        if (res.rowCount && res.rowCount > 0) {
          return {
            status: 'success',
            amountMinor: Number(res.rows[0].amount_minor),
            currency: res.rows[0].currency,
          };
        }
      } catch {
        // Fall through to not found
      }
    }

    return {
      status: 'failed',
      amountMinor: 0,
      currency: 'ETB',
    };
  }
}

export const simulatedProvider = new SimulatedProvider();
