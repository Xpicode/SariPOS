import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import type { Category, Product } from '@/api/types';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { NativeSelect } from '@/components/NativeSelect';
import { ScanButton } from '@/components/scanner/ScanButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldAria } from '@/lib/aria';
import { centavosToInput, formatPeso, parsePeso } from '@/lib/money';
import { plural } from '@/lib/stock';
import { BARCODE_RE, useCategories, useProduct, useRefreshProducts } from './queries';

// Mirrors the server's products.schema.ts; the server checks everything again.
const peso = z
  .string()
  .refine((v) => parsePeso(v) !== null, 'Enter an amount like 12.50')
  .refine((v) => (parsePeso(v) ?? 0) <= 100_000_000, 'Amount is too large');

const unitRow = z.object({
  id: z.number().optional(),
  unitName: z.string().trim().toLowerCase().min(1, 'Name this unit').max(30, 'Name is too long'),
  factor: z
    .number({ error: 'Enter a number' })
    .int('Whole numbers only')
    .min(1, 'At least 1')
    .max(10_000, 'Too large'),
  barcode: z
    .string()
    .trim()
    .refine((v) => v === '' || BARCODE_RE.test(v), 'Use 3–50 letters, numbers or -'),
  cost: peso,
  price: peso,
});

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a product name').max(120, 'Name is too long'),
    categoryId: z.string(), // '' = no category
    baseUnit: z.string().trim().toLowerCase().min(1, 'Enter the base unit').max(20),
    reorderLevel: z
      .number({ error: 'Enter a number' })
      .int('Whole numbers only')
      .min(0, 'Can’t be negative')
      .max(1_000_000),
    isActive: z.boolean(),
    defaultIndex: z.string(), // which row is the default selling unit
    units: z.array(unitRow).min(1, 'Add at least one unit').max(10, 'At most 10 units'),
  })
  .superRefine((v, ctx) => {
    // Point at the exact row, so the owner sees which one to fix.
    const names = new Set<string>();
    const codes = new Set<string>();
    v.units.forEach((u, i) => {
      const n = u.unitName.trim().toLowerCase();
      if (names.has(n)) {
        ctx.addIssue({
          code: 'custom',
          path: ['units', i, 'unitName'],
          message: 'Two units can’t have the same name',
        });
      }
      names.add(n);
      const b = u.barcode.trim();
      if (b && codes.has(b)) {
        ctx.addIssue({
          code: 'custom',
          path: ['units', i, 'barcode'],
          message: 'Barcode already used above',
        });
      }
      if (b) codes.add(b);
    });
  });
type Values = z.infer<typeof schema>;

const emptyUnit = { unitName: '', factor: 1, barcode: '', cost: '', price: '' };

function toFormValues(p?: Product): Values {
  if (!p) {
    return {
      name: '',
      categoryId: '',
      baseUnit: 'pc',
      reorderLevel: 5,
      isActive: true,
      defaultIndex: '0',
      units: [{ ...emptyUnit, unitName: 'pc' }],
    };
  }
  return {
    name: p.name,
    categoryId: p.categoryId ? String(p.categoryId) : '',
    baseUnit: p.baseUnit,
    reorderLevel: p.reorderLevel,
    isActive: p.isActive,
    defaultIndex: String(
      Math.max(
        0,
        p.units.findIndex((u) => u.isDefault),
      ),
    ),
    units: p.units.map((u) => ({
      id: u.id,
      unitName: u.unitName,
      factor: u.factor,
      barcode: u.barcode ?? '',
      cost: centavosToInput(u.costCentavos ?? 0),
      price: centavosToInput(u.priceCentavos),
    })),
  };
}

// "Margin ₱1.50 (15%)" under each unit, updated as the owner types.
function MarginHint({ control, index }: { control: Control<Values>; index: number }) {
  const [cost, price] = useWatch({
    control,
    name: [`units.${index}.cost`, `units.${index}.price`],
  });
  const c = parsePeso(cost ?? '');
  const p = parsePeso(price ?? '');
  if (c === null || p === null || p === 0) return null;
  const m = p - c;
  return (
    <span className={m < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
      {m < 0 ? 'Selling at a loss: ' : 'Margin '}
      {formatPeso(Math.abs(m))} ({Math.round((m / p) * 100)}%)
    </span>
  );
}

function CategoryPicker({
  register,
  onCreated,
}: {
  register: ReturnType<typeof useForm<Values>>['register'];
  onCreated: (c: Category) => void;
}) {
  const categories = useCategories();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api<{ category: Category }>('/categories', { method: 'POST', body: { name: name.trim() } }),
    onSuccess: ({ category }) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      onCreated(category);
      setAdding(false);
      setName('');
    },
  });

  if (adding) {
    return (
      <div className="grid gap-2">
        <div className="flex gap-2">
          <Input
            autoFocus
            aria-label="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault(); // don't submit the product form
                if (name.trim()) create.mutate();
              }
            }}
          />
          <Button
            type="button"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <NativeSelect id="categoryId" {...register('categoryId')}>
          <option value="">No category</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="button" variant="outline" onClick={() => setAdding(true)}>
        <Plus aria-hidden />
        New
      </Button>
    </div>
  );
}

