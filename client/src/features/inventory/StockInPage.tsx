import { Search, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import type { Product } from '@/api/types';
import { ScanButton } from '@/components/scanner/ScanButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BARCODE_RE, lookupBarcode, useProducts } from '@/features/products/queries';
import { StockBadge } from '@/features/products/StockBadge';
import { formatStock, plural } from '@/lib/stock';
import { useDebounced } from '@/lib/useDebounced';
import { StockInForm } from './StockInForm';

type Picked = { product: Product; unitId?: number };

// Delivery day: scan (or search) -> confirm quantity -> next item, as fast as possible.
export function StockInPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const debounced = useDebounced(search.trim());
  // Empty search: suggest what's running low. Typing: search everything.
  const list = useProducts(debounced ? { search: debounced } : { lowStock: true });

  async function pickByBarcode(code: string) {
    setNotice(null);
    try {
      const { product, unitId } = await lookupBarcode(code);
      setPicked({ product, unitId });
    } catch (err) {
      setSearch(code);
      setNotice({
        ok: false,
        text:
          err instanceof ApiError && err.status === 404
            ? `No product has barcode ${code}. Add it under Products first.`
            : 'Couldn’t look up that barcode. Try again.',
      });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const code = search.trim();
    if (/^\d{6,}$/.test(code) && BARCODE_RE.test(code)) pickByBarcode(code);
    else if (list.data?.length === 1) setPicked({ product: list.data[0] });
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Stock in</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Record a delivery. Scan each item, enter how many arrived, repeat.
        </p>
      </header>

      {notice && (
        <p
          role="status"
          className={
            notice.ok
              ? 'rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-foreground'
              : 'rounded-xl bg-warning-soft px-4 py-3 text-[15px] font-medium text-warning'
          }
        >
          {notice.text}
        </p>
      )}

      {picked ? (
        <section className="grid gap-5 rounded-2xl border bg-card shadow-sm p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold break-words">{picked.product.name}</h2>
              <p className="text-sm text-muted-foreground">
                Now{' '}
                {formatStock(
                  picked.product.stockQty,
                  picked.product.units,
                  picked.product.baseUnit,
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Choose a different product"
              onClick={() => {
                setPicked(null);
                queueMicrotask(() => searchRef.current?.focus());
              }}
            >
              <X className="size-5" />
            </Button>
          </div>
          <StockInForm
            key={picked.product.id}
            product={picked.product}
            initialUnitId={picked.unitId}
            onDone={({ product, addedBaseQty }) => {
              const single =
                product.units.find((u) => u.factor === 1)?.unitName ?? product.baseUnit;
              setNotice({
                ok: true,
                text: `Added ${addedBaseQty} ${plural(single, addedBaseQty)} to ${product.name}. Now ${formatStock(product.stockQty, product.units, product.baseUnit)}.`,
              });
              setPicked(null);
              setSearch('');
              queueMicrotask(() => searchRef.current?.focus()); // ready for the next item
            }}
          />
        </section>
      ) : (
        <>
          <form role="search" onSubmit={onSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchRef}
                type="search"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Scan or type a product"
                aria-label="Find the product that arrived"
                enterKeyHint="search"
                className="h-12 pl-10"
              />
            </div>
            <ScanButton onScan={pickByBarcode} />
          </form>

          <section
            aria-labelledby="pick-title"
            className="overflow-hidden rounded-2xl border bg-card shadow-sm"
          >
            <h2
              id="pick-title"
              className="px-5 pt-4 pb-2 text-sm font-semibold text-muted-foreground"
            >
              {debounced ? 'Results' : 'Running low'}
            </h2>
            {list.isPending ? (
              <p className="px-5 pb-5 text-[15px] text-muted-foreground">Loading…</p>
            ) : list.isError ? (
              <p role="alert" className="px-5 pb-5 text-[15px]">
                {list.error.message}
              </p>
            ) : list.data.length === 0 ? (
              <p className="px-5 pb-5 text-[15px] text-muted-foreground">
                {debounced ? `No products match “${debounced}”.` : 'Nothing is running low.'}
              </p>
            ) : (
              <ul className="divide-y border-t">
                {list.data.slice(0, 30).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPicked({ product: p })}
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {formatStock(p.stockQty, p.units, p.baseUnit)}
                        </span>
                      </span>
                      <StockBadge product={p} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
