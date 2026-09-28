import type { ReactNode } from 'react';
import type { CashSession } from '@/api/types';
import { EXPENSE_LABEL } from '@/lib/expenses';
import { formatPeso } from '@/lib/money';
import { plural } from '@/lib/stock';
import { receiptStamp } from '@/lib/time';
import { cn } from '@/lib/utils';
import { BILLS, COINS, denomLabel, overShortText } from './denominations';

function Row({
  label,
  children,
  big,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  big?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4',
        big && 'text-lg font-bold',
        className,
      )}
    >
      <span>{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

const Hr = () => <hr className="my-3 border-dashed" />;
const count = (n: number, word = 'sale') => `(${n} ${plural(word, n)})`;

// The shift on paper. Open shift = "so far" (live); closed = the Z-report, the day's official
// cash record. Money the server hid (blind count) arrives as null and isn't drawn.
export function ZReport({ report: r }: { report: CashSession }) {
  const closed = r.status === 'CLOSED';
  const { sales } = r;
  const counted = [...BILLS, ...COINS].filter((d) => (r.cashCount?.[d] ?? 0) > 0);

  return (
    <article
      aria-label={closed ? `Z-report, shift ${r.id}` : 'Shift so far'}
      className="receipt-edge rounded-t-2xl bg-card px-5 pt-5 pb-6 font-mono text-[13px] leading-relaxed text-card-foreground"
    >
      <header className="text-center">
        <p className="font-sans text-base font-bold tracking-tight">SariPOS</p>
        <p className="font-semibold tracking-[0.14em]">
          {closed ? 'Z-REPORT' : 'SHIFT SO FAR'} · #{r.id}
        </p>
      </header>
      <div className="mt-3 text-muted-foreground">
        <Row label="Opened">
          {receiptStamp(new Date(r.openedAt))} · {r.openedBy}
        </Row>
        {closed && (
          <Row label="Closed">
            {receiptStamp(new Date(r.closedAt!))} · {r.closedBy}
          </Row>
        )}
      </div>

      <Hr />
      <p className="mb-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        In the drawer
      </p>
      <Row label="Opening cash">{formatPeso(r.openingCash)}</Row>
      <Row label={`Cash sales ${count(sales.cashCount)}`}>
        {sales.cashTotal === null ? '—' : `+${formatPeso(sales.cashTotal)}`}
      </Row>
      {r.utangPaymentCount > 0 && (
        <Row label={`Utang payments ${count(r.utangPaymentCount, 'payment')}`}>
          {r.utangPayments === null ? '—' : `+${formatPeso(r.utangPayments)}`}
        </Row>
      )}
      {r.ewalletCash !== null && r.ewalletCash !== 0 && (
        <Row label="GCash & load (cash)">
          {r.ewalletCash > 0 ? '+' : '−'}
          {formatPeso(Math.abs(r.ewalletCash))}
        </Row>
      )}
      {r.expenses.length > 0 && (
        <Row label={`Paid from drawer ${count(r.expenses.length, 'item')}`}>
          −{formatPeso(r.drawerExpenses)}
        </Row>
      )}

      <Hr />
      {r.expectedCash === null ? (
        <p className="text-muted-foreground">
          The expected amount is shown after the drawer is counted.
        </p>
      ) : (
        <Row label={closed ? 'EXPECTED' : 'EXPECTED NOW'} big>
          {formatPeso(r.expectedCash)}
        </Row>
      )}
      {closed && (
        <>
          <Row label="COUNTED" big>
            {formatPeso(r.actualCash!)}
          </Row>
          <Row
            label="RESULT"
            big
            className={cn(
              r.overShort! < 0 && 'text-destructive',
              r.overShort! > 0 && 'text-warning',
            )}
          >
            {overShortText(r.overShort!)}
          </Row>
        </>
      )}

      {(sales.gcashCount > 0 || sales.utangCount > 0 || sales.voidedCount > 0) && (
        <>
          <Hr />
          <p className="mb-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Not in the drawer
          </p>
          {sales.gcashCount > 0 && (
            <Row label={`GCash sales ${count(sales.gcashCount)}`}>
              {sales.gcashTotal === null ? '—' : formatPeso(sales.gcashTotal)}
            </Row>
          )}
          {sales.utangCount > 0 && (
            <Row label={`Utang sales ${count(sales.utangCount)}`}>
              {sales.utangTotal === null ? '—' : formatPeso(sales.utangTotal)}
            </Row>
          )}
          {sales.voidedCount > 0 && (
            <Row label={`Voided ${count(sales.voidedCount)}`}>
              {sales.voidedTotal === null ? '—' : formatPeso(sales.voidedTotal)}
            </Row>
          )}
        </>
      )}

      {r.expenses.length > 0 && (
        <>
          <Hr />
          <p className="mb-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Paid from the drawer
          </p>
          <ul className="grid gap-1.5">
            {r.expenses.map((e) => (
              <li key={e.id}>
                <Row label={EXPENSE_LABEL[e.category]}>−{formatPeso(e.amount)}</Row>
                <p className="break-words text-muted-foreground">
                  {e.note ? `${e.note} · ` : ''}
                  {e.createdBy}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {counted.length > 0 && (
        <>
          <Hr />
          <p className="mb-1 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Cash count
          </p>
          {counted.map((d) => (
            <Row key={d} label={`${denomLabel(d)} × ${r.cashCount![d]}`}>
              {formatPeso(d * r.cashCount![d])}
            </Row>
          ))}
        </>
      )}

      {r.notes && (
        <>
          <Hr />
          <p className="break-words">Notes: {r.notes}</p>
        </>
      )}
    </article>
  );
}
