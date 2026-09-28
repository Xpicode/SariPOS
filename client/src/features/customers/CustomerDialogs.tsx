import { useMutation } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '@/api/client';
import type { Customer } from '@/api/types';
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
import { fieldAria } from '@/lib/aria';
import { centavosToInput, formatPeso, parsePeso } from '@/lib/money';
import { reminderText } from '@/lib/utang';
import { newUuid } from '@/lib/uuid';
import { useAfterCustomerChange } from './queries';

const PHONE_RE = /^(09|\+?639)\d{9}$/; // same rule as the server, before it normalizes

function Footer({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  );
}

// Add a customer (anyone) or edit one (owner: limit, block, contact details).
export function CustomerFormDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer;
  onClose: () => void;
  onSaved?: (c: Customer) => void;
}) {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const editing = Boolean(customer);
  const afterChange = useAfterCustomerChange();
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [limitText, setLimitText] = useState(centavosToInput(customer?.creditLimit ?? 50000));
  const [blocked, setBlocked] = useState(customer?.isBlocked ?? false);
  const [showErrors, setShowErrors] = useState(false);

  const cleanPhone = phone.replace(/[\s-]/g, '');
  const limit = parsePeso(limitText);
  const errors = {
    name: name.trim().length < 2 ? 'Enter the customer’s name' : undefined,
    phone: cleanPhone && !PHONE_RE.test(cleanPhone) ? 'Use a mobile number like 0917 123 4567' : undefined,
    limit: isOwner && limit === null ? 'Enter the limit, like 500' : undefined,
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api<{ customer: Customer }>(`/customers/${customer!.id}`, {
            method: 'PATCH',
            body: {
              name: name.trim(),
              phone: cleanPhone || null,
              address: address.trim() || null,
              creditLimit: limit,
              isBlocked: blocked,
            },
          })
        : api<{ customer: Customer }>('/customers', {
            method: 'POST',
            body: {
              name: name.trim(),
              phone: cleanPhone || undefined,
              address: address.trim() || undefined,
              ...(isOwner && { creditLimit: limit }), // cashiers get the default ₱500
            },
          }),
    onSuccess: ({ customer: saved }) => {
      afterChange();
      onSaved?.(saved);
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!Object.values(errors).some(Boolean)) save.mutate();
  }
  const err = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${customer!.name}` : 'Add customer'}</DialogTitle>
          <DialogDescription>
            {isOwner
              ? 'Who may take items on utang, and up to how much.'
              : 'New customers start with a ₱500 limit. The owner can change it.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <FormField id="c-name" label="Name" error={err('name')}>
            <Input id="c-name" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Aling Nena" {...fieldAria('c-name', err('name'))} />
          </FormField>
          <FormField id="c-phone" label="Mobile number (optional)" error={err('phone')}>
            <Input id="c-phone" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0917 123 4567" {...fieldAria('c-phone', err('phone'))} />
          </FormField>
          <FormField id="c-address" label="Address (optional)">
            <Input id="c-address" maxLength={255} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Purok 2, tabi ng simbahan" />
          </FormField>
          {isOwner && (
            <FormField id="c-limit" label="Utang limit" error={err('limit')} hint="0 = no utang at all.">
              <MoneyInput id="c-limit" value={limitText} onChange={(e) => setLimitText(e.target.value)} {...fieldAria('c-limit', err('limit'), true)} />
            </FormField>
          )}
          {isOwner && editing && (
            <label className="flex items-start gap-3 text-[15px]">
              <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} className="mt-1 size-4.5 accent-primary" />
              <span>
                Block new utang
                <span className="block text-sm text-muted-foreground">They can still pay what they owe.</span>
              </span>
            </label>
          )}
          {save.isError && (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              {save.error.message}
            </p>
          )}
          <Footer pending={save.isPending} label={editing ? 'Save changes' : 'Add customer'} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Receive a full or partial payment. Cash goes into the open drawer.
export function PaymentDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [idempotencyKey] = useState(newUuid); // one per opening: a double tap records ONE payment
  const [text, setText] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const afterChange = useAfterCustomerChange();
  const amount = parsePeso(text);
  const error =
    amount === null || amount === 0
      ? 'Enter the amount, like 100'
      : amount > customer.balance
        ? `${customer.name} only owes ${formatPeso(customer.balance)}`
        : undefined;

  const pay = useMutation({
    mutationFn: () =>
      api<{ customer: Customer }>(`/customers/${customer.id}/payments`, {
        method: 'POST',
        body: { idempotencyKey, amount },
      }),
    onSuccess: () => {
      afterChange();
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!error && !pay.isPending) pay.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pay.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive payment</DialogTitle>
          <DialogDescription>
            {customer.name} owes {formatPeso(customer.balance)}. The cash goes in the drawer.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <FormField id="pay-amount" label="Amount received" error={showErrors ? error : undefined}>
            <MoneyInput id="pay-amount" autoFocus value={text} onChange={(e) => setText(e.target.value)} className="h-14 text-2xl" {...fieldAria('pay-amount', showErrors ? error : undefined)} />
          </FormField>
          <Button type="button" variant="outline" onClick={() => setText(centavosToInput(customer.balance))}>
            Pays it all: {formatPeso(customer.balance)}
          </Button>
          {pay.isError && (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              {pay.error.message}
            </p>
          )}
          <Footer pending={pay.isPending} label="Save payment" onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// A polite reminder to paste into Messenger / SMS. The clipboard only works on https/localhost,
// so the text is also shown, ready to select by hand.
export function ReminderDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const text = reminderText(customer.name, customer.balance);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      document.getElementById('reminder-text')?.focus(); // select it by hand instead
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reminder for {customer.name}</DialogTitle>
          <DialogDescription>Copy it, then paste it in Messenger or SMS.</DialogDescription>
        </DialogHeader>
        <textarea
          id="reminder-text"
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
          rows={4}
          className="w-full resize-none rounded-lg border bg-card p-3.5 text-[15px] leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <Button onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy message'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
