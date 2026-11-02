import { describe, it, expect } from 'vitest';
import { escapeIlikePattern } from './sql';

describe('escapeIlikePattern utility', () => {
  it('returns empty string unmodified', () => {
    expect(escapeIlikePattern('')).toBe('');
  });

  it('preserves alphanumeric strings without wildcards', () => {
    expect(escapeIlikePattern('Acme Corp 123')).toBe('Acme Corp 123');
    expect(escapeIlikePattern('contact@example.com')).toBe('contact@example.com');
    expect(escapeIlikePattern('INV-2026-0001')).toBe('INV-2026-0001');
  });

  it('escapes percentage sign (%) wildcards', () => {
    expect(escapeIlikePattern('100%')).toBe('100\\%');
    expect(escapeIlikePattern('%discount%')).toBe('\\%discount\\%');
  });

  it('escapes underscore (_) single-character wildcards', () => {
    expect(escapeIlikePattern('user_name')).toBe('user\\_name');
    expect(escapeIlikePattern('_leading_trailing_')).toBe('\\_leading\\_trailing\\_');
  });

  it('escapes backslash (\\) escape characters', () => {
    expect(escapeIlikePattern('folder\\file')).toBe('folder\\\\file');
    expect(escapeIlikePattern('trailing\\')).toBe('trailing\\\\');
  });

  it('escapes combined wildcards and backslashes', () => {
    expect(escapeIlikePattern('100%_bonus\\test')).toBe('100\\%\\_bonus\\\\test');
  });

  it('preserves Unicode and international characters (e.g. Amharic / Ethiopian text)', () => {
    expect(escapeIlikePattern('አበበ በሶ በላ')).toBe('አበበ በሶ በላ');
    expect(escapeIlikePattern('ብር_100%')).toBe('ብር\\_100\\%');
  });
});
