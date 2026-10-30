import { describe, it, expect } from 'vitest';
import {
  MONEY_CONSTANTS,
  roundHalfUpDiv,
  calculateLineTotal,
  calculateSubtotal,
  calculateTax,
  calculateTotal,
  calculateInvoiceTotals,
  parseDecimalToMinor,
  formatMinor,
  formatMinorToDisplay,
  formatMoney,
} from './money';

describe('Money Utilities (design.md Section 7)', () => {
  describe('roundHalfUpDiv (BigInt exact arithmetic)', () => {
    it('rounds exact halves upward for even and odd denominators', () => {
      // 500 / 1000 = 0.500 => 1
      expect(roundHalfUpDiv(500n, 1000n)).toBe(1n);
      // 499 / 1000 = 0.499 => 0
      expect(roundHalfUpDiv(499n, 1000n)).toBe(0n);
      // 1500 / 1000 = 1.500 => 2
      expect(roundHalfUpDiv(1500n, 1000n)).toBe(2n);
      // 1499 / 1000 = 1.499 => 1
      expect(roundHalfUpDiv(1499n, 1000n)).toBe(1n);

      // Tax denominator 10,000
      // 5000 / 10000 = 0.5000 => 1
      expect(roundHalfUpDiv(5000n, 10000n)).toBe(1n);
      // 4999 / 10000 = 0.4999 => 0
      expect(roundHalfUpDiv(4999n, 10000n)).toBe(0n);
      // 15000 / 10000 = 1.5000 => 2
      expect(roundHalfUpDiv(15000n, 10000n)).toBe(2n);
    });

    it('handles zero numerator', () => {
      expect(roundHalfUpDiv(0n, 1000n)).toBe(0n);
    });

    it('rejects non-positive denominator or negative numerator', () => {
      expect(() => roundHalfUpDiv(10n, 0n)).toThrow('Denominator must be positive');
      expect(() => roundHalfUpDiv(10n, -100n)).toThrow('Denominator must be positive');
      expect(() => roundHalfUpDiv(-10n, 100n)).toThrow('Numerator must be non-negative');
    });
  });

  describe('calculateLineTotal', () => {
    it('computes normal line totals accurately', () => {
      // 1.000 item @ 100.00 ETB (1000 milli @ 10000 minor) => 10000 minor
      expect(calculateLineTotal(1000, 10000)).toBe(10000);

      // 2.500 items @ 50.00 ETB (2500 milli @ 5000 minor) => 12500 minor
      expect(calculateLineTotal(2500, 5000)).toBe(12500);

      // 0.001 item @ 1000.00 ETB (1 milli @ 100000 minor) => 100 minor
      expect(calculateLineTotal(1, 100000)).toBe(100);
    });

    it('enforces round-half-up at half-cent boundaries', () => {
      // 5 milli * 100 minor = 500 => 500 / 1000 = 0.500 => 1 minor
      expect(calculateLineTotal(5, 100)).toBe(1);
      // 4 milli * 100 minor = 400 => 400 / 1000 = 0.400 => 0 minor
      expect(calculateLineTotal(4, 100)).toBe(0);

      // 15 milli * 100 minor = 1500 => 1500 / 1000 = 1.500 => 2 minor
      expect(calculateLineTotal(15, 100)).toBe(2);
      // 14 milli * 100 minor = 1400 => 1400 / 1000 = 1.400 => 1 minor
      expect(calculateLineTotal(14, 100)).toBe(1);

      // 1.250 items @ 2.50 ETB (1250 milli * 250 minor = 312500 / 1000 = 312.5 => 313 minor)
      expect(calculateLineTotal(1250, 250)).toBe(313);
      // 1250 milli * 249 minor = 311250 / 1000 = 311.25 => 311 minor
      expect(calculateLineTotal(1250, 249)).toBe(311);
    });

    it('handles zero unit price or zero quantity', () => {
      expect(calculateLineTotal(0, 5000)).toBe(0);
      expect(calculateLineTotal(1000, 0)).toBe(0);
      expect(calculateLineTotal(0, 0)).toBe(0);
    });

    it('handles largest allowed values without overflow', () => {
      // Max quantity: 1,000,000 (1000.000)
      // Max unit price: 1,000,000,000 (10,000,000.00)
      // Line total = 1,000,000 * 1,000,000,000 / 1,000 = 1,000,000,000,000 minor
      const maxLine = calculateLineTotal(
        MONEY_CONSTANTS.MAX_QUANTITY_MILLI,
        MONEY_CONSTANTS.MAX_UNIT_PRICE_MINOR
      );
      expect(maxLine).toBe(1_000_000_000_000);
      expect(Number.isSafeInteger(maxLine)).toBe(true);
    });

    it('rejects values exceeding design.md boundaries', () => {
      expect(() => calculateLineTotal(-1, 100)).toThrow('Quantity and unit price must be non-negative');
      expect(() => calculateLineTotal(100, -1)).toThrow('Quantity and unit price must be non-negative');
      expect(() => calculateLineTotal(1_000_001, 100)).toThrow('Quantity exceeds maximum allowed limit');
      expect(() => calculateLineTotal(1000, 1_000_000_001)).toThrow('Unit price exceeds maximum allowed limit');
    });
  });

  describe('calculateSubtotal', () => {
    it('sums line totals correctly', () => {
      expect(calculateSubtotal([1000, 2500, 350])).toBe(3850);
      expect(calculateSubtotal([])).toBe(0);
      expect(calculateSubtotal([0])).toBe(0);
    });

    it('handles up to 50 line items', () => {
      const items = Array.from({ length: 50 }, () => 1000);
      expect(calculateSubtotal(items)).toBe(50000);
    });

    it('rejects more than 50 line items', () => {
      const items = Array.from({ length: 51 }, () => 100);
      expect(() => calculateSubtotal(items)).toThrow('Cannot exceed 50 line items');
    });

    it('rejects negative line totals', () => {
      expect(() => calculateSubtotal([100, -50])).toThrow('Line totals must be non-negative');
    });

    it('handles largest allowed subtotal without overflow', () => {
      // 50 line items of 1,000,000,000,000 minor each = 50,000,000,000,000 minor
      const maxLine = 1_000_000_000_000;
      const items = Array.from({ length: 50 }, () => maxLine);
      const subtotal = calculateSubtotal(items);
      expect(subtotal).toBe(50_000_000_000_000);
      expect(Number.isSafeInteger(subtotal)).toBe(true);
    });
  });

  describe('calculateTax', () => {
    it('computes 0% tax for 0 bps', () => {
      expect(calculateTax(50000, 0)).toBe(0);
      expect(calculateTax(0, 0)).toBe(0);
    });

    it('computes 15% VAT (1500 bps) with proper round-half-up', () => {
      // 100.00 ETB (10000 minor) * 15% = 15.00 ETB (1500 minor)
      expect(calculateTax(10000, 1500)).toBe(1500);

      // 3.33 ETB (333 minor) * 1500 bps = 499500 / 10000 = 49.95 => 50 minor
      expect(calculateTax(333, 1500)).toBe(50);
    });

    it('handles tax half-cent boundaries', () => {
      // subtotal 50 minor @ 100 bps (1%) => 50 * 100 = 5000 / 10000 = 0.5 => 1 minor
      expect(calculateTax(50, 100)).toBe(1);
      // subtotal 49 minor @ 100 bps => 49 * 100 = 4900 / 10000 = 0.49 => 0 minor
      expect(calculateTax(49, 100)).toBe(0);

      // subtotal 150 minor @ 100 bps => 150 * 100 = 15000 / 10000 = 1.5 => 2 minor
      expect(calculateTax(150, 100)).toBe(2);
      // subtotal 149 minor @ 100 bps => 149 * 100 = 14900 / 10000 = 1.49 => 1 minor
      expect(calculateTax(149, 100)).toBe(1);
    });

    it('computes 100% tax (10,000 bps)', () => {
      expect(calculateTax(25000, 10000)).toBe(25000);
    });

    it('handles maximum possible tax without overflow', () => {
      // Max subtotal = 50,000,000,000,000 minor @ 10,000 bps
      const maxSubtotal = 50_000_000_000_000;
      const tax = calculateTax(maxSubtotal, 10000);
      expect(tax).toBe(50_000_000_000_000);
      expect(Number.isSafeInteger(tax)).toBe(true);
    });

    it('rejects invalid tax rates or negative subtotal', () => {
      expect(() => calculateTax(-100, 1500)).toThrow('Subtotal must be non-negative');
      expect(() => calculateTax(1000, -1)).toThrow('Tax rate must be between 0 and 10000 basis points');
      expect(() => calculateTax(1000, 10001)).toThrow('Tax rate must be between 0 and 10000 basis points');
    });
  });

  describe('calculateTotal', () => {
    it('adds subtotal and tax exactly', () => {
      expect(calculateTotal(10000, 1500)).toBe(11500);
      expect(calculateTotal(0, 0)).toBe(0);
      expect(calculateTotal(100, 0)).toBe(100);
    });

    it('rejects negative inputs', () => {
      expect(() => calculateTotal(-1, 100)).toThrow('Subtotal and tax must be non-negative');
      expect(() => calculateTotal(100, -1)).toThrow('Subtotal and tax must be non-negative');
    });

    it('handles maximum possible total without overflow', () => {
      // 50T subtotal + 50T tax = 100T minor (10^14 minor)
      const maxSubtotal = 50_000_000_000_000;
      const maxTax = 50_000_000_000_000;
      const total = calculateTotal(maxSubtotal, maxTax);
      expect(total).toBe(100_000_000_000_000);
      expect(Number.isSafeInteger(total)).toBe(true);
      expect(total < Number.MAX_SAFE_INTEGER).toBe(true);
    });
  });

  describe('calculateInvoiceTotals', () => {
    it('computes full invoice totals matching hand-calculated examples', () => {
      const items = [
        { quantityMilli: 2000, unitPriceMinor: 15000 }, // 2.000 @ 150.00 = 300.00 (30000 minor)
        { quantityMilli: 1500, unitPriceMinor: 2000 },  // 1.500 @ 20.00 = 30.00 (3000 minor)
      ];
      const taxRateBps = 1500; // 15%

      const result = calculateInvoiceTotals(items, taxRateBps);
      expect(result.lineTotals).toEqual([30000, 3000]);
      expect(result.subtotalMinor).toBe(33000); // 330.00
      expect(result.taxMinor).toBe(4950);       // 15% of 330.00 = 49.50
      expect(result.totalMinor).toBe(37950);     // 379.50
    });
  });

  describe('parseDecimalToMinor (pure string parsing, no floats)', () => {
    it('parses valid decimal strings into integer minor units', () => {
      expect(parseDecimalToMinor('100')).toBe(10000);
      expect(parseDecimalToMinor('100.5')).toBe(10050);
      expect(parseDecimalToMinor('100.05')).toBe(10005);
      expect(parseDecimalToMinor('100.00')).toBe(10000);
      expect(parseDecimalToMinor('0.01')).toBe(1);
      expect(parseDecimalToMinor('0.1')).toBe(10);
      expect(parseDecimalToMinor('0')).toBe(0);
      expect(parseDecimalToMinor('0.0')).toBe(0);
      expect(parseDecimalToMinor('0.00')).toBe(0);
      expect(parseDecimalToMinor('10000000.00')).toBe(1000000000); // 10 million ETB = 1 billion minor
    });

    it('handles whitespace around input gracefully', () => {
      expect(parseDecimalToMinor('  100.50  ')).toBe(10050);
    });

    it('rejects values with more than two decimal places', () => {
      expect(() => parseDecimalToMinor('100.001')).toThrow('Amounts cannot have more than 2 decimal places');
      expect(() => parseDecimalToMinor('0.123')).toThrow('Amounts cannot have more than 2 decimal places');
      expect(() => parseDecimalToMinor('5.555')).toThrow('Amounts cannot have more than 2 decimal places');
    });

    it('rejects negative values', () => {
      expect(() => parseDecimalToMinor('-100')).toThrow('Negative values are not allowed');
      expect(() => parseDecimalToMinor('-0.01')).toThrow('Negative values are not allowed');
      expect(() => parseDecimalToMinor('-0')).toThrow('Negative values are not allowed');
    });

    it('rejects scientific notation', () => {
      expect(() => parseDecimalToMinor('1e5')).toThrow('Scientific notation is not allowed');
      expect(() => parseDecimalToMinor('1E-2')).toThrow('Scientific notation is not allowed');
      expect(() => parseDecimalToMinor('1e+3')).toThrow('Scientific notation is not allowed');
      expect(() => parseDecimalToMinor('2.5E2')).toThrow('Scientific notation is not allowed');
    });

    it('rejects invalid decimal strings, non-numeric characters, and malformed inputs', () => {
      expect(() => parseDecimalToMinor('')).toThrow('Decimal string cannot be empty');
      expect(() => parseDecimalToMinor('   ')).toThrow('Decimal string cannot be empty');
      expect(() => parseDecimalToMinor('abc')).toThrow('Invalid decimal string');
      expect(() => parseDecimalToMinor('$100')).toThrow('Invalid decimal string');
      expect(() => parseDecimalToMinor('100 ETB')).toThrow('Invalid decimal string');
      expect(() => parseDecimalToMinor('1,000.00')).toThrow('Invalid decimal string');
      expect(() => parseDecimalToMinor('.5')).toThrow('Invalid decimal string');
      expect(() => parseDecimalToMinor('100.')).toThrow('Invalid decimal string');
      expect(() => parseDecimalToMinor('1.2.3')).toThrow('Invalid decimal string');
      expect(() => parseDecimalToMinor('NaN')).toThrow('Invalid decimal string');
      expect(() => parseDecimalToMinor('Infinity')).toThrow('Invalid decimal string');
      // @ts-expect-error test non-string
      expect(() => parseDecimalToMinor(100)).toThrow('Input must be a string');
    });

    it('rejects values exceeding safe integer or custom limits', () => {
      expect(() => parseDecimalToMinor('99999999999999999999999999')).toThrow('Amount exceeds maximum allowed limit');
      expect(() => parseDecimalToMinor('500.00', { maxMinor: 40000 })).toThrow('Amount exceeds maximum allowed limit');
      expect(parseDecimalToMinor('400.00', { maxMinor: 40000 })).toBe(40000);
    });
  });

  describe('formatMinor (display formatting without floating-point division)', () => {
    it('formats minor units into clean display strings', () => {
      expect(formatMinor(0)).toBe('0.00');
      expect(formatMinor(1)).toBe('0.01');
      expect(formatMinor(50)).toBe('0.50');
      expect(formatMinor(100)).toBe('1.00');
      expect(formatMinor(10050)).toBe('100.50');
      expect(formatMinor(125000)).toBe('1,250.00');
      expect(formatMinor(100000000)).toBe('1,000,000.00');
    });

    it('formats with currency prefix when specified', () => {
      expect(formatMinor(125000, 'ETB')).toBe('ETB 1,250.00');
      expect(formatMinor(125000, 'USD')).toBe('USD 1,250.00');
      expect(formatMinor(125000, { currency: 'ETB' })).toBe('ETB 1,250.00');
    });

    it('formats negative numbers correctly', () => {
      expect(formatMinor(-100)).toBe('-1.00');
      expect(formatMinor(-125000, 'ETB')).toBe('ETB -1,250.00');
    });

    it('formats largest allowed value with comma separators', () => {
      // 100,000,000,000,000 minor = 1,000,000,000,000.00
      expect(formatMinor(100_000_000_000_000n, 'ETB')).toBe('ETB 1,000,000,000,000.00');
    });

    it('aliases formatMinorToDisplay and formatMoney match formatMinor', () => {
      expect(formatMinorToDisplay(125000, 'ETB')).toBe('ETB 1,250.00');
      expect(formatMoney(125000, 'ETB')).toBe('ETB 1,250.00');
    });
  });

  describe('Verification: Why JavaScript floating-point arithmetic is never used', () => {
    it('proves floating-point representation drift vs exact integer arithmetic', () => {
      // Classic JS float inaccuracy: 0.1 + 0.2 !== 0.3
      const floatSum = 0.1 + 0.2;
      expect(floatSum).not.toBe(0.3); // 0.30000000000000004

      // Our integer arithmetic: 10 + 20 === 30 minor units
      const minor1 = parseDecimalToMinor('0.1'); // 10 minor
      const minor2 = parseDecimalToMinor('0.2'); // 20 minor
      expect(minor1 + minor2).toBe(30);
      expect(formatMinor(minor1 + minor2)).toBe('0.30');
    });

    it('proves parseFloat * 100 truncation bug is avoided by string parsing', () => {
      // parseFloat("1.14") * 100 is 113.99999999999999 in JS IEEE-754
      const floatMultiplied = parseFloat('1.14') * 100;
      expect(Math.floor(floatMultiplied)).toBe(113); // Bug: loses 1 cent!

      // Our string parser: exactly 114 minor
      expect(parseDecimalToMinor('1.14')).toBe(114);
    });
  });
});
