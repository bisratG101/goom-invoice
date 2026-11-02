/**
 * Money and calculation utilities following design.md Section 7.
 *
 * Rules:
 * - All monetary amounts are integers in minor units (1 ETB = 100 minor, 1 USD = 100 minor).
 * - Client never sends totals; the server computes every number.
 * - Always use BigInt for intermediate multiplication to avoid exceeding 2^53 (Number.MAX_SAFE_INTEGER).
 * - Never use JavaScript floating-point arithmetic for monetary calculations.
 * - Line total: round_half_up(quantity_milli * unit_price_minor / 1000).
 * - Subtotal: sum of line totals (at most 50 line items).
 * - Tax: round_half_up(subtotal_minor * tax_rate_bps / 10000).
 * - Total: subtotal_minor + tax_minor.
 */

export const MONEY_CONSTANTS = {
  MIN_QUANTITY_MILLI: 1,
  MAX_QUANTITY_MILLI: 1_000_000, // 1000.000
  MIN_UNIT_PRICE_MINOR: 0,
  MAX_UNIT_PRICE_MINOR: 1_000_000_000, // 10,000,000.00
  MIN_TAX_RATE_BPS: 0,
  MAX_TAX_RATE_BPS: 10_000, // 100.00%
  MAX_LINE_ITEMS: 50,
  MAX_SAFE_MINOR: Number.MAX_SAFE_INTEGER,
} as const;

/**
 * Exact round-half-up division using BigInt integer arithmetic.
 * For non-negative numerator and positive denominator:
 * round_half_up(N / D) = floor((N + floor(D / 2)) / D)
 */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error('Denominator must be positive');
  }
  if (numerator < 0n) {
    throw new Error('Numerator must be non-negative');
  }
  return (numerator + denominator / 2n) / denominator;
}

/**
 * Calculates line total from quantity (in milli-units, e.g. 1000 = 1.000)
 * and unit price (in minor units, e.g. 100 = 1.00).
 * Formula: round_half_up(quantity_milli * unit_price_minor / 1000)
 */
export function calculateLineTotal(
  quantityMilli: number | bigint,
  unitPriceMinor: number | bigint
): number {
  const q = BigInt(quantityMilli);
  const p = BigInt(unitPriceMinor);

  if (q < 0n || p < 0n) {
    throw new Error('Quantity and unit price must be non-negative');
  }
  if (q > BigInt(MONEY_CONSTANTS.MAX_QUANTITY_MILLI)) {
    throw new Error(`Quantity exceeds maximum allowed limit of ${MONEY_CONSTANTS.MAX_QUANTITY_MILLI} milli-units`);
  }
  if (p > BigInt(MONEY_CONSTANTS.MAX_UNIT_PRICE_MINOR)) {
    throw new Error(`Unit price exceeds maximum allowed limit of ${MONEY_CONSTANTS.MAX_UNIT_PRICE_MINOR} minor units`);
  }

  const intermediate = q * p;
  const lineTotal = roundHalfUpDiv(intermediate, 1000n);

  if (lineTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Line total exceeds safe integer limit');
  }

  return Number(lineTotal);
}

/**
 * Calculates subtotal as the sum of line totals.
 */
export function calculateSubtotal(lineTotals: (number | bigint)[]): number {
  if (lineTotals.length > MONEY_CONSTANTS.MAX_LINE_ITEMS) {
    throw new Error(`Cannot exceed ${MONEY_CONSTANTS.MAX_LINE_ITEMS} line items`);
  }

  let sum = 0n;
  for (const item of lineTotals) {
    const val = BigInt(item);
    if (val < 0n) {
      throw new Error('Line totals must be non-negative');
    }
    sum += val;
  }

  if (sum > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Subtotal exceeds safe integer limit');
  }

  return Number(sum);
}

/**
 * Calculates tax from subtotal and basis points (bps).
 * 100 bps = 1.00%, 1500 bps = 15.00%, 10000 bps = 100.00%.
 */
