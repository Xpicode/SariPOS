import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorOpen } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/api/client';
import type { CashSession } from '@/api/types';
import { Button } from '@/components/ui/button';
import { formatPeso } from '@/lib/money';
import { DenominationCounter } from './DenominationCounter';
import { countTotal, type Counts } from './denominations';
import { useAfterDrawerChange } from './queries';

// Every sale belongs to an open drawer (plan 6.5), so this is the first screen of the day,
// both here and on Sell.
export function StartOfDay() {
  const queryClient = useQueryClient();
  const afterChange = useAfterDrawerChange();
  const [counts, setCounts] = useState<Counts>({});
  const total = countTotal(counts);

  const open = useMutation({
    mutationFn: () =>
      api<{ session: CashSession }>('/cash-sessions/open', {
        method: 'POST',
        body: { openingCash: total },
      }),
    onSuccess: ({ session }) => {
      queryClient.setQueryData(['cash-session'], session);
      afterChange();
    },
    onError: (err) => {
      // Someone else opened it a moment ago: just show the open drawer.
      if (err instanceof ApiError && err.code === 'SESSION_ALREADY_OPEN') afterChange();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    open.mutate();
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Start of day</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Count the cash in the drawer before the first sale. At closing time, SariPOS compares the
          count with what should be there.
        </p>
      </header>
      <form
        onSubmit={onSubmit}
        className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
      >
        <DenominationCounter counts={counts} onChange={setCounts} totalLabel="Opening cash" />
        {open.isError && (
          <p role="alert" className="text-[15px] font-medium text-destructive">
            {open.error.message}
          </p>
        )}
        <Button type="submit" size="lg" disabled={open.isPending}>
          <DoorOpen aria-hidden />
          {open.isPending ? 'Opening…' : `Open drawer with ${formatPeso(total)}`}
        </Button>
      </form>
    </div>
  );
}
