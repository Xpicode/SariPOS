import { ArrowLeft, PackagePlus, Pencil, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Movement, MovementType, Product, Unit } from '@/api/types';
import { useAuth } from '@/auth/context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AdjustStockDialog } from '@/features/inventory/AdjustStockDialog';
import { StockInForm } from '@/features/inventory/StockInForm';
import { formatPeso } from '@/lib/money';
import { formatStock, plural } from '@/lib/stock';
import { formatDate, formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useMovements, useProduct } from './queries';
import { StockBadge } from './StockBadge';

const MOVEMENT_LABEL: Record<MovementType, string> = {
  STOCK_IN: 'Stock in',
  SALE: 'Sale',
  VOID_RETURN: 'Void return',
  ADJUSTMENT: 'Recount',
  SPOILAGE: 'Spoilage',
};

function margin(cost: number, price: number) {
  if (price === 0) return '—';
  const pct = Math.round(((price - cost) / price) * 100);
  return `${formatPeso(price - cost)} (${pct}%)`;
}

function UnitName({ u, single }: { u: Unit; single: string }) {
  return (
    <>
      <span className="font-semibold">{u.unitName}</span>
      {u.isDefault && (
        <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
          Default
        </span>
      )}
      {u.factor > 1 && (
        <span className="block text-sm text-muted-foreground">
          {u.factor} {plural(single, u.factor)}
        </span>
      )}
    </>
  );
}

function UnitsTable({ product, isOwner }: { product: Product; isOwner: boolean }) {
  const single = product.units.find((u) => u.factor === 1)?.unitName ?? product.baseUnit;
  return (
    <>
      {/* Phones: one stacked row per unit, so no price is ever cut off at the edge. */}
      <ul className="divide-y border-t sm:hidden">
        {product.units.map((u) => (
          <li key={u.id} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-4">
              <p className="min-w-0 text-[15px]">
                <UnitName u={u} single={single} />
              </p>
              <p className="shrink-0 font-mono text-[15px] font-semibold tabular-nums">
                {formatPeso(u.priceCentavos)}
              </p>
            </div>
            {(isOwner || u.barcode) && (
              <p className="mt-1 font-mono text-sm break-all text-muted-foreground tabular-nums">
                {isOwner &&
                  `Cost ${formatPeso(u.costCentavos ?? 0)} · margin ${margin(u.costCentavos ?? 0, u.priceCentavos)}`}
                {isOwner && u.barcode && <br />}
                {u.barcode}
              </p>
            )}
          </li>
        ))}
      </ul>
      <TableView product={product} isOwner={isOwner} single={single} />
    </>
  );
}

