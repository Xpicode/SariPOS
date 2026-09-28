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
import { MOBILE_RE, parseBp } from '@/lib/ewallet';
import { centavosToInput, formatPeso, parsePeso } from '@/lib/money';
import { formatDate, todayInManila } from '@/lib/time';
import { interestPreview, percentLabel, reminderText } from '@/lib/utang';
import { newUuid } from '@/lib/uuid';
import { useAfterCustomerChange } from './queries';

function Footer({
  pending,
  label,
  onCancel,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
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

// Add a customer (anyone) or edit one. Owner: everything. Cashier: only the payment terms
// (due date and interest), the one thing they may change on an existing customer.
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
  const [dueDate, setDueDate] = useState(customer?.dueDate ?? '');
  const [interestText, setInterestText] = useState(
    customer?.interestBp ? percentLabel(customer.interestBp).replace('%', '') : '',
  );
  const [showErrors, setShowErrors] = useState(false);
  const termsOnly = editing && !isOwner;
  const today = todayInManila();

  const cleanPhone = phone.replace(/[\s-]/g, '');
  const limit = parsePeso(limitText);
  const interestBp = interestText.trim() ? parseBp(interestText) : 0;
  const dueChanged = dueDate !== (customer?.dueDate ?? '');
  const errors = {
    name: !termsOnly && name.trim().length < 2 ? 'Enter the customer’s name' : undefined,
    phone:
      !termsOnly && cleanPhone && !MOBILE_RE.test(cleanPhone)
        ? 'Use a mobile number like 0917 123 4567'
        : undefined,
    limit: isOwner && limit === null ? 'Enter the limit, like 500' : undefined,
    // A date already past is refused (the server checks too); an unchanged old date is kept.
    dueDate: dueDate && dueChanged && dueDate < today ? 'Pick today or a later date' : undefined,
    interest: interestBp === null ? 'Enter a percent from 0 to 50, like 5' : undefined,
  };
  const terms = {
    ...((!editing || dueChanged) && { dueDate: dueDate || (editing ? null : undefined) }),
    interestBp: interestBp ?? 0,
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api<{ customer: Customer }>(`/customers/${customer!.id}`, {
            method: 'PATCH',
            body: termsOnly
              ? terms
              : {
                  name: name.trim(),
                  phone: cleanPhone || null,
                  address: address.trim() || null,
                  creditLimit: limit,
                  isBlocked: blocked,
                  ...terms,
                },
          })
        : api<{ customer: Customer }>('/customers', {
            method: 'POST',
            body: {
              name: name.trim(),
              phone: cleanPhone || undefined,
              address: address.trim() || undefined,
              ...(isOwner && { creditLimit: limit }), // cashiers get the default ₱500
              ...terms,
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
          <DialogTitle>
            {termsOnly
              ? `Payment terms for ${customer!.name}`
              : editing
                ? `Edit ${customer!.name}`
                : 'Add customer'}
          </DialogTitle>
          <DialogDescription>
            {termsOnly
              ? 'When they promised to pay, and the interest if they’re late.'
              : isOwner
                ? 'Who may take items on utang, up to how much, and when they pay.'
                : 'New customers start with a ₱500 limit. The owner can change it.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          {!termsOnly && (
            <>
              <FormField id="c-name" label="Name" error={err('name')}>
                <Input
                  id="c-name"
                  autoFocus
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aling Nena"
                  {...fieldAria('c-name', err('name'))}
                />
              </FormField>
              <FormField id="c-phone" label="Mobile number (optional)" error={err('phone')}>
                <Input
                  id="c-phone"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0917 123 4567"
                  {...fieldAria('c-phone', err('phone'))}
                />
              </FormField>
              <FormField id="c-address" label="Address (optional)">
                <Input
                  id="c-address"
                  maxLength={255}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Purok 2, tabi ng simbahan"
                />
              </FormField>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="c-due"
              label="Pay by (optional)"
              error={err('dueDate')}
              hint="The date they promised to pay."
            >
              <Input
                id="c-due"
                type="date"
                min={today}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                {...fieldAria('c-due', err('dueDate'), true)}
              />
            </FormField>
            <FormField
              id="c-interest"
              label="Interest if late (%)"
              error={err('interest')}
              hint="Of what they owe. Blank = none."
            >
              <Input
                id="c-interest"
                inputMode="decimal"
                autoComplete="off"
                value={interestText}
                onChange={(e) => setInterestText(e.target.value)}
                placeholder="e.g. 5"
                {...fieldAria('c-interest', err('interest'), true)}
              />
            </FormField>
          </div>
          {isOwner && (
            <FormField
              id="c-limit"
              label="Utang limit"
              error={err('limit')}
              hint="0 = no utang at all."
            >
              <MoneyInput
                id="c-limit"
                value={limitText}
                onChange={(e) => setLimitText(e.target.value)}
                {...fieldAria('c-limit', err('limit'), true)}
              />
            </FormField>
          )}
          {isOwner && editing && (
            <label className="flex items-start gap-3 text-[15px]">
              <input
                type="checkbox"
                checked={blocked}
                onChange={(e) => setBlocked(e.target.checked)}
                className="mt-1 size-4.5 accent-primary"
              />
              <span>
                Block new utang
                <span className="block text-sm text-muted-foreground">
                  They can still pay what they owe.
                </span>
              </span>
            </label>
          )}
          {save.isError && (
            <p role="alert" className="text-[15px] font-medium text-destructive">
              {save.error.message}
            </p>
          )}
          <Footer
            pending={save.isPending}
            label={termsOnly ? 'Save terms' : editing ? 'Save changes' : 'Add customer'}
            onCancel={onClose}
          />
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
            <MoneyInput
              id="pay-amount"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-14 text-2xl"
              {...fieldAria('pay-amount', showErrors ? error : undefined)}
            />
          </FormField>
          <Button
            type="button"
            variant="outline"
            onClick={() => setText(centavosToInput(customer.balance))}
          >
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

// Owner only: add the agreed interest once the due date has passed. Shows exactly what will be
// added before anything is saved; the server recomputes it (and refuses a second one).
export function AddInterestDialog({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const afterChange = useAfterCustomerChange();
  const amount = interestPreview(customer.balance, customer.interestBp);
  const add = useMutation({
    mutationFn: () =>
      api<{ customer: Customer }>(`/customers/${customer.id}/interest`, { method: 'POST' }),
    onSuccess: () => {
      afterChange();
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !add.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add interest?</DialogTitle>
          <DialogDescription>
            {customer.name} was due {customer.dueDate && formatDate(customer.dueDate)}. This adds{' '}
            {percentLabel(customer.interestBp)} of what they owe to their utang, once for this due
            date.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-1 rounded-2xl bg-muted/70 px-5 py-4 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Owes now</dt>
            <dd className="font-mono tabular-nums">{formatPeso(customer.balance)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              Interest ({percentLabel(customer.interestBp)})
            </dt>
            <dd className="font-mono tabular-nums">+{formatPeso(amount)}</dd>
          </div>
          <div className="flex justify-between gap-4 font-semibold">
            <dt>Will owe</dt>
            <dd className="font-mono tabular-nums">{formatPeso(customer.balance + amount)}</dd>
          </div>
        </dl>
        {add.isError && (
          <p role="alert" className="text-[15px] font-medium text-destructive">
            {add.error.message}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending || amount <= 0}>
            {add.isPending ? 'Adding…' : `Add ${formatPeso(amount)} interest`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
