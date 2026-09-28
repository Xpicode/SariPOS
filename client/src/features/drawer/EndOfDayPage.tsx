import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, LockKeyhole, Printer } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { api } from '@/api/client';
import type { CashSession } from '@/api/types';
import { useAuth } from '@/auth/context';
import { FormField } from '@/components/FormField';
import { PrintOnly } from '@/components/PrintOnly';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCurrentSession } from '@/features/sales/queries';
import { formatPeso } from '@/lib/money';
import { cn } from '@/lib/utils';
import { DenominationCounter } from './DenominationCounter';
import { countTotal, overShortText, toCashCount, type Counts } from './denominations';
import { useAfterDrawerChange } from './queries';
import { ZReport } from './ZReport';

const backLink = (
  <Link
    to="/drawer"
    className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft className="size-4" aria-hidden />
    Cash drawer
  </Link>
);

// After closing: the result first (big), then the Z-report to print.
function Closed({ report }: { report: CashSession }) {
  const r = report.overShort!;
  return (
    <div className="grid gap-6">
      {backLink}
      <header
        className={cn(
          'rounded-2xl px-5 py-5 sm:px-6',
          r === 0 && 'bg-accent text-accent-foreground',
          r < 0 && 'bg-destructive/10 text-destructive',
          r > 0 && 'bg-warning-soft text-warning',
        )}
      >
        <h1 className="text-sm font-semibold">Shift closed</h1>
        <p className="mt-1 font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
          {overShortText(r)}
        </p>
        <p className="mt-1 text-[15px]">
          Counted {formatPeso(report.actualCash!)} · expected {formatPeso(report.expectedCash!)}
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-[minmax(0,420px)_1fr] md:items-start">
        <div className="receipt-outline">
          <ZReport report={report} />
        </div>
        <PrintOnly>
          <ZReport report={report} />
        </PrintOnly>
        <div className="grid content-start gap-3 sm:max-w-xs">
          <Button onClick={() => window.print()}>
            <Printer aria-hidden />
            Print Z-report
          </Button>
          <Button variant="outline" asChild>
            <Link to="/drawer">Done</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EndOfDayPage() {
  const { user } = useAuth();
  const session = useCurrentSession();
  const afterChange = useAfterDrawerChange();
  const [counts, setCounts] = useState<Counts>({});
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [closed, setClosed] = useState<CashSession | null>(null);
  const total = countTotal(counts);

  const close = useMutation({
    mutationFn: (id: number) =>
      api<{ session: CashSession }>(`/cash-sessions/${id}/close`, {
        method: 'POST',
        // Only what was COUNTED. The server works out what was expected.
        body: {
          actualCash: total,
          cashCount: toCashCount(counts),
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: ({ session: report }) => {
      setClosed(report);
      setConfirming(false);
      afterChange(); // Sell now shows "Start of day" again
    },
  });

  if (closed) return <Closed report={closed} />;
  if (session.isPending) return <p className="text-[15px] text-muted-foreground">Loading…</p>;
  if (session.isError) return <p role="alert">{session.error.message}</p>;
  if (!session.data) return <Navigate to="/drawer" replace />; // nothing open to close

  const current = session.data;
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    close.reset();
    setConfirming(true);
  }

  return (
    <div className="grid max-w-2xl gap-6">
      {backLink}
      <header>
        <h1 className="text-3xl font-bold tracking-tight">End of day</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Count every bill and coin in the drawer.{' '}
          {user?.role === 'OWNER'
            ? `Expected right now: ${formatPeso(current.expectedCash ?? 0)}.`
            : 'You’ll see whether it’s over or short after you save the count.'}
        </p>
      </header>
      <form
        onSubmit={onSubmit}
        className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
      >
        <DenominationCounter counts={counts} onChange={setCounts} totalLabel="Counted" />
        <FormField id="close-notes" label="Notes (optional)">
          <Input
            id="close-notes"
            maxLength={255}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the owner should know"
          />
        </FormField>
        <Button type="submit" size="lg">
          <LockKeyhole aria-hidden />
          Close drawer
        </Button>
      </form>

      {confirming && (
        <Dialog open onOpenChange={(open) => !open && !close.isPending && setConfirming(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Close the drawer with {formatPeso(total)}?</DialogTitle>
              <DialogDescription>
                The count can’t be changed afterwards, and selling stops until the drawer is opened
                again.
              </DialogDescription>
            </DialogHeader>
            {close.isError && (
              <p role="alert" className="text-[15px] font-medium text-destructive">
                {close.error.message}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={close.isPending}
              >
                Keep counting
              </Button>
              <Button onClick={() => close.mutate(current.id)} disabled={close.isPending}>
                {close.isPending ? 'Closing…' : 'Close drawer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
