import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '@/api/client';
import type { EwalletTxn, EwalletTxnType, FeeQuote, FeeVia, Telco, Wallet } from '@/api/types';
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
import { MOBILE_RE, mobileDigits, REF_RE, TELCOS } from '@/lib/ewallet';
import { centavosToInput, formatPeso, formatPesoShort, parsePeso } from '@/lib/money';
import { useDebounced } from '@/lib/useDebounced';
import { newUuid } from '@/lib/uuid';
import { useAfterEwalletChange, useFeeQuote } from './queries';

type CounterType = 'CASH_IN' | 'CASH_OUT' | 'ELOAD';

// What each type means at the counter, in the Type dropdown.
const TYPE_OPTIONS: { value: CounterType; label: string }[] = [
  { value: 'CASH_IN', label: 'Cash-in (customer gives cash, you send GCash)' },
  { value: 'CASH_OUT', label: 'Cash-out (customer sends GCash, you give cash)' },
  { value: 'ELOAD', label: 'E-load (customer pays cash, you send load)' },
];
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
  const byGcash = q.feeVia === 'GCASH';
  const [headline, big] =
    type === 'CASH_IN' || type === 'ELOAD'
      ? ['Collect from the customer', q.cashChange]
      : type === 'CASH_OUT'
        ? ['Give the customer', -q.cashChange]
        : [type === 'TOP_UP' ? `Add to ${wallet.name}` : `Take out of ${wallet.name}`, amount];
  const feeLabel = byGcash ? `Fee (arrives in ${wallet.name})` : 'Fee (store earns, in cash)';
  return (
    <>
      <p className="text-sm font-semibold text-muted-foreground">{headline}</p>
      <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">{formatPeso(big)}</p>
      <dl className="mt-3 grid gap-1 text-sm">
        {type === 'CASH_IN' && (
          <>
            <Line label={`Send from ${wallet.name}`}>{formatPeso(amount)}</Line>
            <Line label={feeLabel}>{formatPeso(q.fee)}</Line>
          </>
        )}
        {type === 'CASH_OUT' && (
          <>
            <Line label={`Must arrive in ${wallet.name}`}>{formatPeso(q.walletChange)}</Line>
            <Line label={byGcash ? 'Fee (included above)' : 'Fee (kept from the cash)'}>
              {formatPeso(q.fee)}
            </Line>
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
    </>
  );
}

// The counter's "New transaction" (cash-in, cash-out, load: picked in the Type dropdown), and the
// owner's top-up / withdraw (walletId + type given, fixed).
export function TransactionDialog({
  type: initialType,
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
  const isOwner = user?.role === 'OWNER';
  // ONE key per opening of this dialog: a double tap, or Save again after the wifi dropped,
  // sends the SAME key, so the server records the transaction once at most.
  const [idempotencyKey] = useState(newUuid);
  const [type, setType] = useState<EwalletTxnType>(initialType);
  const isCounter = !walletId;
  const choicesFor = (t: EwalletTxnType) =>
    wallets.filter((w) =>
      walletId ? w.id === walletId : t === 'ELOAD' ? w.kind === 'ELOAD' : w.kind !== 'ELOAD',
    );
  const choices = choicesFor(type);
  const [accountId, setAccountId] = useState(choices[0]?.id);
  const wallet = choices.find((w) => w.id === accountId);
  const [amountText, setAmountText] = useState('');
  // null = use the fee rules. Only the owner can type another fee (a suki discount).
  const [feeText, setFeeText] = useState<string | null>(null);
  const [feeVia, setFeeVia] = useState<FeeVia>('CASH');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [ref, setRef] = useState('');
  const [telco, setTelco] = useState<Telco | ''>('');
  const [drawer, setDrawer] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const afterChange = useAfterEwalletChange();

  const hasFee = type === 'CASH_IN' || type === 'CASH_OUT';
  const amount = parsePeso(amountText);
  const ownFee = hasFee && isOwner && feeText !== null ? parsePeso(feeText) : null;
  const debounced = useDebounced(amount);
  const debouncedFee = useDebounced(ownFee);
  const quote = useFeeQuote(
    wallet && debounced
      ? {
          accountId: wallet.id,
          type,
          amount: debounced,
          ...((type === 'TOP_UP' || type === 'WITHDRAW') && { drawer }),
          ...(hasFee && { feeVia }),
          ...(debouncedFee !== null && { feeOverride: debouncedFee }),
        }
      : null,
  );
  // Only a quote for what is on screen NOW counts (not one for what was typed a moment ago).
  const q = debounced === amount && debouncedFee === ownFee ? quote.data : undefined;
  const short = q && wallet && wallet.balance + q.walletChange < 0;

  function changeType(t: CounterType) {
    setType(t);
    setAccountId(choicesFor(t)[0]?.id);
    setFeeText(null); // another type has other fee rules
  }

  const cleanNumber = number; // already digits only (mobileDigits)
  const cleanRef = ref.replace(/\s+/g, '');
  const needsNumber = type === 'CASH_IN' || type === 'ELOAD';
  const needsRef = type === 'CASH_IN' || type === 'CASH_OUT';
  const errors = {
    amount: !amount ? 'Enter the amount, like 500' : undefined,
    fee: feeText !== null && ownFee === null ? 'Enter the fee, like 10' : undefined,
    number:
      needsNumber && !cleanNumber
        ? 'Enter the mobile number'
        : cleanNumber && !MOBILE_RE.test(cleanNumber)
          ? 'Use 11 digits starting with 09, like 09171234567'
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
          // "The customer was told this fee": refused if the fee rules changed meanwhile.
          ...(ownFee === null ? { expectedFee: q!.fee } : { feeOverride: ownFee }),
          ...(hasFee && { feeVia }),
          ...(cleanNumber && { customerNumber: cleanNumber }),
          ...(name.trim() && type !== 'TOP_UP' && type !== 'WITHDRAW' && { customerName: name }),
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

  // The Service fee box: the fee rules' fee (or the load commission), read-only for the cashier.
  // The owner can type over it; the fee rules' amount stays visible underneath.
  const feeValue = feeText ?? (q ? centavosToInput(q.standardFee ?? q.fee) : '');
  const feeHint =
    type === 'ELOAD' ? (
      'Set in the load wallet’s settings'
    ) : !isOwner ? (
      'From the fee rules. Only the owner can change it.'
    ) : feeText !== null && q?.standardFee != null && ownFee !== q.standardFee ? (
      <>
        Fee rules say {formatPeso(q.standardFee)}.{' '}
        <button
          type="button"
          onClick={() => setFeeText(null)}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          Use that
        </button>
      </>
    ) : (
      'From the fee rules. You can change it.'
    );

  const title = isCounter
    ? 'New transaction'
    : type === 'TOP_UP'
      ? `Top up ${wallet?.name ?? ''}`
      : `Withdraw from ${wallet?.name ?? ''}`;

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isCounter
              ? 'Pick the type, then fill in what the customer and the receipt say.'
              : type === 'TOP_UP'
                ? 'Add money to this wallet.'
                : 'Take money out of this wallet.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          {isCounter && (
            <FormField id="ew-type" label="Type">
              <NativeSelect
                id="ew-type"
                value={type}
                onChange={(e) => changeType(e.target.value as CounterType)}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}

          {!wallet ? (
            <p role="alert">No wallet for this yet. The owner can add one.</p>
          ) : choices.length > 1 ? (
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
            <FormField id="ew-telco" label="Network" error={err('telco')}>
              <NativeSelect
                id="ew-telco"
                value={telco}
                onChange={(e) => setTelco(e.target.value as Telco)}
                {...fieldAria('ew-telco', err('telco'))}
              >
                <option value="" disabled>
                  Select the network
                </option>
                {TELCOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}

          <div
            className={
              type === 'TOP_UP' || type === 'WITHDRAW' ? 'grid' : 'grid gap-4 sm:grid-cols-2'
            }
          >
            <FormField id="ew-amount" label="Amount" error={err('amount')}>
              <MoneyInput
                id="ew-amount"
                autoFocus
                value={amountText}
                onChange={(e) => {
                  setAmountText(e.target.value);
                  setFeeText(null); // a new amount can fall in another fee bracket
                }}
                className="h-12 text-lg"
                {...fieldAria('ew-amount', err('amount'))}
              />
            </FormField>
            {type !== 'TOP_UP' && type !== 'WITHDRAW' && (
              <FormField
                id="ew-fee"
                label={type === 'ELOAD' ? 'Commission' : 'Service fee'}
                error={err('fee')}
                hint={feeHint}
              >
                <MoneyInput
                  id="ew-fee"
                  value={feeValue}
                  readOnly={!(isOwner && hasFee)}
                  placeholder={amount ? '…' : '0.00'}
                  onChange={(e) => setFeeText(e.target.value)}
                  className="h-12 text-lg read-only:bg-muted read-only:text-muted-foreground"
                  {...fieldAria('ew-fee', err('fee'), true)}
                />
              </FormField>
            )}
          </div>

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

          {hasFee && (
            <FormField
              id="ew-fee-via"
              label="Fee paid via"
              hint="How the customer paid your service fee, separate from the cash-in/cash-out amount itself."
            >
              <NativeSelect
                id="ew-fee-via"
                value={feeVia}
                onChange={(e) => setFeeVia(e.target.value as FeeVia)}
                aria-describedby="ew-fee-via-msg"
              >
                <option value="CASH">Cash (into the drawer)</option>
                <option value="GCASH">GCash (sent to the store’s wallet)</option>
              </NativeSelect>
            </FormField>
          )}

          {type !== 'TOP_UP' && type !== 'WITHDRAW' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="ew-number"
                label={
                  type === 'ELOAD'
                    ? 'Number to load'
                    : type === 'CASH_IN'
                      ? 'Their GCash number'
                      : 'Sender’s number (optional)'
                }
                error={err('number')}
              >
                <Input
                  id="ew-number"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={11}
                  value={number}
                  onChange={(e) => setNumber(mobileDigits(e.target.value))}
                  placeholder="09171234567"
                  className="h-12 font-mono tracking-wide"
                  {...fieldAria('ew-number', err('number'))}
                />
              </FormField>
              <FormField id="ew-name" label="Customer name (optional)">
                <Input
                  id="ew-name"
                  autoComplete="off"
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Walk-in customer"
                  className="h-12"
                />
              </FormField>
            </div>
          )}

          <FormField
            id="ew-ref"
            label={needsRef ? 'Reference number' : 'Reference number (optional)'}
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
              placeholder="e.g. 1234567890123"
              className="h-12 font-mono tracking-wide"
              {...fieldAria('ew-ref', err('ref'), needsRef)}
            />
          </FormField>

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
                    {isOwner ? 'Top it up first.' : 'Ask the owner to top it up.'}
                  </p>
                )}
              </>
            )}
          </section>

          {save.isError && (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              {save.error.message}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="h-14 text-lg"
            disabled={save.isPending || Boolean(short) || !wallet}
          >
            {save.isPending
              ? 'Saving…'
              : isCounter
                ? 'Log transaction'
                : type === 'TOP_UP'
                  ? 'Save top-up'
                  : 'Save withdrawal'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
