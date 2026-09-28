import { HandCoins, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { CashSession, ShiftSummary } from '@/api/types';
import { useAuth } from '@/auth/context';
import { Button } from '@/components/ui/button';
import { useCurrentSession } from '@/features/sales/queries';
import { formatPeso } from '@/lib/money';
import { addDays, formatClock, formatDateTime, todayInManila } from '@/lib/time';
import { cn } from '@/lib/utils';
import { overShortText } from './denominations';
import { ExpenseDialog } from './ExpenseDialog';
import { useShifts } from './queries';
import { StartOfDay } from './StartOfDay';
import { ZReport } from './ZReport';

export function ResultChip({ overShort }: { overShort: number | null }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap',
        overShort === null && 'bg-accent text-accent-foreground',
        overShort === 0 && 'bg-muted text-foreground',
        overShort !== null && overShort < 0 && 'bg-destructive/10 text-destructive',
        overShort !== null && overShort > 0 && 'bg-warning-soft text-warning',
      )}
    >
      {overShort === null ? 'Open' : overShortText(overShort)}
    </span>
  );
}

function OpenShift({ report, onExpense }: { report: CashSession; onExpense: () => void }) {
  const { user } = useAuth();
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cash drawer</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Open since {formatDateTime(report.openedAt)} · opened by {report.openedBy}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onExpense}>
            <HandCoins aria-hidden />
            Record expense
          </Button>
          <Button asChild>
            <Link to="/drawer/close">
              <LockKeyhole aria-hidden />
              End of day
            </Link>
          </Button>
        </div>
      </header>
      <div className="grid gap-6 md:grid-cols-[minmax(0,420px)_1fr] md:items-start">
        <div className="receipt-outline">
          <ZReport report={report} />
        </div>
        <p className="text-[15px] text-muted-foreground md:pt-2">
          {user?.role === 'OWNER'
            ? '“Expected now” updates with every sale, void and expense.'
            : 'At the end of your shift, tap End of day and count the drawer. You’ll see whether it’s over or short once your count is saved.'}
        </p>
      </div>
    </div>
  );
}

function ShiftRow({ s }: { s: ShiftSummary }) {
  return (
    <li>
      <Link
        to={`/drawer/${s.id}`}
        className="flex items-center gap-3 px-5 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">
            {formatDateTime(s.openedAt)}
            {s.closedAt && ` – ${formatClock(s.closedAt)}`}
          </span>
          <span className="block text-sm text-muted-foreground">
            {s.closedBy && s.closedBy !== s.openedBy ? `${s.openedBy} → ${s.closedBy}` : s.openedBy}
            {s.actualCash !== null &&
              ` · counted ${formatPeso(s.actualCash)} of ${formatPeso(s.expectedCash!)}`}
          </span>
        </span>
        <ResultChip overShort={s.overShort} />
      </Link>
    </li>
  );
}

function ShiftHistory() {
  const today = todayInManila();
  const shifts = useShifts(addDays(today, -30), today);
  return (
    <section aria-labelledby="history-title" className="grid gap-3">
      <h2 id="history-title" className="text-lg font-bold">
        Shifts, last 30 days
      </h2>
      {shifts.isPending ? (
        <p className="text-[15px] text-muted-foreground">Loading…</p>
      ) : shifts.isError ? (
        <p role="alert">{shifts.error.message}</p>
      ) : shifts.data.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-[15px] text-muted-foreground">
          No shifts yet.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {shifts.data.map((s) => (
            <ShiftRow key={s.id} s={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function DrawerPage() {
  const { user } = useAuth();
  const session = useCurrentSession();
  const [recording, setRecording] = useState(false);

  if (session.isPending) return <p className="text-[15px] text-muted-foreground">Loading…</p>;
  if (session.isError) return <p role="alert">{session.error.message}</p>;

  return (
    <div className="grid gap-10">
      {session.data ? (
        <OpenShift report={session.data} onExpense={() => setRecording(true)} />
      ) : (
        <StartOfDay />
      )}
      {user?.role === 'OWNER' && <ShiftHistory />}
      {recording && <ExpenseDialog onClose={() => setRecording(false)} />}
    </div>
  );
}
