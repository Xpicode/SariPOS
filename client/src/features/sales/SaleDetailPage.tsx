import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError } from '@/api/client';
import type { Sale } from '@/api/types';
import { useAuth } from '@/auth/context';
import { FormField } from '@/components/FormField';
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
import { formatPeso } from '@/lib/money';
import { useAfterSale, useSale } from './queries';
import { PrintableReceipt, Receipt } from './Receipt';

function VoidDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { user } = useAuth();
  const needsPin = user?.role !== 'OWNER'; // the owner approves with their own login
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const afterSale = useAfterSale();

  const reasonError =
    reason.trim().length < 3 ? 'Write a short reason (at least 3 characters)' : undefined;
  const pinError =
    needsPin && !/^\d{4,6}$/.test(pin) ? 'The owner types their 4–6 digit PIN' : undefined;

  const voidSale = useMutation({
    mutationFn: () =>
      api<{ sale: Sale }>(`/sales/${sale.id}/void`, {
        method: 'POST',
        body: { reason: reason.trim(), ...(needsPin && { pin }) },
      }),
    onSuccess: ({ sale: updated }) => {
      afterSale(updated);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'PIN_INVALID') setPin(''); // type it fresh
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!reasonError && !pinError) voidSale.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !voidSale.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void {sale.saleNo}?</DialogTitle>
          <DialogDescription>
            {formatPeso(sale.total)}. The items go back to stock. The receipt stays in the records,
            marked VOIDED.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <FormField id="void-reason" label="Reason" error={showErrors ? reasonError : undefined}>
            <Input
              id="void-reason"
              autoFocus
              maxLength={255}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Wrong item scanned"
              {...fieldAria('void-reason', showErrors ? reasonError : undefined)}
            />
          </FormField>
          {needsPin && (
            <FormField
              id="owner-pin"
              label="Owner PIN"
              error={showErrors ? pinError : undefined}
              hint="Hand the phone to the owner to type it."
            >
              <Input
                id="owner-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off" // never let the browser save the owner's PIN on this device
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-40 font-mono tracking-[0.3em]"
                {...fieldAria('owner-pin', showErrors ? pinError : undefined, true)}
              />
            </FormField>
          )}
          {voidSale.isError && (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              {voidSale.error.message}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={voidSale.isPending}>
              Keep sale
            </Button>
            <Button type="submit" variant="destructive" disabled={voidSale.isPending}>
              {voidSale.isPending ? 'Voiding…' : 'Void sale'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaleDetailPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const sale = useSale(id);
  const [voiding, setVoiding] = useState(false);

  const back = (
    <Link
      to="/sales"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Sales
    </Link>
  );

  if (sale.isPending) {
    return (
      <div className="grid gap-6">
        {back}
        <p>Loading…</p>
      </div>
    );
  }
  if (sale.isError) {
    return (
      <div className="grid gap-6">
        {back}
        <p role="alert" className="text-[15px]">
          {sale.error.message}
        </p>
      </div>
    );
  }

  const s = sale.data;
  return (
    <div className="grid gap-6">
      {back}
      <div className="grid gap-6 md:grid-cols-[minmax(0,380px)_1fr] md:items-start">
        <div className="receipt-outline">
          <Receipt sale={s} />
        </div>
        <PrintableReceipt sale={s} />

        <div className="grid content-start gap-3 sm:max-w-xs">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden />
            Print receipt
          </Button>
          {s.status === 'COMPLETED' && (
            <>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setVoiding(true)}
              >
                <Ban aria-hidden />
                Void sale
              </Button>
              <p className="text-sm text-muted-foreground">
                {user?.role === 'OWNER'
                  ? 'Only sales from the open shift can be voided.'
                  : 'Voiding needs the owner’s PIN.'}
              </p>
            </>
          )}
        </div>
      </div>
      {voiding && <VoidDialog sale={s} onClose={() => setVoiding(false)} />}
    </div>
  );
}
