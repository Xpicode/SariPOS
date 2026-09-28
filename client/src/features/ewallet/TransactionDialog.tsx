import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/api/client';
import type { EwalletTxn, EwalletTxnType, FeeQuote, Telco, Wallet } from '@/api/types';
import { useAuth } from '@/auth/context';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { NativeSelect } from '@/components/NativeSelect';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fieldAria } from '@/lib/aria';
import { MOBILE_RE, REF_RE, TELCOS } from '@/lib/ewallet';
import { centavosToInput, formatPeso, formatPesoShort, parsePeso } from '@/lib/money';
import { useDebounced } from '@/lib/useDebounced';
import { newUuid } from '@/lib/uuid';
import { useAfterEwalletChange, useFeeQuote } from './queries';

const TITLE: Record<EwalletTxnType, string> = {
  CASH_IN: 'Cash-in',
  CASH_OUT: 'Cash-out',
  ELOAD: 'Load',
  TOP_UP: 'Top up',
  WITHDRAW: 'Withdraw',
};
const SAVE: Record<EwalletTxnType, string> = {
  CASH_IN: 'Save cash-in',
  CASH_OUT: 'Save cash-out',
  ELOAD: 'Save load',
  TOP_UP: 'Save top-up',
  WITHDRAW: 'Save withdrawal',
};
const HOW: Record<EwalletTxnType, string> = {
  CASH_IN: 'The customer gives cash; the store sends it to their GCash.',
  CASH_OUT: 'The customer sends money to the store’s GCash; the store gives cash.',
  ELOAD: 'The customer pays cash; the store sends load to their number.',
  TOP_UP: 'Add money to this wallet.',
  WITHDRAW: 'Take money out of this wallet.',
};
const LOAD_AMOUNTS = [10, 15, 20, 30, 50, 100].map((p) => p * 100);

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

// The one thing to do at the counter (collect / give), big, then how the two pockets change.
function Summary({
  type,
  amount,
  q,
  wallet,
  drawer,
}: {
  type: EwalletTxnType;
  amount: number;
  q: FeeQuote;
  wallet: Wallet;
  drawer: boolean;
}) {
  const [headline, big] =
    type === 'CASH_IN' || type === 'ELOAD'
      ? ['Collect from the customer', q.cashChange]
      : type === 'CASH_OUT'
        ? ['Give the customer', -q.cashChange]
        : [type === 'TOP_UP' ? `Add to ${wallet.name}` : `Take out of ${wallet.name}`, amount];
  return (
    <>
      <p className="text-sm font-semibold text-muted-foreground">{headline}</p>
      <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">{formatPeso(big)}</p>
      <dl className="mt-3 grid gap-1 text-sm">
        {type === 'CASH_IN' && (
          <>
            <Line label={`Send from ${wallet.name}`}>{formatPeso(-q.walletChange)}</Line>
            <Line label="Fee (store earns)">{formatPeso(q.fee)}</Line>
          </>
        )}
        {type === 'CASH_OUT' && (
          <>
            <Line label={`Must arrive in ${wallet.name}`}>{formatPeso(q.walletChange)}</Line>
            <Line label="Fee (store keeps)">{formatPeso(q.fee)}</Line>
          </>
        )}
        {type === 'ELOAD' && (
          <>
            <Line label="Load wallet pays">{formatPeso(-q.walletChange)}</Line>
            <Line label="Store earns">{formatPeso(q.fee)}</Line>
          </>
        )}
        {(type === 'TOP_UP' || type === 'WITHDRAW') && (
          <Line
            label={
              drawer
                ? type === 'TOP_UP'
                  ? 'Taken from the drawer'
                  : 'Put in the drawer'
                : 'Cash drawer'
            }
          >
            {drawer ? formatPeso(amount) : 'not touched'}
          </Line>
        )}
      </dl>
      {type === 'CASH_OUT' && (
        <p className="mt-2 text-sm text-muted-foreground">
          Or hand over {formatPeso(q.walletChange)} and collect the {formatPeso(q.fee)} fee in cash:
          the drawer ends up the same.
        </p>
      )}
    </>
  );
}

