import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '@/api/client';
import type { FeeRule, WalletKind } from '@/api/types';
import { MoneyInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { WALLET_KIND_LABEL } from '@/lib/ewallet';
import { centavosToInput, formatPeso, parsePeso } from '@/lib/money';
import { useAfterEwalletChange, useFeeRules, useWallets } from './queries';

type TxnType = FeeRule['txnType'];
type Row = { upTo: string; fee: string };

const toRows = (rules: FeeRule[]): Row[] =>
  rules.map((r) => ({ upTo: centavosToInput(r.maxAmount), fee: centavosToInput(r.fee) }));

// One fee table ("GCash cash-in"). Each bracket starts one centavo after the one above ends,
// so the owner only types "up to" and "fee": there's no way to leave a gap or an overlap.
function FeeTable({ kind, type, rules }: { kind: WalletKind; type: TxnType; rules: FeeRule[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    rules.length ? toRows(rules) : [{ upTo: '500.00', fee: '10.00' }],
  );
  const [showErrors, setShowErrors] = useState(false);
  const afterChange = useAfterEwalletChange();
  const title = `${WALLET_KIND_LABEL[kind]} ${type === 'CASH_IN' ? 'cash-in' : 'cash-out'}`;
  const id = `${kind}-${type}`.toLowerCase();

  const parsed = rows.map((r) => ({ upTo: parsePeso(r.upTo), fee: parsePeso(r.fee) }));
  const rowError = (i: number) => {
    const { upTo, fee } = parsed[i];
    if (!upTo) return 'Enter the “up to” amount';
    if (fee === null) return 'Enter the fee (0 for free)';
    const prev = parsed[i - 1]?.upTo;
    if (i > 0 && prev && upTo <= prev) return `Must be more than ${formatPeso(prev)}`;
  };
  const firstError = rows.map((_, i) => rowError(i)).findIndex(Boolean);

  const save = useMutation({
    mutationFn: () =>
      api('/ewallet/fee-rules', {
        method: 'PUT',
        body: {
          walletKind: kind,
          txnType: type,
          brackets: parsed.map((p) => ({ upTo: p.upTo, fee: p.fee })),
        },
      }),
    onSuccess: () => {
      afterChange();
      setShowErrors(false);
    },
  });

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    save.reset(); // "Saved" no longer true
  }
  function addRow() {
    // Continue the pattern: ₱500 more, ₱10 more.
    const last = parsed.at(-1);
    setRows((rs) => [
      ...rs,
      {
        upTo: centavosToInput((last?.upTo ?? 0) + 50000),
        fee: centavosToInput((last?.fee ?? 0) + 1000),
      },
    ]);
    save.reset();
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (firstError === -1 && !save.isPending) save.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      <div className="px-5 pt-5 pb-3">
        <h2 id={`${id}-title`} className="text-base font-bold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {parsed.at(-1)?.upTo
            ? `Up to ${formatPeso(parsed.at(-1)!.upTo!)} per transaction. Bigger amounts are refused.`
            : 'Add the brackets, lowest first.'}
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,5.5rem)_1fr_1fr_2.75rem] items-center gap-x-2 gap-y-2 border-t px-5 py-4 text-sm">
        <span className="font-medium text-muted-foreground">From</span>
        <span className="font-medium text-muted-foreground">Up to</span>
        <span className="font-medium text-muted-foreground">Fee</span>
        <span />
        {rows.map((r, i) => {
          const bad = showErrors && Boolean(rowError(i));
          const from = i === 0 ? 1 : (parsed[i - 1].upTo ?? 0) + 1;
          return (
            <div key={i} className="contents">
              <span className="truncate font-mono tabular-nums">{formatPeso(from)}</span>
              <MoneyInput
                aria-label={`Row ${i + 1}: up to`}
                aria-invalid={bad || undefined}
                value={r.upTo}
                onChange={(e) => update(i, { upTo: e.target.value })}
              />
              <MoneyInput
                aria-label={`Row ${i + 1}: fee`}
                aria-invalid={bad || undefined}
                value={r.fee}
                onChange={(e) => update(i, { fee: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove row ${i + 1}`}
                disabled={rows.length === 1}
                onClick={() => {
                  setRows((rs) => rs.filter((_, j) => j !== i));
                  save.reset();
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 border-t px-5 py-4">
        {showErrors && firstError !== -1 && (
          <p role="alert" className="text-[15px] font-medium text-destructive">
            Row {firstError + 1}: {rowError(firstError)}
          </p>
        )}
        {save.isError && (
          <p role="alert" className="text-[15px] font-medium text-destructive">
            {save.error.message}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" onClick={addRow}>
            <Plus aria-hidden />
            Add bracket
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isSuccess && <Check aria-hidden />}
            {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved' : `Save ${title}`}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function FeeRulesPage() {
  const rules = useFeeRules();
  const wallets = useWallets();
  // A table for each kind of transfer wallet the store has (GCash, and Maya if added).
  const kinds = [
    ...new Set(wallets.data?.filter((w) => w.kind !== 'ELOAD').map((w) => w.kind) ?? []),
  ];

  return (
    <div className="grid gap-6">
      <Link
        to="/ewallet"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        GCash & Load
      </Link>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Fee rules</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          What the store charges per cash-in and cash-out. The fee is added automatically at the
          counter. Every change is recorded in the audit log.
        </p>
      </header>
      {rules.isPending || wallets.isPending ? (
        <p className="text-[15px] text-muted-foreground">Loading…</p>
      ) : rules.isError ? (
        <p role="alert">{rules.error.message}</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {kinds.flatMap((kind) =>
            (['CASH_IN', 'CASH_OUT'] as const).map((type) => (
              <FeeTable
                key={`${kind}-${type}`}
                kind={kind}
                type={type}
                rules={rules.data.filter((r) => r.walletKind === kind && r.txnType === type)}
              />
            )),
          )}
        </div>
      )}
    </div>
  );
}
