export type Currency = 'ETB' | 'USD';

export interface CheckoutInput {
  txRef: string;
  amountMinor: number;
  currency: Currency;
  returnUrl: string; // frontend page that polls status; NEVER trusted as proof of payment
  description: string;
  payer: { name: string; email: string }; // Chapa requires email. Simulated provider ignores it.
  // Source: client email from DB if set, else payerEmail from request body.
}

export type ProviderEvent = {
  eventKey: string; // deterministic, used for idempotency
  type: 'payment.succeeded' | 'payment.failed' | 'payment.cancelled' | 'ignored';
  txRef: string;
};

export interface PaymentProvider {
  readonly name: 'chapa' | 'simulated';
  createCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }>;
  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseEvent(rawBody: Buffer): ProviderEvent;
  verifyTransaction(txRef: string): Promise<{
    status: 'success' | 'failed' | 'pending';
    amountMinor: number;
    currency: Currency;
  }>;
}
