import { useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/api/client';
import type { Product, Sale } from '@/api/types';
import { ScanButton } from '@/components/scanner/ScanButton';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StartOfDay } from '@/features/drawer/StartOfDay';
import { BARCODE_RE, lookupBarcode, useCategories, useProducts } from '@/features/products/queries';
import { formatPeso, formatPesoShort } from '@/lib/money';
import { formatStock, plural } from '@/lib/stock';
import { useDebounced } from '@/lib/useDebounced';
import { cn } from '@/lib/utils';
import { addToCart, cartTotal, itemCount, refreshLines, type CartLine } from './cart';
import { CartPanel } from './CartPanel';
import { PayDialog, SaleDoneDialog } from './PayDialog';
import { useAfterSale, useCurrentSession } from './queries';

// Every sale belongs to an open cash drawer (plan 6.5), so the register only appears once
// the drawer is open.
export function SellPage() {
  const session = useCurrentSession();
  if (session.isPending) return <p className="text-[15px] text-muted-foreground">Loading…</p>;
  if (session.isError) {
    return (
      <p role="alert" className="text-[15px]">
        {session.error.message}
      </p>
    );
  }
  return session.data ? <Register /> : <StartOfDay />;
}

const defaultUnit = (p: Product) => p.units.find((u) => u.isDefault) ?? p.units[0];

function ProductTile({
  product: p,
  inCart,
  onAdd,
}: {
  product: Product;
  inCart: number;
  onAdd: (p: Product, unitId: number) => void;
}) {
  const main = defaultUnit(p);
  if (!main) return null; // a product without units can't be sold
  const others = p.units.filter((u) => u.id !== main.id);
  const out = p.stockQty <= 0;

  return (
    <li
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm',
        out && 'opacity-60',
        inCart > 0 && 'border-primary/60',
      )}
    >
      <button
        type="button"
        disabled={out}
        onClick={() => onAdd(p, main.id)}
        aria-label={`Add 1 ${main.unitName} of ${p.name}, ${formatPeso(main.priceCentavos)}`}
        className="flex flex-1 flex-col gap-2 p-3.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted disabled:cursor-not-allowed"
      >
        <span className="line-clamp-2 min-h-[2lh] pr-6 text-[15px] leading-snug font-semibold">
          {p.name}
        </span>
        <span className="font-mono text-base font-bold tabular-nums">
          {formatPeso(main.priceCentavos)}
          <span className="font-sans text-xs font-normal text-muted-foreground">
            {' '}
            / {main.unitName}
          </span>
        </span>
        <span
          className={cn(
            'text-xs',
            out
              ? 'font-semibold text-destructive'
              : p.isLowStock
                ? 'font-semibold text-warning'
                : 'text-muted-foreground',
          )}
        >
          {out ? 'Out of stock' : `${formatStock(p.stockQty, p.units, p.baseUnit)} left`}
        </span>
      </button>

      {/* Tingi: the other ways to sell it, one tap each (pack, ream, half kilo...). */}
      {others.length > 0 && !out && (
        <div className="flex flex-wrap gap-1.5 border-t border-dashed px-3 py-2.5">
          {others.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onAdd(p, u.id)}
              aria-label={`Add 1 ${u.unitName} of ${p.name}, ${formatPeso(u.priceCentavos)}`}
              className="min-h-9 rounded-full border px-3 text-xs font-semibold outline-none hover:border-primary hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              + {u.unitName}{' '}
              <span className="font-mono tabular-nums">{formatPesoShort(u.priceCentavos)}</span>
            </button>
          ))}
        </div>
      )}

      {inCart > 0 && (
        <span
          aria-hidden // the cart itself says what's in it
          className="absolute top-2.5 right-2.5 grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 font-mono text-xs font-bold text-primary-foreground"
        >
          {inCart}
        </span>
      )}
    </li>
  );
}

