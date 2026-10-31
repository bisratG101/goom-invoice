import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { parseDecimalToMinor } from '../../utils/money';
import { CheckoutInput, PaymentProvider, ProviderEvent } from './provider.interface';

/**
 * Named constants for Chapa integration.
 * No hardcoded endpoint paths, header names, field names, or event types
 * are allowed as bare string literals throughout this file.
 */
export const CHAPA_CONSTANTS = {
  API_BASE_URL: 'https://api.chapa.co/v1',
  INITIALIZE_PATH: '/transaction/initialize',
  VERIFY_PATH: '/transaction/verify',
  HEADER_SIGNATURE: 'x-chapa-signature',
  HEADER_AUTHORIZATION: 'Authorization',
  HEADER_CONTENT_TYPE: 'Content-Type',
  CONTENT_TYPE_JSON: 'application/json',
  EVENT_CHARGE_SUCCESS: 'charge.success',
  EVENT_CHARGE_FAILED: 'charge.failed',
  EVENT_CHARGE_REFUNDED: 'charge.refunded',
  EVENT_CHARGE_REVERSED: 'charge.reversed',
  MODE_TEST: 'test',
  MODE_LIVE: 'live',
  SECRET_KEY_TEST_PREFIX: 'CHASECK_TEST-',
  SECRET_KEY_LIVE_PREFIX: 'CHASECK-',
} as const;

/**
 * Evaluates the operational mode (test or live) derived from the secret key prefix.
 * Important: Must check CHASECK_TEST- BEFORE CHASECK-, because the test prefix
 * also begins with the live prefix substring.
 */
export function getChapaKeyMode(secretKey: string): 'test' | 'live' {
  if (secretKey.startsWith(CHAPA_CONSTANTS.SECRET_KEY_TEST_PREFIX)) {
    return 'test';
  }
  if (secretKey.startsWith(CHAPA_CONSTANTS.SECRET_KEY_LIVE_PREFIX)) {
    return 'live';
  }
  throw new Error('Invalid CHAPA_SECRET_KEY prefix: must start with CHASECK_TEST- or CHASECK-');
}

export class ChapaProvider implements PaymentProvider {
  readonly name = 'chapa' as const;

