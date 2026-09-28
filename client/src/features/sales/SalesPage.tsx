import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/context';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPeso } from '@/lib/money';
import { PAYMENT_LABEL } from '@/lib/payments';
import { plural } from '@/lib/stock';
import { formatClock, formatDate, todayInManila } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useSales } from './queries';

export function SalesPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [params, setParams] = useSearchParams();
  const today = todayInManila();
  const day = params.get('day') ?? today;
  const sales = useSales(isOwner ? day : undefined); // cashiers: always the open shift

  const completed = sales.data?.filter((s) => s.status === 'COMPLETED') ?? [];
  const voided = (sales.data?.length ?? 0) - completed.length;
  const total = completed.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {isOwner
              ? 'Every receipt of the day. Open one to reprint or void it.'
              : 'Receipts from this shift. Open one to reprint or void it.'}
          </p>
        </div>
        {isOwner && (
          <div className="grid gap-1.5">
            <Label htmlFor="day">Day</Label>
            <Input
              id="day"
              type="date"
              max={today}
              value={day}
              onChange={(e) => setParams(e.target.value ? { day: e.target.value } : {})}
              className="w-44"
            />
          </div>
        )}
      </header>

      {sales.isPending ? (
        <p className="text-[15px] text-muted-foreground">Loading…</p>
      ) : sales.isError ? (
        <p role="alert" className="text-[15px]">
          {sales.error.message}
        </p>
      ) : sales.data.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-5 py-10 text-center text-[15px] text-muted-foreground">
          {isOwner
            ? `No sales on ${formatDate(day)}.`
            : 'No sales in this shift yet. Sales appear here after you ring them up on Sell.'}
        </p>
      ) : (
        <>
          <section
            aria-label="Summary"
            className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-2xl border bg-card shadow-sm px-5 py-4"
          >
            <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
              {formatPeso(total)}
            </p>
            <p className="text-[15px] text-muted-foreground">
              {completed.length} {plural('sale', completed.length)}
              {voided > 0 && ` · ${voided} voided (not counted)`}
            </p>
          </section>

          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {sales.data.map((s) => {
              const isVoided = s.status === 'VOIDED';
              return (
                <li key={s.id}>
                  <Link
                    to={`/sales/${s.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[15px] font-semibold">{s.saleNo}</span>
                      <span className="block text-sm text-muted-foreground">
                        {formatClock(s.createdAt)} · {s.itemCount} {plural('item', s.itemCount)} ·{' '}
                        {PAYMENT_LABEL[s.paymentType]}
                        {s.customerName && ` · ${s.customerName}`}
                        {isOwner && ` · ${s.cashierName}`}
                      </span>
                    </span>
                    {isVoided && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold tracking-wide text-destructive">
                        VOIDED
                      </span>
                    )}
                    <span
                      className={cn(
                        'font-mono text-[15px] font-semibold tabular-nums',
                        isVoided && 'text-muted-foreground line-through',
                      )}
                    >
                      {formatPeso(s.total)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
