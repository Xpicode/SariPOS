import { describe, expect, it } from 'vitest';
import { pesos, toCsv } from './csv';

describe('toCsv', () => {
  it('joins cells and rows', () =>
    expect(
      toCsv([
        ['a', 1],
        ['b', 2],
      ]),
    ).toBe('a,1\r\nb,2'));
  it('quotes commas, quotes and newlines', () =>
    expect(toCsv([['Coke, 1.5L', 'say "hi"', 'two\nlines']])).toBe(
      '"Coke, 1.5L","say ""hi""","two\nlines"',
    ));
  it('turns formulas into text (CSV injection)', () => {
    expect(toCsv([['=HYPERLINK("http://x")']])).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(toCsv([['+1'], ['-2'], ['@SUM(A1)']])).toBe("'+1\r\n'-2\r\n'@SUM(A1)");
  });
  it('leaves real numbers alone, negative ones too', () =>
    expect(toCsv([[-252, 0.5]])).toBe('-252,0.5'));
  it('empty for null/undefined', () => expect(toCsv([[null, undefined, 'x']])).toBe(',,x'));
});

it('pesos: centavos -> a plain number', () => expect(pesos(123450)).toBe(1234.5));
