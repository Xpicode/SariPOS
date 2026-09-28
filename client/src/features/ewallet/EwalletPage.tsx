import { useMutation } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Plus, Settings2, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '@/api/client';
import type { EwalletTxn, EwalletTxnType, Wallet } from '@/api/types';
import { useAuth } from '@/auth/context';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentSession } from '@/features/sales/queries';
import { fieldAria } from '@/lib/aria';
import {
  formatBp,
  formatMobile,
  parseBp,
  TELCOS,
  TXN_LABEL,
  breakdown,
  WALLET_KIND_LABEL,
} from '@/lib/ewallet';
import { centavosToInput, formatPeso, parsePeso } from '@/lib/money';
import { formatClock, formatDate, todayInManila } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useAfterEwalletChange, useEwalletTxns, useWallets } from './queries';
import { TransactionDialog } from './TransactionDialog';

const signed = (n: number) => `${n < 0 ? '−' : '+'}${formatPeso(Math.abs(n))}`;
const telcoLabel = (v: string) => TELCOS.find((t) => t.value === v)?.label ?? v;

function WalletCard({
  w,
  isOwner,
  onAction,
  onSettings,
}: {
  w: Wallet;
  isOwner: boolean;
  onAction: (type: EwalletTxnType) => void;
  onSettings: () => void;
}) {
  return (
    <article
      aria-label={w.name}
      className={cn(
        'grid gap-3 rounded-2xl border bg-card p-5 shadow-sm',
        w.isLow && 'border-warning/60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold">{w.name}</h2>
          <p className="text-sm text-muted-foreground">
            {WALLET_KIND_LABEL[w.kind]}
            {w.kind === 'ELOAD' && ` · earns ${formatBp(w.commissionBp)} per load`}
          </p>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettings}
            aria-label={`${w.name} settings`}
          >
            <Settings2 className="size-[18px]" />
          </Button>
        )}
      </div>
      <p className="font-mono text-3xl font-bold tracking-tight tabular-nums">
        {formatPeso(w.balance)}
      </p>
      {w.isLow ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
          <TriangleAlert className="size-4" aria-hidden />
          Low: below {formatPeso(w.lowBalanceAlert)}. Top it up soon.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {w.kind === 'ELOAD' ? 'Should match the load app.' : 'Should match the GCash app.'}
        </p>
      )}
      {isOwner && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onAction('TOP_UP')}>
            <ArrowDownToLine aria-hidden />
            Top up
          </Button>
          <Button variant="outline" onClick={() => onAction('WITHDRAW')}>
            <ArrowUpFromLine aria-hidden />
            Withdraw
          </Button>
        </div>
      )}
    </article>
  );
}

