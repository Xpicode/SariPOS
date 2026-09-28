// Units that read the same in singular and plural ("300 g", not "300 gs").
const NO_PLURAL = new Set(['g', 'kg', 'ml', 'l']);

export function plural(word: string, n: number) {
  if (n === 1 || NO_PLURAL.has(word)) return word;
  if (word === 'pc') return 'pcs';
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`; // box -> boxes
  return `${word}s`;
}

type UnitLike = { unitName: string; factor: number };

// Tingi display: stock is stored in base units, people think in packs.
//   130 sticks, units stick(1) pack(20) ream(200)  ->  "6 packs + 10 sticks"
//   25300 g,    units kilo(1000) half kilo(500)     ->  "25 kilos + 300 g"
// Biggest unit first; whatever is left is shown in the 1-piece unit's name (or the base unit).
export function formatStock(qty: number, units: UnitLike[], baseUnit: string) {
  const single = units.find((u) => u.factor === 1)?.unitName ?? baseUnit;
  if (qty <= 0) return `0 ${plural(single, 0)}`;

  const parts: string[] = [];
  let left = qty;
  for (const u of [...units].sort((a, b) => b.factor - a.factor)) {
    if (u.factor === 1) continue;
    const n = Math.floor(left / u.factor);
    if (n > 0) {
      parts.push(`${n} ${plural(u.unitName, n)}`);
      left -= n * u.factor;
    }
  }
  if (left > 0) parts.push(`${left} ${plural(single, left)}`);
  return parts.join(' + ');
}
