import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '@/api/client';
import type { Expense, ExpenseCategory } from '@/api/types';
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
import { EXPENSE_LABEL } from '@/lib/expenses';
import { parsePeso } from '@/lib/money';
import { useAfterDrawerChange } from './queries';

export function ExpenseDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  // Cashiers record only money that left their drawer; withdrawals are the owner's.
  const categories = (Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).filter(
    (c) => isOwner || c !== 'OWNER_WITHDRAWAL',
  );
  const [category, setCategory] = useState<ExpenseCategory>('SUPPLIES');
  const [amountText, setAmountText] = useState('');
  const [fromDrawer, setFromDrawer] = useState(true);
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const afterChange = useAfterDrawerChange();

  const amount = parsePeso(amountText);
  const amountError =
    amount === null || amount === 0 ? 'Enter the amount, like 45 or 45.50' : undefined;
  const noteError =
    category === 'OTHER' && note.trim().length < 3 ? 'Say what it was for' : undefined;

  const save = useMutation({
    mutationFn: () =>
      api<{ expense: Expense }>('/expenses', {
        method: 'POST',
        body: {
          category,
          amount,
          paidFromDrawer: isOwner ? fromDrawer : true,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      afterChange();
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!amountError && !noteError) save.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record expense</DialogTitle>
          <DialogDescription>
            {isOwner
              ? 'Money the store spent. If it came out of the drawer, closing will count it.'
              : 'Money you paid out of the drawer. Closing will count it.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <FormField id="expense-category" label="What for">
            <NativeSelect
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            id="expense-amount"
            label="Amount"
            error={showErrors ? amountError : undefined}
          >
            <MoneyInput
              id="expense-amount"
              autoFocus
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              {...fieldAria('expense-amount', showErrors ? amountError : undefined)}
            />
          </FormField>
          <FormField
            id="expense-note"
            label={category === 'OTHER' ? 'Note' : 'Note (optional)'}
            error={showErrors ? noteError : undefined}
          >
            <Input
              id="expense-note"
              maxLength={255}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ice and plastic bags"
              {...fieldAria('expense-note', showErrors ? noteError : undefined)}
            />
          </FormField>
          {isOwner && (
            <label className="flex items-start gap-3 text-[15px]">
              <input
                type="checkbox"
                checked={fromDrawer}
                onChange={(e) => setFromDrawer(e.target.checked)}
                className="mt-1 size-4.5 accent-primary"
              />
              <span>
                Paid with cash from the drawer
                <span className="block text-sm text-muted-foreground">
                  Untick for bills paid from the bank or your own pocket.
                </span>
              </span>
            </label>
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
              {save.isPending ? 'Saving…' : 'Save expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
