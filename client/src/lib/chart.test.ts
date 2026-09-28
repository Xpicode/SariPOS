import { describe, expect, it } from 'vitest';
import { formatPesoCompact, niceTicks } from './chart';

describe('niceTicks', () => {
  it('570 -> 0, 200, 400, 600', () => expect(niceTicks(570)).toEqual([0, 200, 400, 600]));
  it('a max right on a step stays the top: 1000 -> 0, 500, 1000', () =>
    expect(niceTicks(1000)).toEqual([0, 500, 1000]));
  it('always reaches the max', () => {
    for (const m of [1, 7, 13, 99, 4321, 57000, 123456]) {
      const t = niceTicks(m);
      expect(t[0]).toBe(0);
      expect(t.at(-1)).toBeGreaterThanOrEqual(m);
      expect(t.length).toBeLessThanOrEqual(6);
    }
  });
  it('nothing sold -> 0 and 1 (no divide by zero)', () => expect(niceTicks(0)).toEqual([0, 1]));
});

it('formatPesoCompact', () => {
  expect(formatPesoCompact(125000)).toBe('₱1.3K');
  expect(formatPesoCompact(50000)).toBe('₱500');
});
