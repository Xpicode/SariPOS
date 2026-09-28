import { CalendarClock, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPeso } from '@/lib/money';
import { plural } from '@/lib/stock';
import { formatDate } from '@/lib/time';
import { isOverdue } from '@/lib/utang';
import { useDebounced } from '@/lib/useDebounced';
import { CustomerFormDialog } from './CustomerDialogs';
import { LimitBar } from './LimitBar';
import { useCustomers } from './queries';

export function CustomersPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const customers = useCustomers(debounced);
  const [adding, setAdding] = useState(false);

  const owing = customers.data?.filter((c) => c.balance > 0) ?? [];
  const totalOwed = owing.reduce((s, c) => s + c.balance, 0);
  const overdue = owing.filter(isOverdue).length;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Utang</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Who owes the store, and how much. Open a customer to receive a payment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner && (
            <Button variant="outline" asChild>
              <Link to="/customers/aging">
                <CalendarClock aria-hidden />
                Aging report
              </Link>
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            Add customer
          </Button>
        </div>
      </header>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or mobile number"
          aria-label="Search customers"
          className="h-12 pl-10"
        />
      </div>

      {customers.isPending ? (
        <p className="text-[15px] text-muted-foreground">Loading…</p>
      ) : customers.isError ? (
        <p role="alert">{customers.error.message}</p>
      ) : customers.data.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-5 py-10 text-center text-[15px] text-muted-foreground">
          {debounced
            ? `No customer matches “${debounced}”.`
            : 'No customers yet. Add the first one.'}
        </p>
      ) : (
        <>
          {!debounced && (
            <section
              aria-label="Total owed"
              className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-2xl border bg-card px-5 py-4 shadow-sm"
            >
              <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
                {formatPeso(totalOwed)}
              </p>
              <p className="text-[15px] text-muted-foreground">
                owed by {owing.length} {plural('customer', owing.length)}
              </p>
              {overdue > 0 && (
                <p className="text-[15px] font-semibold text-destructive">{overdue} overdue</p>
              )}
            </section>
          )}
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {customers.data.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/customers/${c.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold">{c.name}</span>
                      {c.isBlocked && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
                          Blocked
                        </span>
                      )}
                      {isOverdue(c) && (
                        <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white">
                          Overdue
                        </span>
                      )}
                    </span>
                    {c.dueDate && c.balance > 0 && (
                      <span
                        className={
                          isOverdue(c)
                            ? 'block text-sm font-medium text-destructive'
                            : 'block text-sm text-muted-foreground'
                        }
                      >
                        {isOverdue(c) ? 'Was due' : 'Pay by'} {formatDate(c.dueDate)}
                      </span>
                    )}
                    {c.phone && (
                      <span className="block font-mono text-sm text-muted-foreground">
                        {c.phone}
                      </span>
                    )}
                    <LimitBar c={c} className="mt-2 max-w-64" />
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-lg font-bold tabular-nums">
                      {formatPeso(c.balance)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {c.balance < 0 ? 'store owes them' : 'owes'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {adding && <CustomerFormDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
