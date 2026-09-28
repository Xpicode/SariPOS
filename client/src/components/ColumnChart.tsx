import { useState, type KeyboardEvent } from 'react';
import { niceTicks } from '@/lib/chart';
import { cn } from '@/lib/utils';

export type Column = {
  key: string;
  label: string; // full name: tooltip heading and table row ("Mon, Sep 28")
  tick?: string; // short x-axis label; only some columns get one, so they never collide
  value: number;
  details: string[]; // extra lines for the tooltip and the table ("5 sales")
};

// One series of columns (sales per day, sales per hour). Plain HTML, no chart library.
// One color, no legend: the section title says what is plotted. Columns grow from one baseline,
// capped at 24px wide with a 2px gap and 4px rounded tops; gridlines are hairlines at clean values.
// Hover (or focus + ← →) shows a tooltip; "Show as table" has every number without hovering.
export function ColumnChart({
  label,
  columns,
  formatValue,
  formatAxis,
  valueName,
}: {
  label: string;
  columns: Column[];
  formatValue: (v: number) => string;
  formatAxis: (v: number) => string;
  valueName: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...columns.map((c) => c.value)));
  const top = ticks.at(-1)!;
  const pct = (v: number) => (v / top) * 100;
  const n = columns.length;
  const current = active === null ? null : columns[active];

  function onKeyDown(e: KeyboardEvent) {
    // From nothing selected: → starts at the first column, ← at the last.
    const moves: Record<string, (a: number | null) => number> = {
      ArrowRight: (a) => (a === null ? 0 : Math.min(n - 1, a + 1)),
      ArrowLeft: (a) => (a === null ? n - 1 : Math.max(0, a - 1)),
      Home: () => 0,
      End: () => n - 1,
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setActive(move);
  }

  // Keep the tooltip inside the chart near the left and right edges.
  const at = active === null ? 0 : ((active + 0.5) / n) * 100;
  const shift = at < 18 ? '0%' : at > 82 ? '-100%' : '-50%';

  return (
    <figure className="grid gap-3">
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2">
        <div className="relative h-48" aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 font-mono text-[11px] text-muted-foreground tabular-nums"
              style={{ bottom: `${pct(t)}%` }}
            >
              {formatAxis(t)}
            </span>
          ))}
        </div>

        <div
          tabIndex={0}
          role="group"
          aria-label={`${label}. Use the left and right arrow keys to read each column.`}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="relative h-48 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className={cn(
                'absolute inset-x-0 border-t',
                t === 0 ? 'border-foreground/25' : 'border-border',
              )}
              style={{ bottom: `${pct(t)}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" aria-hidden>
            {columns.map((c, i) => (
              // The whole slot is the hover target, not just the painted column.
              <div
                key={c.key}
                onPointerEnter={() => setActive(i)}
                className={cn(
                  'flex h-full min-w-0 flex-1 items-end justify-center rounded-t-sm',
                  active === i && 'bg-muted/60',
                )}
              >
                <div
                  className={cn(
                    'w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity',
                    active !== null && active !== i && 'opacity-55',
                  )}
                  style={{ height: c.value > 0 ? `max(2px, ${pct(c.value)}%)` : 0 }}
                />
              </div>
            ))}
          </div>

          {current && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md"
              style={{ left: `${at}%`, transform: `translate(${shift}, -8px)` }}
            >
              <p className="font-mono text-base font-bold tabular-nums">
                {formatValue(current.value)}
              </p>
              <p className="text-muted-foreground">{current.label}</p>
              {current.details.map((d) => (
                <p key={d} className="text-muted-foreground">
                  {d}
                </p>
              ))}
            </div>
          )}
        </div>

        <span />
        <div className="mt-1.5 flex gap-[2px]" aria-hidden>
          {columns.map((c) => (
            <span
              key={c.key}
              className="flex min-w-0 flex-1 justify-center font-mono text-[11px] whitespace-nowrap text-muted-foreground"
            >
              {c.tick}
            </span>
          ))}
        </div>
      </div>

      {/* What the tooltip shows, read out for keyboard and screen reader users. */}
      <p aria-live="polite" className="sr-only">
        {current &&
          `${current.label}: ${formatValue(current.value)}. ${current.details.join('. ')}`}
      </p>

      <details className="text-sm">
        <summary className="w-fit cursor-pointer rounded font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          Show as table
        </summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 text-right font-medium">{valueName}</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {columns.map((c) => (
                <tr key={c.key}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{c.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {formatValue(c.value)}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.details.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
