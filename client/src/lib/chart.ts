// Y-axis ticks at clean numbers (0 / 500 / 1,000…), from 0 up to at least the biggest value.
// Step = 1, 2 or 5 × a power of ten, whichever gives about `count` steps.
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

const compact = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
});
// Axis labels: 125000 centavos -> "₱1.3K"
export const formatPesoCompact = (centavos: number) => compact.format(centavos / 100);
