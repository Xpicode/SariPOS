import type { ReactNode } from 'react';
import type { Sale } from '@/api/types';
import { PrintOnly } from '@/components/PrintOnly';
import { formatPeso } from '@/lib/money';
import { PAYMENT_LABEL } from '@/lib/payments';
import { plural } from '@/lib/stock';
import { receiptStamp } from '@/lib/time';
import { cn } from '@/lib/utils';

function Row({ label, children, big }: { label: string; children: ReactNode; big?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', big && 'text-lg font-bold')}>
      <span>{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

// A thermal-printer slip. Same look on screen and on paper (see .print-only in index.css).
export function Receipt({ sale }: { sale: Sale }) {
  const voided = sale.status === 'VOIDED';
  return (
    <article
      aria-label={`Receipt ${sale.saleNo}`}
      className="receipt-edge relative rounded-t-2xl bg-card px-5 pt-5 pb-6 font-mono text-[13px] leading-relaxed text-card-foreground"
    >
      <header className="text-center">
        <p className="font-sans text-base font-bold tracking-tight">SariPOS</p>
        <p className="font-semibold">{sale.saleNo}</p>
        <p className="text-muted-foreground">{receiptStamp(new Date(sale.createdAt))}</p>
        <p className="text-muted-foreground">Cashier: {sale.cashierName}</p>
      </header>

      <hr className="my-3 border-dashed" />
      <ul className="grid gap-2">
        {sale.items.map((item, i) => (
          <li key={i}>
            <p className="font-semibold break-words">{item.productName}</p>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <span>
                {item.qty} {plural(item.unitName, item.qty)} × {formatPeso(item.unitPrice)}
              </span>
              <span className="text-card-foreground tabular-nums">
                {formatPeso(item.lineTotal)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <hr className="my-3 border-dashed" />
      <Row label="TOTAL" big>
        {formatPeso(sale.total)}
      </Row>
      {sale.paymentType === 'CASH' ? (
        <>
          <Row label="Cash">{formatPeso(sale.amountTendered ?? 0)}</Row>
          <Row label="Change">{formatPeso(sale.changeGiven ?? 0)}</Row>
        </>
      ) : (
        <>
          <Row label="Paid by">{PAYMENT_LABEL[sale.paymentType]}</Row>
          {sale.gcashRefNo && <Row label="Ref no.">{sale.gcashRefNo}</Row>}
        </>
      )}

      {voided && (
        <>
          <hr className="my-3 border-dashed" />
          <p className="font-semibold text-destructive">VOIDED by {sale.voidedBy}</p>
          <p className="break-words text-muted-foreground">{sale.voidReason}</p>
          {/* The rubber stamp. Decorative: the text above says the same for screen readers. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-12 rounded-lg border-4 border-destructive px-4 py-1 font-sans text-3xl font-black tracking-widest text-destructive opacity-80"
          >
            VOIDED
          </span>
        </>
      )}

      <hr className="my-3 border-dashed" />
      <p className="text-center text-muted-foreground">Salamat po! Balik po kayo.</p>
    </article>
  );
}

export function PrintableReceipt({ sale }: { sale: Sale }) {
  return (
    <PrintOnly>
      <Receipt sale={sale} />
    </PrintOnly>
  );
}
