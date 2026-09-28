import { describe, expect, it } from 'vitest';
import { centavosToInput, formatPeso, formatPesoShort, parsePeso } from './money';
import { formatStock, plural } from './stock';

const cigarettes = [
  { unitName: 'stick', factor: 1 },
  { unitName: 'pack', factor: 20 },
  { unitName: 'ream', factor: 200 },
];

describe('formatStock (tingi)', () => {
  it('plan example: 130 sticks -> 6 packs + 10 sticks', () => {
    expect(formatStock(130, cigarettes, 'stick')).toBe('6 packs + 10 sticks');
  });
  it('exact bigger units, no zero parts', () => {
    expect(formatStock(200, cigarettes, 'stick')).toBe('1 ream');
    expect(formatStock(220, cigarettes, 'stick')).toBe('1 ream + 1 pack');
  });
  it('zero and singular', () => {
    expect(formatStock(0, cigarettes, 'stick')).toBe('0 sticks');
    expect(formatStock(1, cigarettes, 'stick')).toBe('1 stick');
  });
  it('no 1-piece unit: remainder in the base unit', () => {
    const rice = [
      { unitName: 'kilo', factor: 1000 },
      { unitName: 'half kilo', factor: 500 },
    ];
    expect(formatStock(25300, rice, 'g')).toBe('25 kilos + 300 g');
    expect(formatStock(25500, rice, 'g')).toBe('25 kilos + 1 half kilo');
  });
  it('plurals', () => {
    expect(plural('box', 2)).toBe('boxes');
    expect(plural('pc', 3)).toBe('pcs');
    expect(plural('g', 5)).toBe('g');
  });
});

describe('money', () => {
  it('parses pesos to exact centavos', () => {
    expect(parsePeso('12.50')).toBe(1250);
    expect(parsePeso('12.5')).toBe(1250);
    expect(parsePeso('0.10')).toBe(10); // float math would give 10.000000000000002
    expect(parsePeso('1,200')).toBe(120000);
    expect(parsePeso(' 7 ')).toBe(700);
  });
  it('rejects anything that is not an amount', () => {
    for (const bad of ['', '-5', '1.234', 'abc', '1e5', '12..5', '₱12']) {
      expect(parsePeso(bad)).toBeNull();
    }
  });
  it('formats and round-trips', () => {
    expect(formatPeso(1250)).toBe('₱12.50');
    expect(centavosToInput(1250)).toBe('12.50');
    expect(centavosToInput(5)).toBe('0.05');
    expect(parsePeso(centavosToInput(175000))).toBe(175000);
    expect(formatPesoShort(20000)).toBe('₱200');
    expect(formatPesoShort(100000)).toBe('₱1,000');
    expect(formatPesoShort(1250)).toBe('₱12.50');
  });
});
