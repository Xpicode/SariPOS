import { CalendarClock, PackageX, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/context';
import { useExpiring, useProducts } from '@/features/products/queries';
import { roleLabel } from '@/lib/roles';
import { plural } from '@/lib/stock';
import { formatLongDate, greeting, useNow } from '@/lib/time';

const CAN_DO = {
  OWNER: [
    'Sell, record GCash and load, and receive utang payments',
    'Change prices and adjust stock',
    'Approve voids with your PIN',
    'See profit reports and manage who can log in',
  ],
  CASHIER: [
    'Sell, record GCash and load, and receive utang payments',
    'Open and close your own shift',
    'Voids need the owner’s PIN',
  ],
} as const;

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
      className="flex items-center gap-4 rounded-2xl border bg-card shadow-sm p-5 outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

export function HomePage() {
  const { user } = useAuth();
  const now = useNow(60_000);
  const low = useProducts({ lowStock: true });
  const expiring = useExpiring(7);
  if (!user) return null;
  const firstName = user.fullName.split(/\s+/)[0];
  const lowCount = low.data?.length ?? 0;
  const expiringCount = expiring.data?.length ?? 0;

  return (
    <div className="grid gap-8">
      <header>
        <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          {formatLongDate(now)}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {greeting(now)}, {firstName}.
        </h1>
      </header>

      {(lowCount > 0 || expiringCount > 0) && (
        <section aria-labelledby="attention-title" className="grid gap-3">
          <h2 id="attention-title" className="text-base font-semibold">
            Needs attention
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <AttentionCard
              to="/products?view=low"
              icon={PackageX}
              count={lowCount}
              text={`${plural('product', lowCount)} running low`}
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

      <section
        aria-labelledby="access-title"
        className="max-w-xl rounded-2xl border bg-card shadow-sm p-6"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="access-title" className="text-base font-semibold">
            What you can do
          </h2>
          <span className="rounded-full bg-accent px-2.5 py-1 font-mono text-[11px] tracking-[0.12em] text-accent-foreground uppercase">
            {roleLabel(user.role)}
          </span>
        </div>
        <ul className="mt-4 grid gap-2.5 text-[15px] text-muted-foreground">
          {CAN_DO[user.role].map((line) => (
            <li key={line} className="flex gap-3">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
