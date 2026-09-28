import { CalendarClock, Plus, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import type { Product } from '@/api/types';
import { useAuth } from '@/auth/context';
import { NativeSelect } from '@/components/NativeSelect';
import { ScanButton } from '@/components/scanner/ScanButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPeso } from '@/lib/money';
import { formatStock, plural } from '@/lib/stock';
import { useDebounced } from '@/lib/useDebounced';
import { cn } from '@/lib/utils';
import { BARCODE_RE, lookupBarcode, useCategories, useExpiring, useProducts } from './queries';
import { StockBadge } from './StockBadge';

const VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low stock' },
  { key: 'expiring', label: 'Expiring soon' },
] as const;
type View = (typeof VIEWS)[number]['key'];

const rowClass =
  'flex items-center gap-4 px-5 py-4 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset';

function ProductRow({ p }: { p: Product }) {
  const unit = p.units.find((u) => u.isDefault) ?? p.units[0];
  return (
    <li>
      <Link to={`/products/${p.id}`} className={rowClass}>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold">
            <span className="truncate">{p.name}</span>
            <StockBadge product={p} />
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {p.categoryName ?? 'No category'} · {formatStock(p.stockQty, p.units, p.baseUnit)}
          </p>
        </div>
        {unit && (
          <div className="shrink-0 text-right">
            <p className="font-mono text-[15px] font-semibold tabular-nums">
              {formatPeso(unit.priceCentavos)}
            </p>
            <p className="text-xs text-muted-foreground">per {unit.unitName}</p>
          </div>
        )}
      </Link>
    </li>
  );
}

function expiryText(daysLeft: number) {
  if (daysLeft < 0) return `Expired ${-daysLeft} ${plural('day', -daysLeft)} ago`;
  if (daysLeft === 0) return 'Expires today';
  return `Expires in ${daysLeft} ${plural('day', daysLeft)}`;
}

function ExpiringList() {
  const expiring = useExpiring(7);
  if (expiring.isPending) return <ListMessage>Loading…</ListMessage>;
  if (expiring.isError) return <ListMessage alert>{expiring.error.message}</ListMessage>;
  if (expiring.data.length === 0) {
    return <ListMessage>Nothing on the shelf expires in the next 7 days.</ListMessage>;
  }
  return (
    <ul className="divide-y">
      {expiring.data.map((item) => (
        <li key={item.movementId}>
          <Link to={`/products/${item.productId}`} className={rowClass}>
            <CalendarClock
              className={cn(
                'size-5 shrink-0',
                item.daysLeft < 0 ? 'text-destructive' : 'text-warning',
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{item.name}</p>
              <p className="text-sm text-muted-foreground">
                About {item.qtyLeft} {plural(item.baseUnit, item.qtyLeft)} from this batch
              </p>
            </div>
            <p
              className={cn(
                'shrink-0 text-right text-sm font-semibold',
                item.daysLeft < 0 ? 'text-destructive' : 'text-warning',
              )}
            >
              {expiryText(item.daysLeft)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListMessage({ children, alert }: { children: React.ReactNode; alert?: boolean }) {
  return (
    <p
      role={alert ? 'alert' : undefined}
      className="px-5 py-10 text-center text-[15px] text-muted-foreground"
    >
      {children}
    </p>
  );
}

export function ProductsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.some((v) => v.key === params.get('view'))
    ? (params.get('view') as View)
    : 'all';
  const categoryId = Number(params.get('category')) || undefined;

  const [search, setSearch] = useState('');
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const debounced = useDebounced(search.trim());
  const categories = useCategories();
  const products = useProducts({ search: debounced, categoryId, lowStock: view === 'low' });

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  // A barcode (typed, from a USB scanner that "types" + Enter, or from the camera):
  // jump straight to that product. Otherwise it's just a name search.
  async function openByBarcode(code: string) {
    setScanMessage(null);
    try {
      const { product } = await lookupBarcode(code);
      navigate(`/products/${product.id}`);
    } catch (err) {
      setSearch(code);
      setScanMessage(
        err instanceof ApiError && err.status === 404
          ? `No product has barcode ${code}.`
          : 'Couldn’t look up that barcode. Try again.',
      );
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const code = search.trim();
    if (/^\d{6,}$/.test(code) && BARCODE_RE.test(code)) openByBarcode(code);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Prices, stock on hand and what needs restocking.
          </p>
        </div>
        {isOwner && (
          <Button asChild>
            <Link to="/products/new">
              <Plus aria-hidden />
              Add product
            </Link>
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <form role="search" onSubmit={onSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setScanMessage(null);
              }}
              placeholder="Search name or barcode"
              aria-label="Search products by name or barcode"
              enterKeyHint="search"
              className="pl-10"
            />
          </div>
          <ScanButton onScan={openByBarcode} />
        </form>
        <NativeSelect
          aria-label="Category"
          value={categoryId ?? ''}
          onChange={(e) => setParam('category', e.target.value || null)}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {scanMessage && (
        <p
          role="status"
          className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning"
        >
          {scanMessage}
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Show">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => setParam('view', v.key === 'all' ? null : v.key)}
            className="h-10 shrink-0 rounded-full border px-4 text-sm font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          >
            {v.label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-live="polite">
        {view === 'expiring' ? (
          <ExpiringList />
        ) : products.isPending ? (
          <ListMessage>Loading products…</ListMessage>
        ) : products.isError ? (
          <ListMessage alert>{products.error.message}</ListMessage>
        ) : products.data.length === 0 ? (
          <ListMessage>
            {debounced
              ? `No products match “${debounced}”.`
              : view === 'low'
                ? 'Nothing is running low.'
                : isOwner
                  ? 'No products yet. Add your first one.'
                  : 'No products yet.'}
          </ListMessage>
        ) : (
          <ul className={cn('divide-y', products.isPlaceholderData && 'opacity-60')}>
            {products.data.map((p) => (
              <ProductRow key={p.id} p={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
