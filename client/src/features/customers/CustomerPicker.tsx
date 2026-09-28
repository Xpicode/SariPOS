import { Search } from 'lucide-react';
import { useState } from 'react';
import type { Customer } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPeso } from '@/lib/money';
import { useDebounced } from '@/lib/useDebounced';
import { cn } from '@/lib/utils';
import { useCustomers } from './queries';

// Why a customer can't take this sale on utang (null = they can). The server re-checks it
// with the customer row locked; this only saves a trip and explains it up front.
function whyNot(c: Customer, total: number) {
  if (c.isBlocked) return 'Blocked from utang';
  const room = c.creditLimit - c.balance;
  if (total > room) return `Over the limit: can add up to ${formatPeso(Math.max(0, room))}`;
  return null;
}

export function CustomerPicker({
  total,
  selected,
  onSelect,
}: {
  total: number;
  selected: Customer | null;
  onSelect: (c: Customer | null) => void;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const customers = useCustomers(debounced);

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-2xl border px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{selected.name}</p>
          <p className="text-sm text-muted-foreground">
            Owes {formatPeso(selected.balance)} → after this sale{' '}
            <strong className="font-semibold text-foreground">
              {formatPeso(selected.balance + total)}
            </strong>{' '}
            of {formatPeso(selected.creditLimit)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Customer’s name"
          aria-label="Find the customer"
          className="pl-10"
        />
      </div>
      <ul aria-label="Customers" className="max-h-60 divide-y overflow-y-auto rounded-2xl border">
        {customers.isPending ? (
          <li className="px-4 py-3 text-[15px] text-muted-foreground">Loading…</li>
        ) : customers.isError ? (
          <li role="alert" className="px-4 py-3 text-[15px]">
            {customers.error.message}
          </li>
        ) : customers.data.length === 0 ? (
          <li className="px-4 py-3 text-[15px] text-muted-foreground">
            No customer found. Add them under Utang first.
          </li>
        ) : (
          customers.data.slice(0, 30).map((c) => {
            const reason = whyNot(c, total);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={reason !== null}
                  onClick={() => onSelect(c)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset disabled:cursor-not-allowed"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-[15px] font-semibold', reason && 'text-muted-foreground')}>
                      {c.name}
                    </span>
                    <span className={cn('block text-sm', reason ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                      {reason ?? `Owes ${formatPeso(c.balance)} · limit ${formatPeso(c.creditLimit)}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
