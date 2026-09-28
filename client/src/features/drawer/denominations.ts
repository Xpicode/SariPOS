import { formatPeso, formatPesoShort } from '@/lib/money';

// Philippine bills and coins in centavos (same list as the server). ₱20 is both a bill and a
// coin; they're counted together.
export const BILLS = [100000, 50000, 20000, 10000, 5000, 2000] as const;
export const COINS = [1000, 500, 100, 25] as const;

export type Counts = Record<string, string>; // what's typed in each box, e.g. { "100000": "3" }

export const denomLabel = (centavos: number) =>
  centavos < 100 ? `${centavos}¢` : formatPesoShort(centavos);

const howMany = (text: string | undefined) => Number(text) || 0; // "" or junk -> 0

// ₱ total of the counted bills and coins, in centavos.
export const countTotal = (counts: Counts) =>
  Object.entries(counts).reduce((sum, [d, n]) => sum + Number(d) * howMany(n), 0);

// What the server stores: only the denominations actually present, as numbers.
export const toCashCount = (counts: Counts) =>
  Object.fromEntries(
    Object.entries(counts)
      .filter(([, n]) => howMany(n) > 0)
      .map(([d, n]) => [d, howMany(n)]),
  );

// "+₱5.00 over", "₱3.25 short", "Exact"
export function overShortText(n: number) {
  if (n === 0) return 'Exact';
  return n > 0 ? `Over by ${formatPeso(n)}` : `Short by ${formatPeso(-n)}`;
}
