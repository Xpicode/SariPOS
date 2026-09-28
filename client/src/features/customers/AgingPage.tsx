import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import type { AgingBucket } from '@/api/types';
import { formatPeso } from '@/lib/money';
import { plural } from '@/lib/stock';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useAging } from './queries';

const BUCKET_LABEL: Record<AgingBucket, string> = {
  '0-7': '0–7 days',
  '8-15': '8–15 days',
  '16-30': '16–30 days',
  '30+': 'Over 30 days',
};

// The older the unpaid utang, the more it needs a follow-up: color deepens with age.
const BUCKET_TONE: Record<AgingBucket, string> = {
  '0-7': 'text-foreground',
  '8-15': 'text-foreground',
  '16-30': 'text-warning',
  '30+': 'text-destructive',
};

// Owner: how long each customer has owed, counted from their oldest unpaid utang.
export function AgingPage() {
  const aging = useAging();
  return (
    <div className="grid gap-6">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Utang
      </Link>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Aging report</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          How long customers have owed, from their oldest unpaid utang. Payments clear the oldest
          utang first.
        </p>
      </header>

      {aging.isPending ? (
        <p className="text-[15px] text-muted-foreground">Loading…</p>
      ) : aging.isError ? (
        <p role="alert">{aging.error.message}</p>
      ) : (
        <>
          <section aria-label="By age" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {aging.data.buckets.map((b) => (
              <div key={b.bucket} className="rounded-2xl border bg-card p-4 shadow-sm">
                <p className="text-sm font-semibold text-muted-foreground">
                  {BUCKET_LABEL[b.bucket]}
                </p>
                <p
                  className={cn(
                    'mt-1 font-mono text-2xl font-bold tabular-nums',
                    b.count > 0 && BUCKET_TONE[b.bucket],
                  )}
                >
                  {formatPeso(b.total)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {b.count} {plural('customer', b.count)}
                </p>
              </div>
            ))}
          </section>

          {aging.data.customers.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-5 py-10 text-center text-[15px] text-muted-foreground">
              Nobody owes the store right now.
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
              {aging.data.customers.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/customers/${c.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{c.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        Oldest unpaid: {formatDateTime(c.oldestUnpaid)} ·{' '}
                        <span className={cn('font-semibold', BUCKET_TONE[c.bucket])}>
                          {c.daysOwed} {plural('day', c.daysOwed)}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-lg font-bold tabular-nums">
                      {formatPeso(c.balance)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
