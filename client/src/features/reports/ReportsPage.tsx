import { Download, ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ProductSales } from '@/api/types';
import { ColumnChart } from '@/components/ColumnChart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPesoCompact } from '@/lib/chart';
import { downloadCsv, pesos } from '@/lib/csv';
import { EXPENSE_LABEL } from '@/lib/expenses';
import { formatPeso } from '@/lib/money';
import { formatStock, plural } from '@/lib/stock';
import { addDays, formatDate, todayInManila } from '@/lib/time';
import { cn } from '@/lib/utils';
import { usePeakHours, useProductSales, useProfit, useTrend } from './queries';

const MAX_DAYS = 92; // the server's limit (about 3 months)
const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
const signedPeso = (n: number) => (n < 0 ? `−${formatPeso(-n)}` : formatPeso(n));
const dayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
const shortDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
  });
const daysAgo = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

function Card({
  title,
  hint,
  onExport,
  children,
  dim,
}: {
  title: string;
  hint?: string;
  onExport?: () => void;
  children: ReactNode;
  dim?: boolean;
}) {
  const id = title.toLowerCase().replace(/\W+/g, '-');
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'grid content-start gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-opacity sm:p-6',
        dim && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-bold">
            {title}
          </h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {onExport && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={onExport}>
            <Download aria-hidden />
            CSV
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: ReactNode;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-1.5',
        strong && 'font-bold',
        muted && 'text-muted-foreground',
      )}
    >
      <dt>{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function ProfitCard({ from, to }: { from: string; to: string }) {
  const profit = useProfit(from, to);
  if (profit.isPending) return <Card title="Profit">Loading…</Card>;
  if (profit.isError) return <Card title="Profit">{profit.error.message}</Card>;
  const p = profit.data;
  const exportCsv = () =>
    downloadCsv(`saripos-profit-${from}-to-${to}.csv`, [
      ['SariPOS profit', `${from} to ${to}`],
      ['Item', 'Pesos'],
      ['Product sales', pesos(p.products.revenue)],
      ['Cost of goods sold', -pesos(p.products.cost)],
      ['Product profit', pesos(p.products.profit)],
      ['GCash fees', pesos(p.gcash.earned)],
      ['Load commission', pesos(p.eload.earned)],
      ...p.expenses.byCategory.map((e) => [
        `Expense: ${EXPENSE_LABEL[e.category]}`,
        -pesos(e.total),
      ]),
      ['Net profit', pesos(p.netProfit)],
      ['Owner withdrawals (not a cost)', pesos(p.ownerWithdrawals)],
    ]);
  return (
    <Card
      title="Profit"
      hint="What the store really earned: sales minus what the goods cost, plus fees, minus expenses."
      onExport={exportCsv}
      dim={profit.isPlaceholderData}
    >
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Net profit</p>
        <p
          className={cn(
            'font-mono text-5xl font-bold tracking-tight tabular-nums',
            p.netProfit < 0 && 'text-destructive',
          )}
        >
          {signedPeso(p.netProfit)}
        </p>
      </div>
      <dl className="divide-y text-[15px]">
        <Line
          label={`Product sales (${p.products.saleCount} ${plural('sale', p.products.saleCount)})`}
          value={formatPeso(p.products.revenue)}
        />
        <Line label="Cost of the goods sold" value={`−${formatPeso(p.products.cost)}`} muted />
        <Line label="Product profit" value={signedPeso(p.products.profit)} strong />
        <Line label={`GCash fees (${p.gcash.count})`} value={`+${formatPeso(p.gcash.earned)}`} />
        <Line
          label={`Load commission (${p.eload.count})`}
          value={`+${formatPeso(p.eload.earned)}`}
        />
        {p.expenses.byCategory.map((e) => (
          <Line
            key={e.category}
            label={`${EXPENSE_LABEL[e.category]} (${e.count})`}
            value={`−${formatPeso(e.total)}`}
          />
        ))}
        <Line label="Net profit" value={signedPeso(p.netProfit)} strong />
      </dl>
      {p.ownerWithdrawals > 0 && (
        <p className="text-sm text-muted-foreground">
          Owner withdrawals: {formatPeso(p.ownerWithdrawals)}. Money taken home, so it isn’t counted
          as a cost.
        </p>
      )}
    </Card>
  );
}

function TrendCard({ from, to }: { from: string; to: string }) {
  const trend = useTrend(from, to);
  const days = trend.data?.days ?? [];
  const every = Math.ceil(days.length / 5); // about 5 date labels: they still fit on a phone
  const total = days.reduce((s, d) => s + d.sales, 0);
  return (
    <Card
      title="Sales per day"
      hint={
        trend.data
          ? `${formatPeso(total)} in ${days.length} ${plural('day', days.length)}`
          : undefined
      }
      onExport={() =>
        downloadCsv(`saripos-sales-per-day-${from}-to-${to}.csv`, [
          ['Day', 'Sales (pesos)', 'Product profit (pesos)', 'Number of sales'],
          ...days.map((d) => [d.day, pesos(d.sales), pesos(d.profit), d.count]),
        ])
      }
      dim={trend.isPlaceholderData}
    >
      {trend.isPending ? (
        'Loading…'
      ) : trend.isError ? (
        trend.error.message
      ) : days.length < 2 ? (
        <p className="text-[15px] text-muted-foreground">Pick two or more days to see a trend.</p>
      ) : (
        <ColumnChart
          label="Sales per day"
          valueName="Sales"
          formatValue={formatPeso}
          formatAxis={formatPesoCompact}
          columns={days.map((d, i) => ({
            key: d.day,
            label: dayLabel(d.day),
            tick: (days.length - 1 - i) % every === 0 ? shortDay(d.day) : undefined,
            value: d.sales,
            details: [
              `${d.count} ${plural('sale', d.count)}`,
              `product profit ${signedPeso(d.profit)}`,
            ],
          }))}
        />
      )}
    </Card>
  );
}

function PeakHoursCard({ from, to }: { from: string; to: string }) {
  const peak = usePeakHours(from, to);
  const hours = peak.data?.hours ?? [];
  const busiest = hours.reduce((b, h) => (h.count > (b?.count ?? 0) ? h : b), hours[0]);
  const hourLabel = (h: number) =>
    `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`;
  return (
    <Card
      title="Busiest hours"
      hint={
        busiest && busiest.count > 0
          ? `Busiest: ${hourLabel(busiest.hour)}, ${busiest.count} ${plural('sale', busiest.count)}`
          : 'Number of sales by hour of the day'
      }
      onExport={() =>
        downloadCsv(`saripos-sales-by-hour-${from}-to-${to}.csv`, [
          ['Hour', 'Number of sales', 'Sales (pesos)'],
          ...hours.map((h) => [hourLabel(h.hour), h.count, pesos(h.sales)]),
        ])
      }
      dim={peak.isPlaceholderData}
    >
      {peak.isPending ? (
        'Loading…'
      ) : peak.isError ? (
        peak.error.message
      ) : (
        <ColumnChart
          label="Number of sales by hour of the day"
          valueName="Sales"
          formatValue={(v) => `${v} ${plural('sale', v)}`}
          formatAxis={(v) => String(v)}
          columns={hours.map((h) => ({
            key: String(h.hour),
            label: hourLabel(h.hour),
            tick: h.hour % 3 === 0 ? String(h.hour) : undefined,
            value: h.count,
            details: [formatPeso(h.sales)],
          }))}
        />
      )}
    </Card>
  );
}

function ProductTable({
  rows,
  figure,
  detail,
  empty,
}: {
  rows: ProductSales[];
  figure: (p: ProductSales) => string;
  detail: (p: ProductSales) => string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-[15px] text-muted-foreground">{empty}</p>;
  return (
    <ol className="-mx-5 divide-y border-t sm:-mx-6">
      {rows.map((p, i) => (
        <li key={p.productId}>
          <Link
            to={`/products/${p.productId}`}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-5 py-2.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6"
          >
            <span className="font-mono text-sm text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{p.name}</span>
              <span className="block truncate text-sm text-muted-foreground">{detail(p)}</span>
            </span>
            <span className="font-mono text-[15px] font-semibold tabular-nums">{figure(p)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function ProductCards({ from, to }: { from: string; to: string }) {
  const sales = useProductSales(from, to);
  const all = sales.data?.products ?? [];
  const best = all.filter((p) => p.saleCount > 0).slice(0, 10); // server: most money first
  // Slow movers: still on the shelf, sold the least; never-sold first, then longest since sold.
  const slow = all
    .filter((p) => p.stockQty > 0)
    .sort(
      (a, b) =>
        a.saleCount - b.saleCount ||
        (a.lastSoldAt ? Date.parse(a.lastSoldAt) : 0) -
          (b.lastSoldAt ? Date.parse(b.lastSoldAt) : 0),
    )
    .slice(0, 10);
  const exportCsv = () =>
    downloadCsv(`saripos-products-${from}-to-${to}.csv`, [
      [
        'Product',
        'Receipts',
        'Quantity sold',
        'Sales (pesos)',
        'Profit (pesos)',
        'In stock',
        'Last sold',
      ],
      ...all.map((p) => [
        p.name,
        p.saleCount,
        formatStock(p.qtySold, p.units, p.baseUnit),
        pesos(p.revenue),
        pesos(p.profit),
        formatStock(p.stockQty, p.units, p.baseUnit),
        p.lastSoldAt?.slice(0, 10) ?? 'never',
      ]),
    ]);
  const status = sales.isPending ? 'Loading…' : sales.isError ? sales.error.message : null;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card
        title="Best sellers"
        hint="Most money in this period"
        onExport={exportCsv}
        dim={sales.isPlaceholderData}
      >
        {status ?? (
          <ProductTable
            rows={best}
            figure={(p) => formatPeso(p.revenue)}
            detail={(p) =>
              `${formatStock(p.qtySold, p.units, p.baseUnit)} · profit ${signedPeso(p.profit)}`
            }
            empty="Nothing sold in this period."
          />
        )}
      </Card>
      <Card title="Slow movers" hint="In stock but sold the least" dim={sales.isPlaceholderData}>
        {status ?? (
          <ProductTable
            rows={slow}
            figure={(p) => `${p.saleCount} ${plural('sale', p.saleCount)}`}
            detail={(p) =>
              `${formatStock(p.stockQty, p.units, p.baseUnit)} in stock · ${
                p.lastSoldAt
                  ? daysAgo(p.lastSoldAt) === 0
                    ? 'last sold today'
                    : `last sold ${daysAgo(p.lastSoldAt)} ${plural('day', daysAgo(p.lastSoldAt))} ago`
                  : 'never sold'
              }`
            }
            empty="Everything in stock is selling."
          />
        )}
      </Card>
    </div>
  );
}

const PRESETS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const today = todayInManila();
  const to = params.get('to') ?? today;
  const from = params.get('from') ?? addDays(to, -29);
  const valid = from <= to && to <= today && dayCount(from, to) <= MAX_DAYS;
  const setRange = (f: string, t: string) => setParams({ from: f, to: t });

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {formatDate(from)} – {formatDate(to)}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/reports/audit">
            <ScrollText aria-hidden />
            Audit log
          </Link>
        </Button>
      </header>

      {/* One filter row: it scopes every report below it. */}
      <div className="flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label="Period"
          className="inline-flex rounded-full border bg-card p-1 shadow-xs"
        >
          {PRESETS.map((p) => {
            const f = addDays(today, 1 - p.days);
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={from === f && to === today}
                onClick={() => setRange(f, today)}
                className="h-9 rounded-full px-3.5 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="r-from">From</Label>
          <Input
            id="r-from"
            type="date"
            max={to}
            value={from}
            onChange={(e) => e.target.value && setRange(e.target.value, to)}
            className="w-44"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="r-to">To</Label>
          <Input
            id="r-to"
            type="date"
            min={from}
            max={today}
            value={to}
            onChange={(e) => e.target.value && setRange(from, e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {!valid ? (
        <p role="alert" className="rounded-2xl border border-dashed px-5 py-6 text-[15px]">
          Pick a range of up to {MAX_DAYS} days, ending today or earlier.
        </p>
      ) : (
        <>
          {/* Laptop: profit on the left, the two charts stacked on the right.
              Wide screen: all three side by side. */}
          <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <div className="lg:row-span-2 xl:row-span-1">
              <ProfitCard from={from} to={to} />
            </div>
            <TrendCard from={from} to={to} />
            <PeakHoursCard from={from} to={to} />
          </div>
          <ProductCards from={from} to={to} />
        </>
      )}
    </div>
  );
}