export function calculateTax(
  subtotalMinor: number | bigint,
  taxRateBps: number | bigint
): number {
  const subtotal = BigInt(subtotalMinor);
  const bps = BigInt(taxRateBps);

  if (subtotal < 0n) {
    throw new Error('Subtotal must be non-negative');
  }
  if (bps < 0n || bps > BigInt(MONEY_CONSTANTS.MAX_TAX_RATE_BPS)) {
    throw new Error(`Tax rate must be between ${MONEY_CONSTANTS.MIN_TAX_RATE_BPS} and ${MONEY_CONSTANTS.MAX_TAX_RATE_BPS} basis points`);
  }

  const intermediate = subtotal * bps;
  const tax = roundHalfUpDiv(intermediate, 10000n);

  if (tax > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Tax exceeds safe integer limit');
  }

  return Number(tax);
}

/**
 * Calculates invoice total from subtotal and tax.
 */
export function calculateTotal(
  subtotalMinor: number | bigint,
  taxMinor: number | bigint
): number {
  const subtotal = BigInt(subtotalMinor);
  const tax = BigInt(taxMinor);

  if (subtotal < 0n || tax < 0n) {
    throw new Error('Subtotal and tax must be non-negative');
  }

  const total = subtotal + tax;

  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Total exceeds safe integer limit');
  }

  return Number(total);
}

export interface InvoiceTotals {
  lineTotals: number[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Computes all invoice totals for display preview in one call.
 */
export function calculateInvoiceTotals(
  items: Array<{ quantityMilli: number | bigint; unitPriceMinor: number | bigint }>,
  taxRateBps: number | bigint
): InvoiceTotals {
  const lineTotals = items.map((item) =>
    calculateLineTotal(item.quantityMilli, item.unitPriceMinor)
  );
  const subtotalMinor = calculateSubtotal(lineTotals);
  const taxMinor = calculateTax(subtotalMinor, taxRateBps);
  const totalMinor = calculateTotal(subtotalMinor, taxMinor);

  return {
    lineTotals,
    subtotalMinor,
    taxMinor,
    totalMinor,
  };
}

/**
 * Parses a decimal string (e.g. "125.50" or "10") into integer minor units using exact string parsing,
 * never parseFloat * 100.
 */
export function parseDecimalToMinor(
  decimalStr: string,
  options?: { maxMinor?: number }
): number {
  const trimmed = decimalStr.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: "${decimalStr}"`);
  }

  const [whole, fraction = ''] = trimmed.split('.');
  const paddedFraction = fraction.padEnd(2, '0');
  const minor = BigInt(whole) * 100n + BigInt(paddedFraction);

  const max = options?.maxMinor ?? MONEY_CONSTANTS.MAX_UNIT_PRICE_MINOR;
  if (minor > BigInt(max)) {
    throw new Error(`Amount exceeds maximum allowed limit of ${max} minor units`);
  }

  return Number(minor);
}

/**
 * Formats minor units into decimal string with 2 decimal places (e.g. 12550 -> "125.50").
 */
export function formatMinorToDecimal(minor: number): string {
  const isNegative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${isNegative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * Formats minor units for display with currency code (e.g. 12550, 'ETB' -> "ETB 125.50").
 */
export function formatMoney(minorUnits: number, currency: string = 'ETB'): string {
  const formatted = (minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

/**
 * Parses quantity decimal string into milli-units (e.g. "1.5" -> 1500).
 */
export function parseQuantityToMilli(qtyStr: string): number {
  const str = String(qtyStr).trim();
  if (!str) return 1000;
  if (!/^\d+(\.\d{1,3})?$/.test(str)) {
    throw new Error(`Invalid quantity decimal: "${qtyStr}"`);
  }
  const [whole, frac = ''] = str.split('.');
  const milli = BigInt(whole) * 1000n + BigInt(frac.padEnd(3, '0'));
  if (milli < 1n || milli > BigInt(MONEY_CONSTANTS.MAX_QUANTITY_MILLI)) {
    throw new Error(`Quantity must be between 1 and ${MONEY_CONSTANTS.MAX_QUANTITY_MILLI} milli-units`);
  }
  return Number(milli);
}

/**
 * Formats milli-units to a clean decimal quantity string (e.g. 1500 -> "1.5", 1000 -> "1").
 */
export function formatMilliToQuantity(milli: number): string {
  const whole = Math.floor(milli / 1000);
  const frac = milli % 1000;
  if (frac === 0) return String(whole);
  const fracStr = String(frac).padStart(3, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}
