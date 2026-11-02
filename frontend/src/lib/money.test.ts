import { describe, it, expect } from 'vitest';
import {
  roundHalfUpDiv,
  calculateLineTotal,
  calculateSubtotal,
  calculateTax,
  calculateTotal,
  calculateInvoiceTotals,
  parseDecimalToMinor,
  formatMinorToDecimal,
  formatMoney,
  parseQuantityToMilli,
  formatMilliToQuantity,
} from './money';

describe('Shared Money Utilities (Frontend)', () => {
  it('correctly divides with round-half-up logic', () => {
    expect(roundHalfUpDiv(5n, 2n)).toBe(3n);
    expect(roundHalfUpDiv(4n, 2n)).toBe(2n);
    expect(roundHalfUpDiv(1n, 2n)).toBe(1n);
    expect(roundHalfUpDiv(0n, 2n)).toBe(0n);
  });

  it('calculates line totals with milli quantity and minor unit price', () => {
    // 1 item @ 250.00 ETB (1000 milli * 25000 minor / 1000 = 25000)
    expect(calculateLineTotal(1000, 25000)).toBe(25000);
    // 2.5 items @ 100.00 ETB (2500 milli * 10000 minor / 1000 = 25000)
    expect(calculateLineTotal(2500, 10000)).toBe(25000);
    // 1.333 items @ 10.00 ETB (1333 milli * 1000 minor / 1000 = 1333)
    expect(calculateLineTotal(1333, 1000)).toBe(1333);
  });

  it('calculates subtotal and taxes accurately', () => {
    const lineTotals = [10000, 25000, 15000]; // 500.00 ETB
    const subtotal = calculateSubtotal(lineTotals);
    expect(subtotal).toBe(50000);

    // 15% VAT (1500 bps) on 50000 minor = 7500 minor (75.00 ETB)
    const tax = calculateTax(subtotal, 1500);
    expect(tax).toBe(7500);

    // Total = 50000 + 7500 = 57500 minor (575.00 ETB)
    const total = calculateTotal(subtotal, tax);
    expect(total).toBe(57500);
  });

  it('calculates full invoice totals in one call', () => {
    const items = [
      { quantityMilli: 2000, unitPriceMinor: 10000 }, // 200.00
      { quantityMilli: 1000, unitPriceMinor: 5000 },  // 50.00
    ];
    const totals = calculateInvoiceTotals(items, 1500); // 15% VAT
    expect(totals.lineTotals).toEqual([20000, 5000]);
    expect(totals.subtotalMinor).toBe(25000); // 250.00
    expect(totals.taxMinor).toBe(3750);      // 37.50
    expect(totals.totalMinor).toBe(28750);    // 287.50
  });

  it('parses decimal string into minor units using string parsing without float imprecision', () => {
    expect(parseDecimalToMinor('125.50')).toBe(12550);
    expect(parseDecimalToMinor('100')).toBe(10000);
    expect(parseDecimalToMinor('0.05')).toBe(5);
    expect(parseDecimalToMinor('0')).toBe(0);
  });

  it('formats minor units to decimal and money displays', () => {
    expect(formatMinorToDecimal(12550)).toBe('125.50');
    expect(formatMinorToDecimal(500)).toBe('5.00');
    expect(formatMinorToDecimal(5)).toBe('0.05');
    expect(formatMoney(12550, 'ETB')).toBe('ETB 125.50');
    expect(formatMoney(1000000, 'USD')).toBe('USD 10,000.00');
  });

  it('parses and formats quantities cleanly', () => {
    expect(parseQuantityToMilli('1')).toBe(1000);
    expect(parseQuantityToMilli('2.5')).toBe(2500);
    expect(parseQuantityToMilli('0.005')).toBe(5);
    expect(formatMilliToQuantity(1000)).toBe('1');
    expect(formatMilliToQuantity(2500)).toBe('2.5');
    expect(formatMilliToQuantity(1250)).toBe('1.25');
  });
});
