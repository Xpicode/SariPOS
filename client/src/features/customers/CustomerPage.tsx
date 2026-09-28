import {
  ArrowLeft,
  CalendarClock,
  HandCoins,
  MessageSquareText,
  Pencil,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Customer, LedgerEntry } from '@/api/types';
import { useAuth } from '@/auth/context';
import { Button } from '@/components/ui/button';
import { formatPeso } from '@/lib/money';
import { formatDate, formatDateTime, todayInManila } from '@/lib/time';
import { daysLate, interestPreview, isOverdue, percentLabel } from '@/lib/utang';
import { cn } from '@/lib/utils';
import {
  AddInterestDialog,
  CustomerFormDialog,
  PaymentDialog,
  ReminderDialog,
} from './CustomerDialogs';
import { LimitBar } from './LimitBar';
import { useStatement } from './queries';

const TYPE_LABEL: Record<LedgerEntry['type'], string> = {
  CHARGE: 'Utang',
  PAYMENT: 'Payment',
  ADJUSTMENT: 'Adjustment',
  INTEREST: 'Interest',
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

// Red, at the top of the page: they're late. What happens next depends on the terms: the owner can
// add the agreed interest (once per due date), and anyone can agree a new date with them.
function OverdueWarning({
  c,
  isOwner,
  onAddInterest,
  onNewDate,
}: {
  c: Customer;
  isOwner: boolean;
  onAddInterest: () => void;
  onNewDate: () => void;
}) {
  const late = daysLate(c.dueDate!, todayInManila());
  const interest = interestPreview(c.balance, c.interestBp);
  const pct = percentLabel(c.interestBp);
  return (
    <section
      role="alert"
      aria-label="Overdue"
      className="grid gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-5 sm:flex sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-semibold text-destructive">
            Overdue: was due {formatDate(c.dueDate!)} ({late} {late === 1 ? 'day' : 'days'} ago)
          </p>
          <p className="text-sm text-foreground/80">
            {c.interestBp === 0
              ? 'No interest is set for this customer.'
              : c.interestCharged
                ? `The ${pct} interest for this due date is already added. Agree on a new date.`
                : isOwner
                  ? `${pct} interest on ${formatPeso(c.balance)} = ${formatPeso(interest)}.`
                  : `The owner can add ${pct} interest (${formatPeso(interest)}).`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {isOwner && c.interestBp > 0 && !c.interestCharged && interest > 0 && (
          <Button variant="destructive" onClick={onAddInterest}>
            Add {formatPeso(interest)} interest
          </Button>
        )}
        <Button variant="outline" onClick={onNewDate}>
          <CalendarClock aria-hidden />
          New due date
        </Button>
      </div>
    </section>
  );
}

export function CustomerPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const statement = useStatement(id);
  const [dialog, setDialog] = useState<'pay' | 'remind' | 'edit' | 'interest' | null>(null);
  const isOwner = user?.role === 'OWNER';

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
          <Button variant="outline" onClick={() => setDialog('edit')}>
            {isOwner ? <Pencil aria-hidden /> : <CalendarClock aria-hidden />}
            {isOwner ? 'Edit' : 'Payment terms'}
          </Button>
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
        <p className="text-sm text-muted-foreground">
          {c.dueDate ? `Pay by ${formatDate(c.dueDate)}` : 'No due date'}
          {c.interestBp > 0 && ` · ${percentLabel(c.interestBp)} interest if late`}
        </p>
      </section>

      {isOverdue(c) && c.dueDate && (
        <OverdueWarning
          c={c}
          isOwner={isOwner}
          onAddInterest={() => setDialog('interest')}
          onNewDate={() => setDialog('edit')}
        />
      )}

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
      {dialog === 'interest' && <AddInterestDialog customer={c} onClose={() => setDialog(null)} />}
    </div>
  );
}