function Register() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [cartOpen, setCartOpen] = useState(false); // phones: the cart opens as a dialog
  const [done, setDone] = useState<Sale | null>(null);
  const debounced = useDebounced(search.trim());
  const list = useProducts({ search: debounced || undefined, categoryId });
  const categories = useCategories();
  const afterSale = useAfterSale();
  const queryClient = useQueryClient();

  const total = cartTotal(cart);
  const count = itemCount(cart);
  const qtyByProduct = new Map<number, number>();
  for (const l of cart)
    qtyByProduct.set(l.product.id, (qtyByProduct.get(l.product.id) ?? 0) + l.qty);

  const focusSearch = () => queueMicrotask(() => searchRef.current?.focus());

  function add(product: Product, unitId: number) {
    setCart((c) => addToCart(c, product, unitId));
    setNotice(null);
  }

  // Keyboard, for a counter with a PC: F2 = find a product, F9 = pay.
  const canPay = cart.length > 0;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (canPay) setPaying(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPay]);

  async function addByBarcode(code: string) {
    try {
      const { product, unitId } = await lookupBarcode(code);
      add(product, unitId);
      setSearch('');
    } catch (err) {
      setSearch(code);
      setNotice(
        err instanceof ApiError && err.status === 404
          ? `No product has barcode ${code}.`
          : 'Couldn’t look up that barcode. Try again.',
      );
    }
    focusSearch(); // a USB scanner "types" the next code straight into the box
  }

  // Enter in the search box: a barcode (USB scanners type digits + Enter), or the only match.
  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const code = search.trim();
    if (/^\d{6,}$/.test(code) && BARCODE_RE.test(code)) {
      addByBarcode(code);
    } else if (list.data?.length === 1 && list.data[0].stockQty > 0) {
      add(list.data[0], defaultUnit(list.data[0]).id);
      setSearch('');
    }
  }

  // The server said the cart is out of date (price changed, stock ran out, item removed).
  // Reload those products so the cart shows the truth, and say what happened.
  async function onStale(message: string) {
    setPaying(false);
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['cash-session'] });
    const ids = [...new Set(cart.map((l) => l.product.id))];
    const fresh = new Map(
      await Promise.all(
        ids.map(async (id) => {
          const p = await api<{ product: Product }>(`/products/${id}`).then(
            (d) => d.product,
            () => null,
          );
          return [id, p] as const;
        }),
      ),
    );
    const { cart: next, removed } = refreshLines(cart, fresh);
    setCart(next);
    setNotice(
      removed.length ? `${message} Removed (no longer sold): ${removed.join(', ')}.` : message,
    );
  }

  function onPaid(sale: Sale) {
    setPaying(false);
    setCartOpen(false);
    setCart([]);
    setNotice(null);
    setDone(sale);
    afterSale(sale); // stock changed: refetch products and sales lists
  }

  const cartPanel = (
    <CartPanel
      cart={cart}
      onChange={(update) => setCart(update)}
      onPay={() => {
        setCartOpen(false);
        setPaying(true);
      }}
    />
  );

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:pb-0">
      <div className="grid min-w-0 content-start gap-4">
        <header className="flex items-end justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Sell</h1>
          <p className="hidden text-sm text-muted-foreground lg:block">
            <kbd className="rounded border px-1.5 font-mono text-xs">F2</kbd> find ·{' '}
            <kbd className="rounded border px-1.5 font-mono text-xs">F9</kbd> pay
          </p>
        </header>

        <form role="search" onSubmit={onSearchSubmit} className="flex gap-2">
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
              aria-label="Find a product"
              aria-keyshortcuts="F2"
              enterKeyHint="search"
              className="h-12 pl-10"
            />
          </div>
          <ScanButton onScan={addByBarcode} />
        </form>

        <div
          role="group"
          aria-label="Category"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {[{ id: undefined, name: 'All' }, ...(categories.data ?? [])].map((c) => (
            <button
              key={c.id ?? 'all'}
              type="button"
              aria-pressed={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                categoryId === c.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card shadow-xs hover:bg-muted',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {notice && (
          <p
            role="alert"
            className="rounded-xl bg-warning-soft px-4 py-3 text-[15px] font-medium text-warning"
          >
            {notice}
          </p>
        )}

        {list.isPending ? (
          <p className="text-[15px] text-muted-foreground">Loading products…</p>
        ) : list.isError ? (
          <p role="alert" className="text-[15px]">
            {list.error.message}
          </p>
        ) : list.data.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-5 py-10 text-center text-[15px] text-muted-foreground">
            {debounced ? `No products match “${debounced}”.` : 'No products in this category.'}
          </p>
        ) : (
          <ul
            aria-label="Products"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            {list.data.map((p) => (
              <ProductTile
                key={p.id}
                product={p}
                inCart={qtyByProduct.get(p.id) ?? 0}
                onAdd={add}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Desktop / large tablet: the cart stays in view on the right. */}
      <aside className="sticky top-6 hidden lg:block">{cartPanel}</aside>

      {/* Phones and small tablets: a bar at the bottom with the total; the cart opens on tap. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:left-64 lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="block text-sm text-muted-foreground">
              {count} {plural('item', count)} · <span className="underline">View cart</span>
            </span>
            <span
              key={count} // re-mounts on every add, replaying the small "bump"
              className="block font-mono text-xl font-bold tabular-nums motion-safe:animate-in motion-safe:zoom-in-95"
            >
              {formatPeso(total)}
            </span>
          </button>
          <Button
            size="lg"
            className="h-12 px-7 text-base"
            disabled={!canPay}
            onClick={() => setPaying(true)}
          >
            Pay
          </Button>
        </div>
      </div>

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto p-3 pt-12 lg:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Cart</DialogTitle>
            <DialogDescription>Change quantities or units, then pay.</DialogDescription>
          </DialogHeader>
          {cartPanel}
        </DialogContent>
      </Dialog>

      {paying && (
        <PayDialog cart={cart} onPaid={onPaid} onStale={onStale} onClose={() => setPaying(false)} />
      )}
      {done && (
        <SaleDoneDialog
          sale={done}
          onClose={() => {
            setDone(null);
            focusSearch(); // ready for the next customer
          }}
        />
      )}
    </div>
  );
}