// Cash-in, cash-out and load at the counter; top-up and withdraw for the owner (walletId given).
export function TransactionDialog({
  type,
  wallets,
  walletId,
  onClose,
}: {
  type: EwalletTxnType;
  wallets: Wallet[];
  walletId?: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  // ONE key per opening of this dialog: a double tap, or Save again after the wifi dropped,
  // sends the SAME key, so the server records the transaction once at most.
  const [idempotencyKey] = useState(newUuid);
  const choices = wallets.filter((w) =>
    walletId ? w.id === walletId : type === 'ELOAD' ? w.kind === 'ELOAD' : w.kind !== 'ELOAD',
  );
  const [accountId, setAccountId] = useState(choices[0]?.id);
  const wallet = choices.find((w) => w.id === accountId);
  const [amountText, setAmountText] = useState('');
  const [number, setNumber] = useState('');
  const [ref, setRef] = useState('');
  const [telco, setTelco] = useState<Telco | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const afterChange = useAfterEwalletChange();

  const amount = parsePeso(amountText);
  const debounced = useDebounced(amount);
  const quote = useFeeQuote(
    wallet && debounced ? { accountId: wallet.id, type, amount: debounced, drawer } : null,
  );
  // Only a quote for the amount on screen NOW counts (not one for what was typed a moment ago).
  const q = debounced === amount ? quote.data : undefined;
  const short = q && wallet && wallet.balance + q.walletChange < 0;

  const cleanNumber = number.replace(/[\s-]/g, '');
  const cleanRef = ref.replace(/\s+/g, '');
  const needsNumber = type === 'CASH_IN' || type === 'ELOAD';
  const needsRef = type === 'CASH_IN' || type === 'CASH_OUT';
  const errors = {
    amount: !amount ? 'Enter the amount, like 500' : undefined,
    number:
      needsNumber && !cleanNumber
        ? 'Enter the mobile number'
        : cleanNumber && !MOBILE_RE.test(cleanNumber)
          ? 'Use a mobile number like 0917 123 4567'
          : undefined,
    ref:
      (needsRef && !cleanRef) || (cleanRef && !REF_RE.test(cleanRef))
        ? 'Enter the reference number from the receipt'
        : undefined,
    telco: type === 'ELOAD' && !telco ? 'Pick the network' : undefined,
  };
  const err = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);

  const save = useMutation({
    mutationFn: () =>
      api<{ transaction: EwalletTxn }>('/ewallet/transactions', {
        method: 'POST',
        body: {
          idempotencyKey,
          type,
          accountId,
          amount,
          expectedFee: q!.fee, // "the customer was told this fee": refused if it changed
          ...(cleanNumber && { customerNumber: cleanNumber }),
          ...(cleanRef && { referenceNo: cleanRef }),
          ...(type === 'ELOAD' && { telco }),
          ...((type === 'TOP_UP' || type === 'WITHDRAW') && { drawer }),
        },
      }),
    onSuccess: () => {
      afterChange();
      onClose();
    },
    onError: afterChange, // fee, balance or drawer changed: show the fresh numbers
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!Object.values(errors).some(Boolean) && q && !short && !save.isPending) save.mutate();
  }

  const amountField = (
    <FormField id="ew-amount" label="Amount" error={err('amount')}>
      <MoneyInput
        id="ew-amount"
        autoFocus={type !== 'ELOAD'}
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        className="h-14 text-2xl"
        {...fieldAria('ew-amount', err('amount'))}
      />
    </FormField>
  );
  const numberField = (
    <FormField
      id="ew-number"
      label={
        needsNumber
          ? type === 'ELOAD'
            ? 'Number to load'
            : 'Their GCash number'
          : 'Sender’s number (optional)'
      }
      error={err('number')}
    >
      <Input
        id="ew-number"
        autoFocus={type === 'ELOAD'}
        inputMode="tel"
        autoComplete="off"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="0917 123 4567"
        className="h-12 font-mono text-lg tracking-wide"
        {...fieldAria('ew-number', err('number'))}
      />
    </FormField>
  );
  const refField = (
    <FormField
      id="ew-ref"
      label={needsRef ? 'Reference no.' : 'Reference no. (optional)'}
      error={err('ref')}
      hint={
        type === 'CASH_IN'
          ? 'Send it in the GCash app first, then type the reference number.'
          : type === 'CASH_OUT'
            ? 'Check that the money arrived in the store’s GCash first.'
            : undefined
      }
    >
      <Input
        id="ew-ref"
        autoComplete="off"
        spellCheck={false}
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="1009 876 543 210"
        className="h-12 font-mono text-lg tracking-wide"
        {...fieldAria('ew-ref', err('ref'), type === 'CASH_IN' || type === 'CASH_OUT')}
      />
    </FormField>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE[type]}</DialogTitle>
          <DialogDescription>{HOW[type]}</DialogDescription>
        </DialogHeader>
        {!wallet ? (
          <p role="alert">No wallet for this yet.</p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-5">
            {choices.length > 1 ? (
              <FormField id="ew-wallet" label="Wallet">
                <NativeSelect
                  id="ew-wallet"
                  value={accountId}
                  onChange={(e) => setAccountId(Number(e.target.value))}
                >
                  {choices.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · {formatPeso(w.balance)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            ) : (
              <p className="-mt-2 text-sm text-muted-foreground">
                {wallet.name} has {formatPeso(wallet.balance)}
              </p>
            )}

            {type === 'ELOAD' && (
              <>
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-medium">Network</legend>
                  <div className="grid grid-cols-5 gap-2">
                    {TELCOS.map((t) => (
                      <label
                        key={t.value}
                        className="flex h-11 cursor-pointer items-center justify-center rounded-full border text-sm font-semibold transition-colors has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
                      >
                        <input
                          type="radio"
                          name="telco"
                          className="sr-only"
                          checked={telco === t.value}
                          onChange={() => setTelco(t.value)}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                  {err('telco') && <p className="text-sm text-destructive">{err('telco')}</p>}
                </fieldset>
                {numberField}
              </>
            )}

            {amountField}
            {type === 'ELOAD' && (
              <div className="grid grid-cols-6 gap-2" role="group" aria-label="Load amounts">
                {LOAD_AMOUNTS.map((a) => (
                  <Button
                    key={a}
                    type="button"
                    variant="outline"
                    className="px-1 font-mono tabular-nums"
                    onClick={() => setAmountText(centavosToInput(a))}
                  >
                    {formatPesoShort(a)}
                  </Button>
                ))}
              </div>
            )}
            {(type === 'TOP_UP' || type === 'WITHDRAW') && (
              <label className="flex items-start gap-3 text-[15px]">
                <input
                  type="checkbox"
                  checked={drawer}
                  onChange={(e) => setDrawer(e.target.checked)}
                  className="mt-1 size-4.5 accent-primary"
                />
                <span>
                  {type === 'TOP_UP'
                    ? 'Paid with cash from the drawer'
                    : 'The cash goes into the drawer'}
                  <span className="block text-sm text-muted-foreground">
                    Leave unticked for a bank transfer or the owner’s own money.
                  </span>
                </span>
              </label>
            )}

            <section
              aria-label="Summary"
              aria-live="polite"
              className="rounded-2xl bg-muted/70 px-5 py-4"
            >
              {quote.isError && debounced === amount ? (
                <p className="text-[15px] font-medium text-destructive">{quote.error.message}</p>
              ) : !q || !wallet ? (
                <p className="text-[15px] text-muted-foreground">
                  {amount ? 'Checking the fee…' : 'Type the amount to see the fee.'}
                </p>
              ) : (
                <>
                  <Summary type={type} amount={amount!} q={q} wallet={wallet} drawer={drawer} />
                  {short && (
                    <p className="mt-2 text-[15px] font-medium text-destructive">
                      {wallet.name} only has {formatPeso(wallet.balance)}.{' '}
                      {user?.role === 'OWNER' ? 'Top it up first.' : 'Ask the owner to top it up.'}
                    </p>
                  )}
                </>
              )}
            </section>

            {type === 'CASH_IN' && numberField}
            {type !== 'ELOAD' && type !== 'TOP_UP' && type !== 'WITHDRAW' && refField}
            {type === 'CASH_OUT' && numberField}
            {(type === 'ELOAD' || type === 'TOP_UP' || type === 'WITHDRAW') && refField}

            {save.isError && (
              <p role="alert" className="text-[15px] font-medium text-destructive">
                {save.error.message}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="h-14 text-lg"
              disabled={save.isPending || Boolean(short)}
            >
              {save.isPending ? 'Saving…' : SAVE[type]}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
