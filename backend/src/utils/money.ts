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
 *
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
 *
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
    throw new Error(`Quantity exceeds maximum allowed limit of ${MONEY_CONSTANTS.MAX_QUANTITY_MILLI} milli-units (1000.000)`);
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
 * Limits: at most 50 line items; total must fit comfortably in a JS safe integer.
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
 *
 * Formula: round_half_up(subtotal_minor * tax_rate_bps / 10000)
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
 *
 * Formula: subtotal_minor + tax_minor
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

/**
 * Calculates all invoice totals in one call.
 */
export interface InvoiceTotals {
  lineTotals: number[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

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
 * Parses a decimal string (such as "100", "100.5", "100.00", "0.01")
 * into integer minor units using string manipulation without floating point.
 *
 * Rejects:
 * - Invalid decimal strings or non-strings.
 * - Negative values.
 * - Scientific notation.
 * - More than two decimal places.
 * - Values exceeding the safe integer limit or custom maxMinor.
 */
export function parseDecimalToMinor(
  input: string,
  options?: { maxMinor?: number | bigint }
): number {
  if (typeof input !== 'string') {
    throw new TypeError('Input must be a string');
  }

  const trimmed = input.trim();
  if (trimmed === '') {
    throw new Error('Decimal string cannot be empty');
  }

  // Reject scientific notation (e.g. 1e5, 1E-2, 1e+3)
  if (/\d+[eE][+-]?\d+/.test(trimmed)) {
    throw new Error('Scientific notation is not allowed');
  }

  // Reject negative values
  if (trimmed.startsWith('-')) {
    throw new Error('Negative values are not allowed');
  }

  // Reject numbers with more than 2 decimal places
  if (/^\d+\.\d{3,}$/.test(trimmed)) {
    throw new Error('Amounts cannot have more than 2 decimal places');
  }

  // Validate exact decimal string format: one or more digits, optional dot with 1 or 2 digits
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid decimal string: "${input}"`);
  }

  const [wholePart, fracPart = ''] = trimmed.split('.');
  const wholeBig = BigInt(wholePart) * 100n;
  const fracBig =
    fracPart.length === 1
      ? BigInt(fracPart) * 10n
      : fracPart.length === 2
        ? BigInt(fracPart)
        : 0n;

  const minorBig = wholeBig + fracBig;

  const maxAllowed =
    options?.maxMinor !== undefined
      ? BigInt(options.maxMinor)
      : BigInt(MONEY_CONSTANTS.MAX_SAFE_MINOR);

  if (minorBig > maxAllowed) {
    throw new Error(`Amount exceeds maximum allowed limit of ${maxAllowed}`);
  }

  return Number(minorBig);
}

/**
 * Formats integer minor units into a display string without floating point arithmetic.
 *
 * Examples:
 * - formatMinor(125000) => "1,250.00"
 * - formatMinor(125000, "ETB") => "ETB 1,250.00"
 * - formatMinor(125000, "USD") => "USD 1,250.00"
 * - formatMinor(1) => "0.01"
 * - formatMinor(0) => "0.00"
 */
export function formatMinor(
  minor: number | bigint,
  currencyOrOptions?: string | { currency?: string }
): string {
  const minorBig = BigInt(minor);
  const isNegative = minorBig < 0n;
  const absMinor = isNegative ? -minorBig : minorBig;

  const whole = absMinor / 100n;
  const frac = absMinor % 100n;
  const fracStr = frac.toString().padStart(2, '0');

  // Insert thousand separators into the whole number part
  const wholeWithCommas = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = isNegative ? '-' : '';
  const formattedNumber = `${sign}${wholeWithCommas}.${fracStr}`;

  const currency =
    typeof currencyOrOptions === 'string'
      ? currencyOrOptions
      : currencyOrOptions?.currency;

  if (currency) {
    return `${currency} ${formattedNumber}`;
  }

  return formattedNumber;
}

// Aliases for convenience
export const formatMinorToDisplay = formatMinor;
export const formatMoney = formatMinor;
