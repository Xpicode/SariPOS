import { formatPeso } from '@/lib/money';
import { BILLS, COINS, countTotal, denomLabel, type Counts } from './denominations';

function Group({
  title,
  values,
  counts,
  onChange,
}: {
  title: string;
  values: readonly number[];
  counts: Counts;
  onChange: (counts: Counts) => void;
}) {
  return (
    <fieldset className="grid content-start gap-1.5">
      <legend className="mb-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </legend>
      {values.map((d) => {
        const n = Number(counts[d]) || 0;
        const label = denomLabel(d);
        return (
          <div key={d} className="grid grid-cols-[4.5rem_auto_5rem_1fr] items-center gap-2">
            <label
              htmlFor={`count-${d}`}
              className="font-mono text-[15px] font-semibold tabular-nums"
            >
              {label}
            </label>
            <span className="text-muted-foreground" aria-hidden>
              ×
            </span>
            <input
              id={`count-${d}`}
              aria-label={`How many ${label}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              maxLength={6}
              value={counts[d] ?? ''}
              onFocus={(e) => e.target.select()}
              onChange={(e) => onChange({ ...counts, [d]: e.target.value.replace(/\D/g, '') })}
              className="h-11 w-full rounded-lg border bg-card px-3 text-center font-mono text-base tabular-nums outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <span
              className={
                n > 0
                  ? 'text-right font-mono text-[15px] tabular-nums'
                  : 'text-right font-mono text-[15px] text-muted-foreground/60 tabular-nums'
              }
            >
              {formatPeso(n * d)}
            </span>
          </div>
        );
      })}
    </fieldset>
  );
}

// Count the drawer bill by bill: fewer mistakes than adding it up in your head, and the count
// itself is saved with the shift (so a shortage can be re-checked later).
export function DenominationCounter({
  counts,
  onChange,
  totalLabel,
}: {
  counts: Counts;
  onChange: (counts: Counts) => void;
  totalLabel: string;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
        <Group title="Bills" values={BILLS} counts={counts} onChange={onChange} />
        <Group title="Coins" values={COINS} counts={counts} onChange={onChange} />
      </div>
      <div
        aria-live="polite"
        className="flex items-baseline justify-between gap-3 rounded-2xl bg-muted/70 px-5 py-4"
      >
        <span className="text-[15px] font-semibold">{totalLabel}</span>
        <span className="font-mono text-3xl font-bold tracking-tight tabular-nums">
          {formatPeso(countTotal(counts))}
        </span>
      </div>
    </div>
  );
}
