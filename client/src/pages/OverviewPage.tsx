import {
  CalendarClock,
  NotebookPen,
  PackageX,
  ShoppingCart,
  Smartphone,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Dashboard, Product, ProductSales } from '@/api/types';
import { useAuth } from '@/auth/context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExpiring, useProducts } from '@/features/products/queries';
import { useDashboard, useProductSales } from '@/features/reports/queries';
import { formatPeso } from '@/lib/money';
import { formatStock, plural } from '@/lib/stock';
import { addDays, formatLongDate, greeting, todayInManila, useNow } from '@/lib/time';
import { cn } from '@/lib/utils';

const PERIODS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
] as const;

const signedPeso = (n: number) => (n < 0 ? `−${formatPeso(-n)}` : formatPeso(n));

// A stat tile: label, value, one line of context.
function Stat({
  label,
  value,
  note,
  bad,
}: {
  label: string;
  value: string;
  note: string;
  bad?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono text-3xl font-bold tracking-tight tabular-nums',
          bad && 'text-destructive',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

function ListCard({
  title,
  link,
  linkText,
  children,
}: {
  title: string;
  link: string;
  linkText: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="text-base font-bold">{title}</h2>
        <Link
          to={link}
          className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          {linkText}
        </Link>
      </div>
      {children}
    </section>
  );
}

// The owner's "today" at a glance (plan: sales, profit, transactions, wallets, top utang).
// `children` (the best-of-the-period lists) sits beside wallets + utang on wide screens.
function TodayPanel({ d, children }: { d: Dashboard; children: ReactNode }) {
  const txns = d.transactions.sales + d.transactions.ewallet;
  return (
    <>
      <section aria-label="Today" className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Sales today"
          value={formatPeso(d.sales)}
          note={`${d.transactions.sales} ${plural('sale', d.transactions.sales)}`}
        />
        <Stat
          label="Net profit today"
          value={signedPeso(d.netProfit)}
          note="After cost of goods, fees and expenses"
          bad={d.netProfit < 0}
        />
        <Stat
          label="Transactions today"
          value={String(txns)}
          note={`${d.transactions.sales} ${plural('sale', d.transactions.sales)} · ${d.transactions.ewallet} GCash & load`}
        />
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-1">
          <ListCard title="Wallets" link="/ewallet" linkText="GCash & Load">
            <ul className="divide-y border-t">
              {d.wallets.map((w) => (
                <li key={w.id} className="flex items-baseline justify-between gap-3 px-5 py-3">
                  <span className="min-w-0 truncate text-[15px] font-semibold">{w.name}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    {w.isLow && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-warning">
                        <TriangleAlert className="size-3.5 self-center" aria-hidden />
                        Low
                      </span>
                    )}
                    <span className="font-mono text-[15px] font-semibold tabular-nums">
                      {formatPeso(w.balance)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </ListCard>
          <ListCard title="Top utang" link="/customers" linkText="All utang">
            {d.topUtang.length === 0 ? (
              <p className="border-t px-5 py-4 text-[15px] text-muted-foreground">
                Nobody owes the store.
              </p>
            ) : (
              <ul className="divide-y border-t">
                {d.topUtang.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/customers/${c.id}`}
                      className="flex items-baseline justify-between gap-3 px-5 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                    >
                      <span className="min-w-0 truncate text-[15px] font-semibold">{c.name}</span>
                      <span className="font-mono text-[15px] font-semibold tabular-nums">
                        {formatPeso(c.balance)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ListCard>
        </div>
        <div className="xl:col-span-2">{children}</div>
      </div>
    </>
  );
}

const QUICK: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/sell', label: 'Sell', icon: ShoppingCart },
  { to: '/ewallet', label: 'GCash & Load', icon: Smartphone },
  { to: '/customers', label: 'Utang', icon: NotebookPen },
  { to: '/drawer', label: 'Cash drawer', icon: Wallet },
];

// The cashier's start screen: reports are the owner's, so just the way in to the day's work.
function QuickLinks() {
  return (
    <nav aria-label="Start here" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {QUICK.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="grid justify-items-center gap-2 rounded-2xl border bg-card px-3 py-6 text-center shadow-sm outline-none hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="text-base font-bold">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

// A count that links to the list behind it. Hidden when there is nothing to do.
function AttentionCard({
  to,
  icon: Icon,
  count,
  text,
}: {
  to: string;
  icon: LucideIcon;
  count: number;
  text: string;
}) {
  if (count === 0) return null;
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        <span className="block text-2xl font-bold tabular-nums">{count}</span>
        <span className="block text-sm text-muted-foreground">{text}</span>
      </span>
    </Link>
  );
}

// Top 5, best first. The bar shows each one against #1, so the gap between them is visible.
function RankList({
  id,
  title,
  hint,
  rows,
  value,
  figure,
  detail,
  empty,
}: {
  id: string;
  title: string;
  hint: string;
  rows: ProductSales[];
  value: (r: ProductSales) => number;
  figure: (r: ProductSales) => ReactNode;
  detail: (r: ProductSales) => string;
  empty: string;
}) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <section aria-labelledby={id} className="rounded-2xl border bg-card shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <h2 id={id} className="text-base font-bold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="border-t px-5 py-6 text-[15px] text-muted-foreground">{empty}</p>
      ) : (
        <ol className="divide-y border-t">
          {rows.map((r, i) => (
            <li key={r.productId}>
              <Link
                to={`/products/${r.productId}`}
                className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3 px-5 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                <span className="font-mono text-sm text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{detail(r)}</span>
                </span>
                <span className="font-mono text-[15px] font-semibold tabular-nums">
                  {figure(r)}
                </span>
                <span
                  aria-hidden
                  className="col-start-2 col-end-4 mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      i === 0 ? 'bg-primary' : 'bg-primary/45',
                    )}
                    style={{ width: `${(value(r) / max) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Pops up when the Overview opens and something is running low. Once per browser session for
// the same list: it comes back only when another product runs low.
function LowStockPopup({
  products,
  isOwner,
  onClose,
}: {
  products: Product[];
  isOwner: boolean;
  onClose: () => void;
}) {
  const shown = products.slice(0, 6);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {products.length} {plural('product', products.length)} running low
          </DialogTitle>
          <DialogDescription>
            {isOwner ? 'Restock these before they run out.' : 'Tell the owner so they can restock.'}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y overflow-hidden rounded-xl border">
          {shown.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span className="min-w-0 truncate text-[15px] font-semibold">{p.name}</span>
              <span
                className={cn(
                  'shrink-0 text-right text-sm tabular-nums',
                  p.stockQty === 0 ? 'font-bold text-destructive' : 'text-warning',
                )}
              >
                {p.stockQty === 0
                  ? 'Out of stock'
                  : `${formatStock(p.stockQty, p.units, p.baseUnit)} left`}
              </span>
            </li>
          ))}
        </ul>
        {products.length > shown.length && (
          <p className="text-sm text-muted-foreground">
            and {products.length - shown.length} more.
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Later
          </Button>
          <Button variant={isOwner ? 'outline' : 'default'} asChild>
            <Link to="/products?view=low" onClick={onClose}>
              See the list
            </Link>
          </Button>
          {isOwner && (
            <Button asChild autoFocus>
              <Link to="/stock-in" onClick={onClose}>
                Stock in
              </Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Session storage is a convenience: if the browser blocks it, the popup just shows again.
const seenKey = (userId: number) => `saripos.lowStockSeen.${userId}`;
function readSeen(userId: number) {
  try {
    return sessionStorage.getItem(seenKey(userId));
  } catch {
    return null;
  }
}
function writeSeen(userId: number, value: string) {
  try {
    sessionStorage.setItem(seenKey(userId), value);
  } catch {
    // ignore
  }
}

export function OverviewPage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const [params, setParams] = useSearchParams();
  const period = PERIODS.find((p) => p.key === params.get('period')) ?? PERIODS[1];
  const today = todayInManila();
  const isOwner = user?.role === 'OWNER';
  // Reports are owner-only on the server; a cashier's page doesn't even ask for them.
  const sales = useProductSales(addDays(today, 1 - period.days), today, isOwner);
  const dashboard = useDashboard(isOwner);
  const low = useProducts({ lowStock: true });
  const expiring = useExpiring(7);
  const [seen, setSeen] = useState(() => (user ? readSeen(user.id) : null));
  if (!user) return null;

  const firstName = user.fullName.split(/\s+/)[0];
  const lowList = low.data ?? [];
  const expiringCount = expiring.data?.length ?? 0;
  // Which products are low right now, as one string: a new one becoming low changes it.
  const lowSignature = lowList.map((p) => p.id).join(',');
  const showPopup = lowList.length > 0 && lowSignature !== seen;
  const closePopup = () => {
    writeSeen(user.id, lowSignature);
    setSeen(lowSignature);
  };

  const rows = (sales.data?.products ?? []).filter((r) => r.saleCount > 0);
  const topSellers = [...rows]
    .sort((a, b) => b.saleCount - a.saleCount || b.qtySold - a.qtySold)
    .slice(0, 5);
  const topProducts = rows.slice(0, 5); // the server sends them biggest sales first
  const periodText = period.key === 'today' ? 'today' : `in the last ${period.label}`;

  const best = (
    <section aria-label="Best of the period" className="grid gap-4">
      {/* The period applies to the two lists below it only; the tiles above are today. */}
      <div
        role="group"
        aria-label="Period"
        className="inline-flex w-fit rounded-full border bg-card p-1 shadow-xs"
      >
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.key === period.key}
            onClick={() => setParams(p.key === '7d' ? {} : { period: p.key })}
            className="h-9 rounded-full px-4 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>
      {sales.isError ? (
        <p role="alert">{sales.error.message}</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <RankList
            id="top-sellers"
            title="Top sellers"
            hint={`Bought most often ${periodText}`}
            rows={topSellers}
            value={(r) => r.saleCount}
            figure={(r) => `${r.saleCount} ${plural('sale', r.saleCount)}`}
            detail={(r) => `${formatStock(r.qtySold, r.units, r.baseUnit)} sold`}
            empty={sales.isPending ? 'Loading…' : `No sales ${periodText} yet.`}
          />
          <RankList
            id="top-products"
            title="Top products"
            hint={`Most money ${periodText}`}
            rows={topProducts}
            value={(r) => r.revenue}
            figure={(r) => formatPeso(r.revenue)}
            detail={(r) =>
              `profit ${signedPeso(r.profit)} · ${r.saleCount} ${plural('sale', r.saleCount)}`
            }
            empty={sales.isPending ? 'Loading…' : `No sales ${periodText} yet.`}
          />
        </div>
      )}
    </section>
  );

  return (
    <div className="grid gap-6">
      <header>
        <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          {formatLongDate(now)}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Overview</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          {greeting(now)}, {firstName}.
        </p>
      </header>

      {(lowList.length > 0 || expiringCount > 0) && (
        <section aria-labelledby="attention-title" className="grid gap-3">
          <h2 id="attention-title" className="text-base font-semibold">
            Needs attention
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <AttentionCard
              to="/products?view=low"
              icon={PackageX}
              count={lowList.length}
              text={`${plural('product', lowList.length)} running low`}
            />
            <AttentionCard
              to="/products?view=expiring"
              icon={CalendarClock}
              count={expiringCount}
              text={`${plural('batch', expiringCount)} expiring within 7 days`}
            />
          </div>
        </section>
      )}

      {isOwner &&
        (dashboard.isError ? (
          <p role="alert">{dashboard.error.message}</p>
        ) : dashboard.data ? (
          <TodayPanel d={dashboard.data}>{best}</TodayPanel>
        ) : (
          <p className="text-[15px] text-muted-foreground">Loading today…</p>
        ))}
      {!isOwner && <QuickLinks />}

      {showPopup && <LowStockPopup products={lowList} isOwner={isOwner} onClose={closePopup} />}
    </div>
  );
}