function TableView({
  product,
  isOwner,
  single,
}: {
  product: Product;
  isOwner: boolean;
  single: string;
}) {
  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-left text-[15px]">
        <thead className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <tr className="border-b">
            <th className="px-5 py-3 font-semibold">Unit</th>
            <th className="px-5 py-3 font-semibold">Price</th>
            {isOwner && <th className="px-5 py-3 font-semibold">Cost</th>}
            {isOwner && <th className="px-5 py-3 font-semibold">Margin</th>}
            <th className="px-5 py-3 font-semibold">Barcode</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {product.units.map((u) => (
            <tr key={u.id}>
              <td className="px-5 py-3.5">
                <UnitName u={u} single={single} />
              </td>
              <td className="px-5 py-3.5 font-mono tabular-nums">{formatPeso(u.priceCentavos)}</td>
              {isOwner && (
                <td className="px-5 py-3.5 font-mono tabular-nums">
                  {formatPeso(u.costCentavos ?? 0)}
                </td>
              )}
              {isOwner && (
                <td className="px-5 py-3.5 font-mono text-sm tabular-nums">
                  {margin(u.costCentavos ?? 0, u.priceCentavos)}
                </td>
              )}
              <td className="px-5 py-3.5 font-mono text-sm text-muted-foreground">
                {u.barcode ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementRow({ m, single }: { m: Movement; single: string }) {
  const n = Math.abs(m.qtyChange);
  return (
    <li className="flex items-start gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{MOVEMENT_LABEL[m.type]}</p>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(m.createdAt)} · {m.createdBy}
          {m.expiryDate && ` · expires ${formatDate(m.expiryDate)}`}
        </p>
        {m.note && <p className="mt-1 text-sm break-words">{m.note}</p>}
      </div>
      <p
        className={cn(
          'shrink-0 font-mono text-[15px] font-semibold tabular-nums',
          m.qtyChange > 0 ? 'text-primary' : 'text-destructive',
        )}
      >
        {m.qtyChange > 0 ? '+' : '−'}
        {n} {plural(single, n)}
      </p>
    </li>
  );
}

export function ProductDetailPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const product = useProduct(id);
  const movements = useMovements(id, isOwner);
  const [dialog, setDialog] = useState<'stock-in' | 'adjust' | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const back = (
    <Link
      to="/products"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Products
    </Link>
  );

  if (product.isPending)
    return (
      <div className="grid gap-6">
        {back}
        <p>Loading…</p>
      </div>
    );
  if (product.isError) {
    return (
      <div className="grid gap-6">
        {back}
        <p role="alert" className="text-[15px]">
          {product.error.message}
        </p>
      </div>
    );
  }

  const p = product.data;
  const single = p.units.find((u) => u.factor === 1)?.unitName ?? p.baseUnit;

  return (
    <div className="grid gap-6">
      {back}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">
            {p.categoryName ?? 'No category'}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight break-words">{p.name}</h1>
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setAdded(null);
                setDialog('stock-in');
              }}
              disabled={!p.isActive}
            >
              <PackagePlus aria-hidden />
              Stock in
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAdded(null); // an old "Added …" message would contradict the new stock
                setDialog('adjust');
              }}
            >
              <SlidersHorizontal aria-hidden />
              Adjust
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/products/${p.id}/edit`}>
                <Pencil aria-hidden />
                Edit
              </Link>
            </Button>
          </div>
        )}
      </header>

      {added && (
        <p
          role="status"
          className="rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-foreground"
        >
          {added}
        </p>
      )}

      <section
        aria-labelledby="stock-title"
        className="rounded-2xl border bg-card shadow-sm p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="stock-title" className="text-sm font-semibold text-muted-foreground">
            In stock
          </h2>
          <StockBadge product={p} />
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          {formatStock(p.stockQty, p.units, p.baseUnit)}
        </p>
        <p className="mt-1 font-mono text-sm text-muted-foreground tabular-nums">
          {p.stockQty} {plural(single, p.stockQty)} · reorder at {p.reorderLevel}
        </p>
      </section>

      <section
        aria-labelledby="units-title"
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <h2 id="units-title" className="px-5 pt-5 pb-2 text-base font-bold">
          Prices
        </h2>
        <UnitsTable product={p} isOwner={isOwner} />
      </section>

      {isOwner && (
        <section
          aria-labelledby="history-title"
          className="overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <h2 id="history-title" className="px-5 pt-5 pb-2 text-base font-bold">
            Stock history
          </h2>
          {movements.isPending ? (
            <p className="px-5 pb-5 text-[15px] text-muted-foreground">Loading…</p>
          ) : movements.isError ? (
            <p role="alert" className="px-5 pb-5 text-[15px]">
              {movements.error.message}
            </p>
          ) : movements.data.length === 0 ? (
            <p className="px-5 pb-5 text-[15px] text-muted-foreground">
              No stock changes yet. Use Stock in when a delivery arrives.
            </p>
          ) : (
            <ul className="divide-y border-t">
              {movements.data.map((m) => (
                <MovementRow key={m.id} m={m} single={single} />
              ))}
            </ul>
          )}
        </section>
      )}

      {dialog === 'stock-in' && (
        <Dialog open onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Stock in</DialogTitle>
              <DialogDescription>{p.name}</DialogDescription>
            </DialogHeader>
            <StockInForm
              product={p}
              onDone={({ product: updated, addedBaseQty }) => {
                setDialog(null);
                setAdded(
                  `Added ${addedBaseQty} ${plural(single, addedBaseQty)}. Now ${formatStock(updated.stockQty, updated.units, updated.baseUnit)}.`,
                );
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {dialog === 'adjust' && <AdjustStockDialog product={p} onClose={() => setDialog(null)} />}
    </div>
  );
}
