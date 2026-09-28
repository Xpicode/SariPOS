import { ArrowLeft, HandCoins, MessageSquareText, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { LedgerEntry } from '@/api/types';
import { useAuth } from '@/auth/context';
import { Button } from '@/components/ui/button';
import { formatPeso } from '@/lib/money';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { CustomerFormDialog, PaymentDialog, ReminderDialog } from './CustomerDialogs';
import { LimitBar } from './LimitBar';
import { useStatement } from './queries';

const TYPE_LABEL: Record<LedgerEntry['type'], string> = {
  CHARGE: 'Utang',
  PAYMENT: 'Payment',
  ADJUSTMENT: 'Adjustment',
};

// One passbook line: what happened, the change, and the balance right after it.
function Entry({ e }: { e: LedgerEntry }) {
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">
          {TYPE_LABEL[e.type]}
          {e.saleNo && (
            <>
              {' · '}
              <Link
                to={`/sales/${e.saleId}`}
                className="font-mono text-sm font-normal text-primary underline-offset-2 hover:underline"
              >
                {e.saleNo}
              </Link>
            </>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(e.createdAt)} · {e.createdBy}
          {e.note && e.note !== e.saleNo && ` · ${e.note}`}
        </p>
      </div>
      <div className="text-right font-mono tabular-nums">
        <p
          className={cn(
            'text-[15px] font-semibold',
            e.amount < 0 ? 'text-primary' : 'text-foreground',
          )}
        >
          {e.amount < 0 ? '−' : '+'}
          {formatPeso(Math.abs(e.amount))}
        </p>
        <p className="text-sm text-muted-foreground">bal {formatPeso(e.balance)}</p>
      </div>
    </li>
  );
}

export function CustomerPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const statement = useStatement(id);
  const [dialog, setDialog] = useState<'pay' | 'remind' | 'edit' | null>(null);

  const back = (
    <Link
      to="/customers"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Utang
    </Link>
  );
  if (statement.isPending)
    return (
      <div className="grid gap-6">
        {back}
        <p>Loading…</p>
      </div>
    );
  if (statement.isError) {
    return (
      <div className="grid gap-6">
        {back}
        <p role="alert">{statement.error.message}</p>
      </div>
    );
  }

  const { customer: c, entries } = statement.data;
  return (
    <div className="grid gap-6">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
            {c.name}
            {c.isBlocked && (
              <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-sm font-bold tracking-normal text-destructive">
                Blocked
              </span>
            )}
          </h1>
          {(c.phone || c.address) && (
            <p className="mt-1 text-[15px] text-muted-foreground">
              {c.phone && <span className="font-mono">{c.phone}</span>}
              {c.phone && c.address && ' · '}
              {c.address}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog('pay')} disabled={c.balance <= 0}>
            <HandCoins aria-hidden />
            Receive payment
          </Button>
          <Button variant="outline" onClick={() => setDialog('remind')} disabled={c.balance <= 0}>
            <MessageSquareText aria-hidden />
            Reminder
          </Button>
          {user?.role === 'OWNER' && (
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil aria-hidden />
              Edit
            </Button>
          )}
        </div>
      </header>

      <section
        aria-label="Balance"
        className="grid gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
      >
        <p className="text-sm font-semibold text-muted-foreground">
          {c.balance < 0 ? 'The store owes them' : 'Owes the store'}
        </p>
        <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">
          {formatPeso(Math.abs(c.balance))}
        </p>
        <LimitBar c={c} className="max-w-sm" />
      </section>

      <section
        aria-labelledby="statement-title"
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <h2 id="statement-title" className="px-5 pt-5 pb-2 text-base font-bold">
          Statement
        </h2>
        {entries.length === 0 ? (
          <p className="px-5 pb-5 text-[15px] text-muted-foreground">
            No utang yet. Choose Utang when paying at Sell.
          </p>
        ) : (
          <ul className="divide-y border-t">
            {entries.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ul>
        )}
      </section>

      {dialog === 'pay' && <PaymentDialog customer={c} onClose={() => setDialog(null)} />}
      {dialog === 'remind' && <ReminderDialog customer={c} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && <CustomerFormDialog customer={c} onClose={() => setDialog(null)} />}
    </div>
  );
}
