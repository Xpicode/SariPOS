import { useMutation } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/api/client';
import type { Customer, Sale } from '@/api/types';
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
import { CustomerPicker } from '@/features/customers/CustomerPicker';
import { fieldAria } from '@/lib/aria';
import { centavosToInput, formatPeso, formatPesoShort, parsePeso } from '@/lib/money';
import { plural } from '@/lib/stock';
import { newUuid } from '@/lib/uuid';
import { cn } from '@/lib/utils';
import { cartTotal, cashSuggestions, itemCount, type CartLine } from './cart';
import { PrintableReceipt, Receipt } from './Receipt';

// Same rule as the server. Spaces are removed first: GCash shows refs as "1009 876 543 210".
const GCASH_REF_RE = /^[0-9A-Za-z-]{4,40}$/;

// These mean "the cart is out of date": close, refresh the cart, tell the cashier.
const STALE = new Set([
  'PRICE_CHANGED',
  'INSUFFICIENT_STOCK',
  'ITEM_UNAVAILABLE',
  'NO_OPEN_SESSION',
]);

type Method = 'CASH' | 'GCASH' | 'UTANG';
const METHOD_LABEL: Record<Method, string> = { CASH: 'Cash', GCASH: 'GCash', UTANG: 'Utang' };

export function PayDialog({
  cart,
  onPaid,
  onStale,
  onClose,
}: {
  cart: CartLine[];
  onPaid: (sale: Sale) => void;
  onStale: (message: string) => void;
  onClose: () => void;
}) {
  // ONE key per opening of this dialog (it only exists while open). A double tap, or pressing
  // Pay again after the wifi dropped, resends the SAME key, so the server makes one sale at most.
  const [idempotencyKey] = useState(newUuid);
  const total = cartTotal(cart);
  const count = itemCount(cart);
  const [method, setMethod] = useState<Method>('CASH');
  const [cash, setCash] = useState('');
  const [ref, setRef] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  // A quick amount answers "how much did they hand over?". Move focus to Complete sale so
  // Enter finishes the sale (instead of pressing the amount button again).
  function quickCash(amount: number) {
    setCash(centavosToInput(amount));
    submitRef.current?.focus();
  }

  const tendered = parsePeso(cash);
  const cleanRef = ref.replace(/\s+/g, '');
  const cashError =
    tendered === null
      ? 'Enter the cash received, like 500 or 500.00'
      : tendered < total
        ? `That’s ${formatPeso(total - tendered)} short`
        : undefined;
  const refError = GCASH_REF_RE.test(cleanRef)
    ? undefined
    : 'Enter the reference number from the GCash receipt';
  const error =
    method === 'CASH'
      ? cashError
      : method === 'GCASH'
        ? refError
        : customer
          ? undefined
          : 'Pick the customer';

  const pay = useMutation({
    mutationFn: () =>
      api<{ sale: Sale; replayed: boolean }>('/sales', {
        method: 'POST',
        body: {
          idempotencyKey,
          // Only WHICH unit and HOW MANY. The server looks up every price itself.
          items: cart.map((l) => ({ productUnitId: l.unitId, qty: l.qty })),
          payment:
            method === 'CASH'
              ? { type: 'CASH', amountTendered: tendered }
              : method === 'GCASH'
                ? { type: 'GCASH', gcashRefNo: cleanRef }
                : { type: 'UTANG', customerId: customer?.id },
          expectedTotal: total, // "the customer saw this": refused if prices changed meanwhile
        },
      }),
    onSuccess: ({ sale }) => onPaid(sale),
    onError: (err) => {
      if (err instanceof ApiError && STALE.has(err.code)) onStale(err.message);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!error && !pay.isPending) pay.mutate();
  }

  return (
    // While saving, the dialog can't be closed: the answer (receipt) must have somewhere to go.
    <Dialog open onOpenChange={(open) => !open && !pay.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
          <DialogDescription>
            {count} {plural('item', count)}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl bg-muted/70 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-muted-foreground">Total</p>
          <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">
            {formatPeso(total)}
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <fieldset className="grid gap-2">
            <legend className="sr-only">Payment method</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'GCASH', 'UTANG'] as const).map((m) => (
                <label
                  key={m}
                  className="flex h-12 cursor-pointer items-center justify-center rounded-full border text-[15px] font-semibold transition-colors has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
                >
                  <input
                    type="radio"
                    name="method"
                    className="sr-only"
                    checked={method === m}
                    onChange={() => {
                      setMethod(m);
                      setShowErrors(false);
                    }}
                  />
                  {METHOD_LABEL[m]}
                </label>
              ))}
            </div>
          </fieldset>

          {method === 'CASH' ? (
            <>
              <FormField id="cash" label="Cash received" error={showErrors ? cashError : undefined}>
                <MoneyInput
                  id="cash"
                  autoFocus
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  className="h-14 text-2xl"
                  {...fieldAria('cash', showErrors ? cashError : undefined)}
                />
              </FormField>
              <div
                className="grid grid-cols-3 gap-2 sm:grid-cols-5"
                role="group"
                aria-label="Quick amounts"
              >
                <Button type="button" variant="outline" onClick={() => quickCash(total)}>
                  Exact
                </Button>
                {cashSuggestions(total).map((a) => (
                  <Button
                    key={a}
                    type="button"
                    variant="outline"
                    className="px-2 font-mono tabular-nums"
                    onClick={() => quickCash(a)}
                  >
                    {formatPesoShort(a)}
                  </Button>
                ))}
              </div>
              <div
                aria-live="polite"
                className="flex items-baseline justify-between rounded-2xl border px-5 py-3.5"
              >
                <span className="text-[15px] font-semibold">Change</span>
                <span
                  className={cn(
                    'font-mono text-3xl font-bold tabular-nums',
                    tendered !== null && tendered < total && 'text-destructive',
                  )}
                >
                  {tendered === null
                    ? '—'
                    : tendered < total
                      ? `−${formatPeso(total - tendered)}`
                      : formatPeso(tendered - total)}
                </span>
              </div>
            </>
          ) : method === 'UTANG' ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Who is taking it on utang?</p>
              <CustomerPicker total={total} selected={customer} onSelect={setCustomer} />
              {showErrors && !customer && (
                <p className="text-sm text-destructive">Pick the customer</p>
              )}
            </div>
          ) : (
            <FormField
              id="gcash-ref"
              label="GCash reference no."
              error={showErrors ? refError : undefined}
              hint={`Check that ${formatPeso(total)} arrived in the store’s GCash first.`}
            >
              <Input
                id="gcash-ref"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="1009 876 543 210"
                className="h-14 font-mono text-xl tracking-wide"
                {...fieldAria('gcash-ref', showErrors ? refError : undefined, true)}
              />
            </FormField>
          )}

          {pay.isError && !(pay.error instanceof ApiError && STALE.has(pay.error.code)) && (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              {pay.error.message}
              {pay.error instanceof ApiError && pay.error.status === 0 && (
                <> Pressing Complete sale again is safe: it won’t charge twice.</>
              )}
            </p>
          )}

          <Button
            ref={submitRef}
            type="submit"
            size="lg"
            className="h-14 text-lg"
            disabled={pay.isPending}
          >
            {pay.isPending ? 'Saving…' : 'Complete sale'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Right after paying: the change to hand over (biggest thing on screen), then the receipt.
export function SaleDoneDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sale complete</DialogTitle>
          <DialogDescription>{sale.saleNo}</DialogDescription>
        </DialogHeader>
        {sale.changeGiven !== null && (
          <div className="rounded-2xl bg-accent px-5 py-4 text-center text-accent-foreground">
            <p className="text-sm font-semibold">Give change</p>
            <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">
              {formatPeso(sale.changeGiven)}
            </p>
          </div>
        )}
        <div className="receipt-outline">
          <Receipt sale={sale} />
        </div>
        <PrintableReceipt sale={sale} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden />
            Print
          </Button>
          <Button autoFocus onClick={onClose}>
            New sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
