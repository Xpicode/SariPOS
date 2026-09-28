import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import type { Product } from '@/api/types';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRefreshProducts } from '@/features/products/queries';
import { fieldAria } from '@/lib/aria';
import { centavosToInput, parsePeso } from '@/lib/money';
import { formatStock, plural } from '@/lib/stock';
import { todayInManila } from '@/lib/time';

const schema = z.object({
  unitId: z.string().min(1, 'Pick a unit'),
  qty: z
    .number({ error: 'Enter how many arrived' })
    .int('Whole numbers only')
    .min(1, 'Enter how many arrived')
    .max(10_000, 'That’s too many at once'),
  cost: z
    .string()
    .refine((v) => v.trim() === '' || parsePeso(v) !== null, 'Enter an amount like 150.00'),
  expiryDate: z.string(),
  note: z.string().max(255, 'Note is too long'),
});
type Values = z.infer<typeof schema>;

export type StockInResult = { product: Product; addedBaseQty: number };

export function StockInForm({
  product,
  initialUnitId,
  onDone,
  submitLabel = 'Add to stock',
}: {
  product: Product;
  initialUnitId?: number;
  onDone: (result: StockInResult) => void;
  submitLabel?: string;
}) {
  const refreshProducts = useRefreshProducts();
  // Deliveries usually come in the biggest unit (ream, box), so default to that.
  const biggest = [...product.units].sort((a, b) => b.factor - a.factor)[0];
  const startUnit = product.units.find((u) => u.id === initialUnitId) ?? biggest;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      unitId: String(startUnit.id),
      qty: 1,
      cost: startUnit.costCentavos === undefined ? '' : centavosToInput(startUnit.costCentavos),
      expiryDate: '',
      note: '',
    },
  });
  const unitId = useWatch({ control, name: 'unitId' });
  const qty = useWatch({ control, name: 'qty' });
  const unit = product.units.find((u) => String(u.id) === unitId) ?? startUnit;
  const baseQty = Number.isInteger(qty) && qty > 0 ? qty * unit.factor : 0;
  const single = product.units.find((u) => u.factor === 1)?.unitName ?? product.baseUnit;

  const save = useMutation({
    mutationFn: (v: Values) =>
      api<StockInResult>('/inventory/stock-in', {
        method: 'POST',
        body: {
          productUnitId: Number(v.unitId),
          qty: v.qty,
          costCentavos: v.cost.trim() ? parsePeso(v.cost) : undefined,
          expiryDate: v.expiryDate || undefined,
          note: v.note.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      refreshProducts(result.product);
      onDone(result);
    },
  });

  return (
    <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">What arrived</legend>
        <div className="flex flex-wrap gap-2">
          {product.units.map((u) => (
            <label
              key={u.id}
              className="flex h-11 min-w-20 cursor-pointer items-center justify-center rounded-full border px-4 text-[15px] font-semibold transition-colors has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
            >
              <input type="radio" value={u.id} className="sr-only" {...register('unitId')} />
              {u.unitName}
            </label>
          ))}
        </div>
      </fieldset>

      <FormField
        id="qty"
        label={`How many ${plural(unit.unitName, 2)}`}
        error={errors.qty?.message}
        hint={
          baseQty > 0 && (
            <>
              = {baseQty} {plural(single, baseQty)}. Stock after:{' '}
              <strong className="font-semibold text-foreground">
                {formatStock(product.stockQty + baseQty, product.units, product.baseUnit)}
              </strong>
            </>
          )
        }
      >
        <Input
          id="qty"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          className="font-mono tabular-nums"
          {...fieldAria('qty', errors.qty?.message, baseQty > 0)}
          {...register('qty', { valueAsNumber: true })}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        {unit.costCentavos !== undefined && (
          <FormField
            id="cost"
            label={`Cost per ${unit.unitName}`}
            error={errors.cost?.message}
            hint="Optional. Kept with this delivery."
          >
            <MoneyInput
              id="cost"
              {...fieldAria('cost', errors.cost?.message, true)}
              {...register('cost')}
            />
          </FormField>
        )}
        <FormField
          id="expiryDate"
          label="Expiry date"
          hint="Optional. Leave blank if it doesn’t expire."
        >
          <Input
            id="expiryDate"
            type="date"
            min={todayInManila()}
            {...fieldAria('expiryDate', undefined, true)}
            {...register('expiryDate')}
          />
        </FormField>
      </div>

      <FormField
        id="note"
        label="Note"
        error={errors.note?.message}
        hint="Optional, e.g. supplier or receipt number."
      >
        <Input
          id="note"
          autoComplete="off"
          {...fieldAria('note', errors.note?.message, true)}
          {...register('note')}
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

      <Button type="submit" size="lg" disabled={save.isPending}>
        {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </form>
  );
}
