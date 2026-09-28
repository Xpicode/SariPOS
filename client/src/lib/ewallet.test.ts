import { describe, expect, it } from 'vitest';
import { formatBp, formatMobile, parseBp } from './ewallet';

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
