import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import type { Product } from '@/api/types';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRefreshProducts } from '@/features/products/queries';
import { fieldAria } from '@/lib/aria';
import { formatStock, plural } from '@/lib/stock';

const schema = z
  .object({
    type: z.enum(['SPOILAGE', 'ADJUSTMENT']),
    amount: z
      .number({ error: 'Enter a number' })
      .int('Whole numbers only')
      .min(0, 'Can’t be negative')
      .max(100_000_000),
    reason: z.string().trim().min(3, 'Write a short reason').max(255, 'Reason is too long'),
  })
  .refine((v) => v.type !== 'SPOILAGE' || v.amount >= 1, {
    path: ['amount'],
    message: 'Remove at least 1',
  });
type Values = z.infer<typeof schema>;

const TYPES = [
  { value: 'SPOILAGE', label: 'Remove spoiled', hint: 'Expired, damaged or lost items.' },
  {
    value: 'ADJUSTMENT',
    label: 'Correct the count',
    hint: 'You counted the shelf and it differs.',
  },
] as const;

export function AdjustStockDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const refreshProducts = useRefreshProducts();
  const single = product.units.find((u) => u.factor === 1)?.unitName ?? product.baseUnit;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'SPOILAGE', amount: 1, reason: '' },
  });
  const type = useWatch({ control, name: 'type' });
  const amount = useWatch({ control, name: 'amount' });
  const valid = Number.isInteger(amount) && amount >= 0;
  const after = !valid ? null : type === 'SPOILAGE' ? product.stockQty - amount : amount;

  const save = useMutation({
    mutationFn: (v: Values) =>
      api<{ product: Product }>('/inventory/adjust', {
        method: 'POST',
        body:
          v.type === 'SPOILAGE'
            ? { type: v.type, productId: product.id, qty: v.amount, reason: v.reason }
            : { type: v.type, productId: product.id, countedQty: v.amount, reason: v.reason },
      }),
    onSuccess: ({ product: updated }) => {
      refreshProducts(updated);
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {product.name} · now {formatStock(product.stockQty, product.units, product.baseUnit)}
          </DialogDescription>
        </DialogHeader>

        <form
          id="adjust-form"
          noValidate
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="grid gap-5"
        >
          <fieldset className="grid gap-2">
            <legend className="sr-only">Type of adjustment</legend>
            {TYPES.map((t) => (
              <label
                key={t.value}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  value={t.value}
                  className="mt-1 size-4 accent-primary"
                  {...register('type')}
                />
                <span>
                  <span className="block text-[15px] font-semibold">{t.label}</span>
                  <span className="block text-sm text-muted-foreground">{t.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <FormField
            id="amount"
            label={
              type === 'SPOILAGE'
                ? `How many ${plural(single, 2)} to remove`
                : `How many ${plural(single, 2)} did you count`
            }
            error={
              errors.amount?.message ??
              (after !== null && after < 0 ? `Only ${product.stockQty} in stock` : undefined)
            }
            hint={
              after !== null && (
                <>
                  Stock: {product.stockQty} →{' '}
                  <strong className="font-semibold text-foreground">{after}</strong>{' '}
                  {plural(single, after)}
                </>
              )
            }
          >
            <Input
              id="amount"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="font-mono tabular-nums"
              {...fieldAria('amount', errors.amount?.message, true)}
              {...register('amount', { valueAsNumber: true })}
            />
          </FormField>

          <FormField
            id="reason"
            label="Reason"
            error={errors.reason?.message}
            hint="Required. The owner reviews these in the audit log."
          >
            <Input
              id="reason"
              autoComplete="off"
              placeholder={type === 'SPOILAGE' ? 'e.g. Wet from the rain' : 'e.g. Monthly count'}
              {...fieldAria('reason', errors.reason?.message, true)}
              {...register('reason')}
            />
          </FormField>

          {save.error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {save.error.message}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="adjust-form"
            disabled={save.isPending || (after !== null && after < 0)}
          >
            {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            Save adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