  /**
   * Initializes a payment checkout session with Chapa.
   * Endpoint: POST https://api.chapa.co/v1/transaction/initialize
   */
  async createCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }> {
    const secretKey = env.CHAPA_SECRET_KEY;
    if (!secretKey) {
      throw new Error('CHAPA_SECRET_KEY is not configured');
    }

    // Payer email is mandatory per design.md §9
    const email = input.payer?.email?.trim();
    if (!email) {
      throw new Error('Payer email is required for Chapa checkout');
    }

    // Format amount in major decimal units (e.g. 10000 minor => "100.00") without floating-point math
    const minorBig = BigInt(input.amountMinor);
    const whole = minorBig / 100n;
    const frac = minorBig % 100n;
    const amountStr = `${whole.toString()}.${frac.toString().padStart(2, '0')}`;

    // Split payer name into first_name and last_name if present
    const nameParts = (input.payer?.name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts.length > 0 ? nameParts[0] : undefined;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

    const payload: Record<string, any> = {
      amount: amountStr,
      currency: input.currency,
      email,
      tx_ref: input.txRef,
      return_url: input.returnUrl,
    };

    if (firstName) {
      payload.first_name = firstName;
    }
    if (lastName) {
      payload.last_name = lastName;
    }
    if (input.description) {
      payload.customization = {
        title: input.description,
      };
    }

    // Note: callback_url is intentionally omitted.
    // Asynchronous server-to-server notifications are sent to the webhook URL
    // configured in the Chapa merchant dashboard.

    const url = `${CHAPA_CONSTANTS.API_BASE_URL}${CHAPA_CONSTANTS.INITIALIZE_PATH}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          [CHAPA_CONSTANTS.HEADER_AUTHORIZATION]: `Bearer ${secretKey}`,
          [CHAPA_CONSTANTS.HEADER_CONTENT_TYPE]: CHAPA_CONSTANTS.CONTENT_TYPE_JSON,
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      logger.error('Failed to connect to Chapa initialize endpoint', {
        txRef: input.txRef,
        error: err.message,
      });
      throw new Error(`Chapa initialize network failure: ${err.message}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch (err: any) {
      logger.error('Invalid JSON received from Chapa initialize endpoint', {
        txRef: input.txRef,
        status: response.status,
      });
      throw new Error('Chapa initialize returned invalid response body');
    }

    if (!response.ok || data.status !== 'success' || !data.data?.checkout_url) {
      logger.warn('Chapa initialize returned unsuccessful response', {
        txRef: input.txRef,
        status: response.status,
        apiStatus: data?.status,
        apiMessage: data?.message,
      });
      throw new Error(`Chapa initialize rejected: ${data?.message || 'Unknown error'}`);
    }

    // Log sanitized outcome: never log payer email, credentials, or full raw payloads
    logger.info('Chapa checkout initialized successfully', {
      txRef: input.txRef,
      currency: input.currency,
      amountMinor: input.amountMinor,
    });

    return {
      checkoutUrl: data.data.checkout_url,
    };
  }

  /**
   * Verifies the incoming webhook signature.
   * Requirement: strictly accepts x-chapa-signature only, computed as HMAC-SHA256
   * over the exact raw request body bytes using CHAPA_WEBHOOK_SECRET with timing-safe comparison.
   */
  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const webhookSecret = env.CHAPA_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn('Chapa webhook signature verification skipped: CHAPA_WEBHOOK_SECRET is not configured');
      return false;
    }

    // Header lookup: look exclusively for x-chapa-signature (case-insensitive)
    let signatureHeader: string | undefined;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === CHAPA_CONSTANTS.HEADER_SIGNATURE) {
        signatureHeader = Array.isArray(value) ? value[0] : value;
        break;
      }
    }

    if (!signatureHeader || typeof signatureHeader !== 'string') {
      return false;
    }

    try {
      const computedHex = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex')
        .toLowerCase();

      const receivedHex = signatureHeader.trim().toLowerCase();

      const computedBuffer = Buffer.from(computedHex, 'utf8');
      const receivedBuffer = Buffer.from(receivedHex, 'utf8');

      if (computedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(computedBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Parses the raw webhook payload into a standardized ProviderEvent.
   * - Extracts payload.tx_ref only. Never substitutes Chapa's internal reference.
   * - Constructs a deterministic eventKey: chapa:${reference || tx_ref}:${event}
   * - Maps documented events:
   *     charge.success -> 'payment.succeeded'
   *     charge.failed  -> 'payment.failed'
   *   All others (refunded, reversed, payouts, unknown) -> 'ignored'
   */
  parseEvent(rawBody: Buffer): ProviderEvent {
    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return {
        eventKey: `chapa:unparseable:${Date.now()}`,
        type: 'ignored',
        txRef: '',
      };
    }

    const txRef = typeof payload.tx_ref === 'string' ? payload.tx_ref : '';
    const reference = typeof payload.reference === 'string' ? payload.reference : '';
    const eventName = typeof payload.event === 'string' ? payload.event : '';

    // Deterministic eventKey distinguishing whether the identifier came from Chapa's reference or our tx_ref.
    // Example: chapa:ref:<reference>:<event> or chapa:tx:<tx_ref>:<event>
    const idNamespace = reference ? `ref:${reference}` : `tx:${txRef}`;
    const eventKey = `chapa:${idNamespace}:${eventName}`;

    let type: ProviderEvent['type'] = 'ignored';
    if (eventName === CHAPA_CONSTANTS.EVENT_CHARGE_SUCCESS) {
      type = 'payment.succeeded';
    } else if (eventName === CHAPA_CONSTANTS.EVENT_CHARGE_FAILED) {
      type = 'payment.failed';
    }

    return {
      eventKey,
      type,
      txRef,
    };
  }

  /**
   * Verifies the transaction with Chapa's official verification API:
   * GET https://api.chapa.co/v1/transaction/verify/{tx_ref}
   *
   * Error Handling / Safety Rules:
   * - Network errors, HTTP 5xx, or malformed JSON throw an Error so the webhook
   *   service rolls back the transaction (preserving the eventKey) and returns 500 for retry.
   * - Mode mismatch (test key vs live transaction or vice versa) returns { status: 'failed' }.
   * - Amount is parsed strictly with parseDecimalToMinor (zero floating-point math).
   * - Dual status check: requires top-level status === 'success' AND data.status === 'success'.
   */
  async verifyTransaction(txRef: string): Promise<{
    status: 'success' | 'failed' | 'pending';
    amountMinor: number;
    currency: 'ETB' | 'USD';
  }> {
    const secretKey = env.CHAPA_SECRET_KEY;
    if (!secretKey) {
      throw new Error('CHAPA_SECRET_KEY is not configured for verification');
    }

    const expectedMode = getChapaKeyMode(secretKey);
    const url = `${CHAPA_CONSTANTS.API_BASE_URL}${CHAPA_CONSTANTS.VERIFY_PATH}/${encodeURIComponent(txRef)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          [CHAPA_CONSTANTS.HEADER_AUTHORIZATION]: `Bearer ${secretKey}`,
        },
      });
    } catch (err: any) {
      logger.error('Chapa verification request failed with network error', {
        txRef,
        error: err.message,
      });
      // Throw so webhook service rolls back the transaction and returns HTTP 500 for retry
      throw new Error(`Chapa verify network failure: ${err.message}`);
    }

    // Transient server errors (5xx) must throw so Chapa retries the webhook
    if (response.status >= 500) {
      logger.error('Chapa verification returned 5xx server error', {
        txRef,
        status: response.status,
      });
      throw new Error(`Chapa verify API server error: HTTP ${response.status}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch (err: any) {
      logger.error('Invalid JSON received from Chapa verify endpoint', {
        txRef,
        status: response.status,
      });
      throw new Error('Chapa verify returned invalid JSON');
    }

    // 404 or non-success top-level status
    if (response.status !== 200 || data.status !== 'success' || !data.data) {
      logger.warn('Chapa verification returned unsuccessful response', {
        txRef,
        status: response.status,
        apiStatus: data?.status,
        apiMessage: data?.message,
      });
      return {
        status: 'failed',
        amountMinor: 0,
        currency: 'ETB',
      };
    }

    const transactionData = data.data;

    // Enforce explicit, valid, and matching operational mode.
    // data.mode must be explicitly present, a valid supported mode ('test' or 'live'),
    // and equal to the expectedMode derived from CHAPA_SECRET_KEY.
    // Missing, null, empty, unexpected, or mismatched mode must fail verification.
    const receivedMode = transactionData.mode;
    const isValidMode =
      receivedMode === CHAPA_CONSTANTS.MODE_TEST || receivedMode === CHAPA_CONSTANTS.MODE_LIVE;

    if (!isValidMode || receivedMode !== expectedMode) {
      logger.warn('Chapa verification mode invalid or mismatch', {
        txRef,
        expectedMode,
        receivedMode,
      });
      return {
        status: 'failed',
        amountMinor: 0,
        currency: 'ETB',
      };
    }

    // Parse amount using parseDecimalToMinor (never parseFloat)
    let amountMinor = 0;
    try {
      const rawAmount = String(transactionData.amount);
      amountMinor = parseDecimalToMinor(rawAmount);
    } catch (err: any) {
      logger.warn('Chapa verification returned unparseable amount', {
        txRef,
        amount: transactionData.amount,
        error: err.message,
      });
      return {
        status: 'failed',
        amountMinor: 0,
        currency: 'ETB',
      };
    }

    const currency: 'ETB' | 'USD' = transactionData.currency === 'USD' ? 'USD' : 'ETB';
    const txStatus = String(transactionData.status || '').toLowerCase();

    // Verify dual status
    if (txStatus === 'success') {
      return {
        status: 'success',
        amountMinor,
        currency,
      };
    }

    if (txStatus === 'pending') {
      return {
        status: 'pending',
        amountMinor,
        currency,
      };
    }

    return {
      status: 'failed',
      amountMinor,
      currency,
    };
  }
}

export const chapaProvider = new ChapaProvider();
