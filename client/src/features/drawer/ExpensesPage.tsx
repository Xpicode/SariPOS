import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EXPENSE_LABEL } from '@/lib/expenses';
import { formatPeso } from '@/lib/money';
import { formatDateTime, todayInManila } from '@/lib/time';
import { ExpenseDialog } from './ExpenseDialog';
import { useExpenses } from './queries';

// Owner: everything the store spent, this month by default.
export function ExpensesPage() {
  const today = todayInManila();
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? `${today.slice(0, 8)}01`;
  const to = params.get('to') ?? today;
  const expenses = useExpenses(from, to);
  const [recording, setRecording] = useState(false);

  const setDate = (key: 'from' | 'to', value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });

  const rows = expenses.data ?? [];
  // A withdrawal is the owner taking money home: it leaves the drawer, but it isn't a cost.
  const business = rows.filter((e) => e.category !== 'OWNER_WITHDRAWAL');
  const withdrawals = rows.filter((e) => e.category === 'OWNER_WITHDRAWAL');
  const sum = (list: typeof rows) => list.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            What the store spent, and what you took home.
          </p>
        </div>
        <Button onClick={() => setRecording(true)}>
          <HandCoins aria-hidden />
          Record expense
        </Button>
      </header>

      <div className="flex flex-wrap gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            max={today}
            value={from}
            onChange={(e) => setDate('from', e.target.value)}
            className="w-44"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            max={today}
            value={to}
            onChange={(e) => setDate('to', e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {expenses.isPending ? (
        <p className="text-[15px] text-muted-foreground">Loading…</p>
      ) : expenses.isError ? (
        <p role="alert" className="text-[15px]">
          {expenses.error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-5 py-10 text-center text-[15px] text-muted-foreground">
          No expenses in these dates.
        </p>
      ) : (
        <>
          <section
            aria-label="Totals"
            className="grid gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm sm:grid-cols-2"
          >
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Business expenses</p>
              <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
                {formatPeso(sum(business))}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">
                Owner withdrawals (not a cost)
              </p>
              <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
                {formatPeso(sum(withdrawals))}
              </p>
            </div>
          </section>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {rows.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">
                    {EXPENSE_LABEL[e.category]}
                    {e.note && (
                      <span className="font-normal text-muted-foreground"> · {e.note}</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(e.createdAt)} · {e.createdBy} ·{' '}
                    {e.paidFromDrawer ? 'from the drawer' : 'not from the drawer'}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-[15px] font-semibold tabular-nums">
                  {formatPeso(e.amount)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {recording && <ExpenseDialog onClose={() => setRecording(false)} />}
    </div>
  );
}
