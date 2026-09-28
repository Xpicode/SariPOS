// Everything inside the system is whole centavos (₱12.50 = 1250). Convert only at the edges:
// parse what a person types, format what a person reads.

const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

// 1250 -> "₱12.50"
export const formatPeso = (centavos: number) => pesoFmt.format(centavos / 100);

// 20000 -> "₱200", 1250 -> "₱12.50" (for small buttons)
export const formatPesoShort = (centavos: number) => formatPeso(centavos).replace(/\.00$/, '');

// "12.50" -> 1250, "1,200" -> 120000, "12.5" -> 1250. Invalid -> null.
// Parsed as text, not float math, so "0.10" is exactly 10 (0.1 * 100 = 10.000000000000002).
export function parsePeso(input: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/,/g, ''));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

// 1250 -> "12.50" (for filling an input box)
export const centavosToInput = (centavos: number) =>
  `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
