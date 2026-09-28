import { describe, expect, it } from 'vitest';
import { breakdown, formatBp, formatMobile, mobileDigits, parseBp } from './ewallet';

describe('formatMobile', () => {
  it('groups a full number', () => expect(formatMobile('09171234567')).toBe('0917 123 4567'));
  it('leaves a masked number alone', () => expect(formatMobile('0917****567')).toBe('0917****567'));
});

describe('commission percent <-> basis points', () => {
  it('3 -> 300, 2.5 -> 250, 2.75% -> 275', () => {
    expect(parseBp('3')).toBe(300);
    expect(parseBp('2.5')).toBe(250);
    expect(parseBp('2.75%')).toBe(275);
  });
  it('rejects junk and more than 50%', () => {
    expect(parseBp('abc')).toBeNull();
    expect(parseBp('51')).toBeNull();
    expect(parseBp('-1')).toBeNull();
  });
  it('300 -> "3.00%"', () => expect(formatBp(300)).toBe('3.00%'));
});

describe('breakdown', () => {
  it('totals per type in a fixed order, skipping empty types', () => {
    const r = breakdown([
      { type: 'ELOAD', amount: 10_000, fee: 300 },
      { type: 'CASH_IN', amount: 100_000, fee: 2_000 },
      { type: 'CASH_IN', amount: 50_000, fee: 1_000 },
    ]);
    expect(r.rows).toEqual([
      { type: 'CASH_IN', count: 2, amount: 150_000, fee: 3_000 },
      { type: 'ELOAD', count: 1, amount: 10_000, fee: 300 },
    ]);
    expect(r.totalFee).toBe(3_300);
  });
  it('nothing yet: no rows, ₱0', () => expect(breakdown([])).toEqual({ rows: [], totalFee: 0 }));
});

describe('mobileDigits', () => {
  it('keeps digits only', () => expect(mobileDigits('0917-123 4567')).toBe('09171234567'));
  it('stops at 11 digits', () => expect(mobileDigits('0917123456789')).toBe('09171234567'));
  it('turns a pasted +63 number into 09…', () =>
    expect(mobileDigits('+63 917 123 4567')).toBe('09171234567'));
  it('ignores letters', () => expect(mobileDigits('09a17')).toBe('0917'));
});
