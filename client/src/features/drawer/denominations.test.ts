import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/time';
import { countTotal, denomLabel, overShortText, toCashCount } from './denominations';

describe('drawer count', () => {
  it('adds up bills and coins exactly (in centavos)', () => {
    // 1 × ₱1,000 + 1 × ₱500 + 2 × ₱100 + 1 × ₱10 + 1 × 25¢ = ₱1,710.25
    const counts = { '100000': '1', '50000': '1', '10000': '2', '1000': '1', '25': '1' };
    expect(countTotal(counts)).toBe(171025);
  });
  it('treats empty or junk boxes as zero, and stores only what is there', () => {
    const counts = { '100000': '', '50000': '2', '25': 'abc', '100': '0' };
    expect(countTotal(counts)).toBe(100000);
    expect(toCashCount(counts)).toEqual({ '50000': 2 });
  });
  it('labels', () => {
    expect(denomLabel(100000)).toBe('₱1,000');
    expect(denomLabel(25)).toBe('25¢');
    expect(overShortText(0)).toBe('Exact');
    expect(overShortText(500)).toBe('Over by ₱5.00');
    expect(overShortText(-325)).toBe('Short by ₱3.25');
  });
  it('addDays crosses months and years', () => {
    expect(addDays('2026-09-28', -30)).toBe('2026-08-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // leap year
  });
});