// Low-balance alert (both wallets) and load commission (load wallet). Owner only.
function WalletSettingsDialog({ w, onClose }: { w: Wallet; onClose: () => void }) {
  const [alertText, setAlertText] = useState(centavosToInput(w.lowBalanceAlert));
  const [pctText, setPctText] = useState((w.commissionBp / 100).toFixed(2));
  const [showErrors, setShowErrors] = useState(false);
  const afterChange = useAfterEwalletChange();
  const alert = parsePeso(alertText);
  const bp = parseBp(pctText);
  const errors = {
    alert: alert === null ? 'Enter an amount, like 1000' : undefined,
    pct: w.kind === 'ELOAD' && bp === null ? 'Enter a percent from 0 to 50, like 3' : undefined,
  };

  const save = useMutation({
    mutationFn: () =>
      api(`/ewallet/accounts/${w.id}`, {
        method: 'PATCH',
        body: { lowBalanceAlert: alert, ...(w.kind === 'ELOAD' && { commissionBp: bp }) },
      }),
    onSuccess: () => {
      afterChange();
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!errors.alert && !errors.pct && !save.isPending) save.mutate();
  }
  const err = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{w.name}</DialogTitle>
          <DialogDescription>
            Wallet settings. Changes are recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <FormField
            id="w-alert"
            label="Warn when the balance is below"
            error={err('alert')}
            hint="So there’s always enough for the next cash-in or load."
          >
            <MoneyInput
              id="w-alert"
              autoFocus
              value={alertText}
              onChange={(e) => setAlertText(e.target.value)}
              {...fieldAria('w-alert', err('alert'), true)}
            />
          </FormField>
          {w.kind === 'ELOAD' && (
            <FormField
              id="w-pct"
              label="Commission per load (%)"
              error={err('pct')}
              hint="What the load app keeps off: 3% means ₱100 of load costs the store ₱97."
            >
              <Input
                id="w-pct"
                inputMode="decimal"
                autoComplete="off"
                value={pctText}
                onChange={(e) => setPctText(e.target.value)}
                className="font-mono tabular-nums"
                {...fieldAria('w-pct', err('pct'), true)}
              />
            </FormField>
          )}
          {save.isError && (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              {save.error.message}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// What the counter did with cash for one transaction, in plain words.
function cashLine(t: EwalletTxn): [string, number] | null {
  if (t.cashChange === 0) return null;
  if (t.type === 'TOP_UP') return ['From the drawer', -t.cashChange];
  if (t.type === 'WITHDRAW') return ['Into the drawer', t.cashChange];
  return t.cashChange > 0 ? ['Collected', t.cashChange] : ['Given', -t.cashChange];
}

// One row: what happened on the left; the breakdown on the right: the amount, the fee the store
// earned, and the cash that changed hands (Cash-in ₱1,000 + fee ₱20 = collected ₱1,020).
function TxnRow({ t, isOwner }: { t: EwalletTxn; isOwner: boolean }) {
  const cash = cashLine(t);
  const hasFee = t.type === 'CASH_IN' || t.type === 'CASH_OUT' || t.type === 'ELOAD';
  return (
    <li className="grid gap-x-6 gap-y-2 px-5 py-3.5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">
          {TXN_LABEL[t.type]}
          {t.telco && <span className="font-normal"> · {telcoLabel(t.telco)}</span>}
        </p>
        <p className="text-sm break-words text-muted-foreground">
          {formatClock(t.createdAt)} · {t.accountName}
          {t.customerName && ` · ${t.customerName}`}
          {t.customerNumber && (
            <>
              {' · '}
              <span className="font-mono">{formatMobile(t.customerNumber)}</span>
            </>
          )}
          {t.referenceNo && (
            <>
              {' · ref '}
              <span className="font-mono">{t.referenceNo}</span>
            </>
          )}
          {isOwner && ` · ${t.createdBy}`}
        </p>
      </div>
      <dl className="grid min-w-52 grid-cols-[auto_1fr] gap-x-4 text-sm">
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="text-right font-mono tabular-nums">{formatPeso(t.amount)}</dd>
        {hasFee && (
          <>
            <dt className="text-muted-foreground">
              {t.type === 'ELOAD' ? 'Commission' : 'Fee'}
              {t.feeVia === 'GCASH' && ' (GCash)'}
            </dt>
            <dd className="text-right font-mono tabular-nums">{formatPeso(t.fee)}</dd>
          </>
        )}
        {cash ? (
          <>
            <dt className="font-semibold">{cash[0]}</dt>
            <dd
              className={cn(
                'text-right font-mono font-semibold tabular-nums',
                cash[0] === 'Given' && 'text-destructive',
              )}
            >
              {formatPeso(cash[1])} cash
            </dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Cash</dt>
            <dd className="text-right text-muted-foreground">not touched</dd>
          </>
        )}
        <dt className="text-muted-foreground">Wallet</dt>
        <dd className="text-right font-mono text-muted-foreground tabular-nums">
          {signed(t.walletChange)}
        </dd>
      </dl>
    </li>
  );
}

// Totals per type for the day (or shift): "Cash-in · 3 · ₱2,500.00 · fees ₱50.00".
function Breakdown({ txns }: { txns: EwalletTxn[] }) {
  const { rows, totalFee } = breakdown(txns);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Breakdown by type</caption>
      <thead>
        <tr className="border-y bg-muted/50 text-left text-muted-foreground">
          <th scope="col" className="px-5 py-2 font-medium">
            Type
          </th>
          <th scope="col" className="px-2 py-2 text-right font-medium">
            Count
          </th>
          <th scope="col" className="px-2 py-2 text-right font-medium">
            Amount
          </th>
          <th scope="col" className="px-5 py-2 text-right font-medium">
            Fees earned
          </th>
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {rows.map((r) => (
          <tr key={r.type} className="border-b">
            <th scope="row" className="px-5 py-2 text-left font-sans font-medium">
              {TXN_LABEL[r.type]}
            </th>
            <td className="px-2 py-2 text-right">{r.count}</td>
            <td className="px-2 py-2 text-right">{formatPeso(r.amount)}</td>
            <td className="px-5 py-2 text-right">
              {r.type === 'TOP_UP' || r.type === 'WITHDRAW' ? '—' : formatPeso(r.fee)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={3} className="px-5 py-2.5 text-left font-semibold">
            Total fees and commission
          </th>
          <td className="px-5 py-2.5 text-right font-mono font-semibold tabular-nums">
            {formatPeso(totalFee)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function EwalletPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [params, setParams] = useSearchParams();
  const today = todayInManila();
  const day = params.get('day') ?? today;
  const wallets = useWallets();
  const session = useCurrentSession();
  const txns = useEwalletTxns(isOwner ? day : undefined); // cashiers: always the open shift
  const [dialog, setDialog] = useState<{ type: EwalletTxnType; walletId?: number } | null>(null);
  const [settings, setSettings] = useState<Wallet | null>(null);

  const drawerClosed = session.data === null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">GCash & Load</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Cash-in, cash-out and load. The fee is added for you.
          </p>
        </div>
        {isOwner && (
          <Button variant="outline" asChild>
            <Link to="/ewallet/fees">Fee rules</Link>
          </Button>
        )}
      </header>

      {/* Wide screen: wallets + actions on the left, the list on the right. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {wallets.isPending ? (
          <p className="text-[15px] text-muted-foreground">Loading…</p>
        ) : wallets.isError ? (
          <p role="alert">{wallets.error.message}</p>
        ) : (
          <div className="grid content-start gap-6">
            <section aria-label="Wallets" className="grid gap-4 sm:grid-cols-2">
              {wallets.data.map((w) => (
                <WalletCard
                  key={w.id}
                  w={w}
                  isOwner={isOwner}
                  onAction={(type) => setDialog({ type, walletId: w.id })}
                  onSettings={() => setSettings(w)}
                />
              ))}
            </section>

            <section aria-label="New transaction" className="grid gap-3">
              {drawerClosed && (
                <p className="rounded-2xl border border-dashed px-5 py-4 text-[15px] text-muted-foreground">
                  Open the{' '}
                  <Link
                    to="/drawer"
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    cash drawer
                  </Link>{' '}
                  first: cash-in, cash-out and load all move cash.
                </p>
              )}
              <Button
                size="lg"
                disabled={drawerClosed}
                onClick={() => setDialog({ type: 'CASH_IN' })}
                className="h-14 text-lg"
              >
                <Plus aria-hidden />
                New transaction
              </Button>
            </section>
          </div>
        )}

        <section
          aria-labelledby="txns-title"
          className="overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <h2 id="txns-title" className="text-base font-bold">
                {isOwner ? (day === today ? 'Today' : formatDate(day)) : 'This shift'}
              </h2>
            </div>
            {isOwner && (
              <div className="grid gap-1.5">
                <Label htmlFor="ew-day">Day</Label>
                <Input
                  id="ew-day"
                  type="date"
                  max={today}
                  value={day}
                  onChange={(e) => setParams(e.target.value ? { day: e.target.value } : {})}
                  className="w-44"
                />
              </div>
            )}
          </div>
          {txns.isPending ? (
            <p className="px-5 pb-5 text-[15px] text-muted-foreground">Loading…</p>
          ) : txns.isError ? (
            <p role="alert" className="px-5 pb-5">
              {txns.error.message}
            </p>
          ) : txns.data.length === 0 ? (
            <p className="px-5 pb-5 text-[15px] text-muted-foreground">
              Nothing yet. Transactions appear here after you save them.
            </p>
          ) : (
            <>
              <Breakdown txns={txns.data} />
              <ul className="divide-y border-t" aria-label="Transactions">
                {txns.data.map((t) => (
                  <TxnRow key={t.id} t={t} isOwner={isOwner} />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {dialog && wallets.data && (
        <TransactionDialog
          type={dialog.type}
          wallets={wallets.data}
          walletId={dialog.walletId}
          onClose={() => setDialog(null)}
        />
      )}
      {settings && <WalletSettingsDialog w={settings} onClose={() => setSettings(null)} />}
    </div>
  );
}