function ProductForm({ product }: { product?: Product }) {
  const navigate = useNavigate();
  const refreshProducts = useRefreshProducts();
  const isEdit = Boolean(product);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toFormValues(product) });
  const { fields, append, remove } = useFieldArray({ control, name: 'units' });
  const baseUnit = useWatch({ control, name: 'baseUnit' }) || 'base unit';

  // Keep the "default" radio on the same unit when a row above it is removed.
  function removeUnit(index: number) {
    const def = Number(getValues('defaultIndex'));
    remove(index);
    if (index === def) setValue('defaultIndex', '0');
    else if (index < def) setValue('defaultIndex', String(def - 1));
  }

  const save = useMutation({
    mutationFn: (v: Values) => {
      const common = {
        name: v.name,
        categoryId: v.categoryId ? Number(v.categoryId) : null,
        reorderLevel: v.reorderLevel,
        units: v.units.map((u, i) => ({
          ...(u.id !== undefined && { id: u.id }),
          unitName: u.unitName,
          factor: u.factor,
          barcode: u.barcode.trim() || null,
          costCentavos: parsePeso(u.cost)!,
          priceCentavos: parsePeso(u.price)!,
          isDefault: String(i) === v.defaultIndex,
        })),
      };
      return product
        ? api<{ product: Product }>(`/products/${product.id}`, {
            method: 'PATCH',
            body: { ...common, isActive: v.isActive },
          })
        : api<{ product: Product }>('/products', {
            method: 'POST',
            body: { ...common, baseUnit: v.baseUnit },
          });
    },
    onSuccess: ({ product: saved }) => {
      refreshProducts(saved);
      navigate(`/products/${saved.id}`, { replace: true });
    },
  });

  const unitErrors = errors.units;

  return (
    <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-6">
      <section className="grid gap-5 rounded-2xl border bg-card shadow-sm p-5 sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <FormField id="name" label="Product name" error={errors.name?.message}>
            <Input
              id="name"
              autoComplete="off"
              placeholder="e.g. Lucky Me Pancit Canton 60g"
              {...fieldAria('name', errors.name?.message)}
              {...register('name')}
            />
          </FormField>
        </div>

        <FormField id="categoryId" label="Category">
          <CategoryPicker
            register={register}
            onCreated={(c) => setValue('categoryId', String(c.id))}
          />
        </FormField>

        <FormField
          id="baseUnit"
          label="Base unit"
          error={errors.baseUnit?.message}
          hint={
            isEdit
              ? 'Stock is counted in this unit, so it can’t change.'
              : 'The smallest piece you sell or count: pc, stick, sachet, g.'
          }
        >
          <Input
            id="baseUnit"
            list="base-units"
            autoCapitalize="none"
            readOnly={isEdit}
            className="read-only:bg-muted read-only:text-muted-foreground"
            {...fieldAria('baseUnit', errors.baseUnit?.message, true)}
            {...register('baseUnit')}
          />
          <datalist id="base-units">
            {['pc', 'stick', 'sachet', 'bottle', 'can', 'pack', 'g', 'ml'].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </FormField>

        <FormField
          id="reorderLevel"
          label={`Low-stock warning at (${plural(baseUnit, 2)})`}
          error={errors.reorderLevel?.message}
          hint="The product is marked Low stock at or below this number."
        >
          <Input
            id="reorderLevel"
            type="number"
            inputMode="numeric"
            min={0}
            className="font-mono tabular-nums"
            {...fieldAria('reorderLevel', errors.reorderLevel?.message, true)}
            {...register('reorderLevel', { valueAsNumber: true })}
          />
        </FormField>

        {isEdit && (
          <label className="flex items-start gap-3 self-end rounded-2xl border p-3.5">
            <input
              type="checkbox"
              className="mt-0.5 size-5 accent-primary"
              {...register('isActive')}
            />
            <span>
              <span className="block text-[15px] font-semibold">Available for sale</span>
              <span className="block text-sm text-muted-foreground">
                Turn off to hide it from the counter. Its history stays.
              </span>
            </span>
          </label>
        )}
      </section>

      <section aria-labelledby="units-title" className="grid gap-4">
        <div>
          <h2 id="units-title" className="text-lg font-bold">
            Selling units
          </h2>
          <p className="text-sm text-muted-foreground">
            Tingi: sell the same product by the {baseUnit}, by the pack, by the box…
          </p>
        </div>

        {fields.map((field, i) => {
          const e = unitErrors?.[i];
          const f = (name: string) => `units-${i}-${name}`;
          return (
            <fieldset
              key={field.id}
              className="grid gap-4 rounded-2xl border bg-card shadow-sm p-5 sm:grid-cols-2"
            >
              <legend className="sr-only">Unit {i + 1}</legend>
              <FormField id={f('unitName')} label="Unit name" error={e?.unitName?.message}>
                <Input
                  id={f('unitName')}
                  autoCapitalize="none"
                  placeholder="pack"
                  {...fieldAria(f('unitName'), e?.unitName?.message)}
                  {...register(`units.${i}.unitName`)}
                />
              </FormField>
              <FormField
                id={f('factor')}
                label={`How many ${plural(baseUnit, 2)} in one`}
                error={e?.factor?.message}
              >
                <Input
                  id={f('factor')}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="font-mono tabular-nums"
                  {...fieldAria(f('factor'), e?.factor?.message)}
                  {...register(`units.${i}.factor`, { valueAsNumber: true })}
                />
              </FormField>
              <FormField id={f('price')} label="Selling price" error={e?.price?.message}>
                <MoneyInput
                  id={f('price')}
                  {...fieldAria(f('price'), e?.price?.message)}
                  {...register(`units.${i}.price`)}
                />
              </FormField>
              <FormField
                id={f('cost')}
                label="Cost"
                error={e?.cost?.message}
                hint={<MarginHint control={control} index={i} />}
              >
                <MoneyInput
                  id={f('cost')}
                  {...fieldAria(f('cost'), e?.cost?.message, true)}
                  {...register(`units.${i}.cost`)}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField id={f('barcode')} label="Barcode (optional)" error={e?.barcode?.message}>
                  <div className="flex gap-2">
                    <Input
                      id={f('barcode')}
                      autoComplete="off"
                      inputMode="numeric"
                      className="font-mono"
                      {...fieldAria(f('barcode'), e?.barcode?.message)}
                      {...register(`units.${i}.barcode`)}
                    />
                    <ScanButton
                      label={`Scan barcode for unit ${i + 1}`}
                      onScan={(code) =>
                        setValue(`units.${i}.barcode`, code, { shouldValidate: true })
                      }
                    />
                  </div>
                </FormField>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <label className="flex items-center gap-2.5 text-[15px] font-semibold">
                  <input
                    type="radio"
                    value={i}
                    className="size-5 accent-primary"
                    {...register('defaultIndex')}
                  />
                  Default when selling
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeUnit(i)}
                  disabled={fields.length === 1}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 aria-hidden />
                  Remove unit
                </Button>
              </div>
            </fieldset>
          );
        })}

        {unitErrors?.root?.message && (
          <p className="text-sm text-destructive">{unitErrors.root.message}</p>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => append(emptyUnit)}
          disabled={fields.length >= 10}
          className="justify-self-start"
        >
          <Plus aria-hidden />
          Add unit
        </Button>
      </section>

      {save.error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {save.error.message}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
        <Button variant="outline" asChild>
          <Link to={product ? `/products/${product.id}` : '/products'}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {product ? 'Save changes' : 'Add product'}
        </Button>
      </div>
    </form>
  );
}

export function ProductFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const editing = id !== null;
  const product = useProduct(id ?? 0, editing);

  return (
    <div className="grid gap-6">
      <Link
        to={editing ? `/products/${id}` : '/products'}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {editing ? 'Back to product' : 'Products'}
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">
        {editing ? `Edit ${product.data?.name ?? 'product'}` : 'Add product'}
      </h1>
      {!editing ? (
        <ProductForm />
      ) : product.isPending ? (
        <p>Loading…</p>
      ) : product.isError ? (
        <p role="alert">{product.error.message}</p>
      ) : (
        <ProductForm key={product.data.id} product={product.data} />
      )}
    </div>
  );
}
