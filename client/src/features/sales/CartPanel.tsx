import { Minus, Plus, Trash2 } from 'lucide-react';
import { NativeSelect } from '@/components/NativeSelect';
import { Button } from '@/components/ui/button';
import { formatPeso } from '@/lib/money';
import { formatStock, plural } from '@/lib/stock';
import {
  cartTotal,
  changeUnit,
  itemCount,
  lineTotal,
  MAX_QTY,
  removeLine,
  setQty,
  shortages,
  unitOf,
  type CartLine,
} from './cart';

function CartRow({
  line,
  shortBy,
  onChange,
}: {
  line: CartLine;
  shortBy?: { stock: number };
  onChange: (update: (cart: CartLine[]) => CartLine[]) => void;
}) {
  const { product, qty } = line;
  const unit = unitOf(line);
  const name = product.name;

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] leading-snug font-semibold break-words">{name}</p>
          <p className="font-mono text-sm text-muted-foreground tabular-nums">
            {formatPeso(unit.priceCentavos)} / {unit.unitName}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[15px] font-semibold tabular-nums">
          {formatPeso(lineTotal(line))}
        </p>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        {product.units.length > 1 && (
          <NativeSelect
            aria-label={`Unit for ${name}`}
            value={line.unitId}
            onChange={(e) => onChange((c) => changeUnit(c, line.unitId, Number(e.target.value)))}
            className="h-10 w-28 pl-3 text-sm"
          >
            {product.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unitName}
              </option>
            ))}
          </NativeSelect>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-full"
            aria-label={`One less ${name}`}
            disabled={qty <= 1}
            onClick={() => onChange((c) => setQty(c, line.unitId, qty - 1))}
          >
            <Minus />
          </Button>
          <input
            aria-label={`Quantity of ${name}`}
            inputMode="numeric"
            value={qty}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value.replace(/\D/g, ''), 10);
              if (!Number.isNaN(n)) onChange((c) => setQty(c, line.unitId, n));
            }}
            className="h-10 w-12 rounded-lg bg-transparent text-center font-mono text-base font-semibold tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-full"
            aria-label={`One more ${name}`}
            disabled={qty >= MAX_QTY}
            onClick={() => onChange((c) => setQty(c, line.unitId, qty + 1))}
          >
            <Plus />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${name}`}
          onClick={() => onChange((c) => removeLine(c, line.unitId))}
        >
          <Trash2 />
        </Button>
      </div>

      {shortBy && (
        <p className="mt-1.5 text-sm font-semibold text-warning">
          Only {formatStock(shortBy.stock, product.units, product.baseUnit)} in stock
        </p>
      )}
    </li>
  );
}

// The sale being rung up, drawn as the receipt that will print.
export function CartPanel({
  cart,
  onChange,
  onPay,
}: {
  cart: CartLine[];
  onChange: (update: (cart: CartLine[]) => CartLine[]) => void;
  onPay: () => void;
}) {
  const short = shortages(cart);
  const count = itemCount(cart);

  return (
    <section aria-labelledby="cart-title" className="receipt-outline">
      <div className="receipt-edge rounded-t-2xl bg-card">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-dashed pr-2 pl-5">
          <h2
            id="cart-title"
            className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase"
          >
            Current sale · {count} {plural('item', count)}
          </h2>
          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                window.confirm('Remove everything from this sale?') && onChange(() => [])
              }
            >
              Clear
            </Button>
          )}
        </header>

        {cart.length === 0 ? (
          <p className="px-5 py-12 text-center text-[15px] text-muted-foreground">
            Scan a barcode or tap a product to start a sale.
          </p>
        ) : (
          <ul className="max-h-[min(52dvh,560px)] divide-y divide-dashed overflow-y-auto">
            {cart.map((l) => (
              <CartRow
                key={l.unitId}
                line={l}
                shortBy={short.get(l.product.id)}
                onChange={onChange}
              />
            ))}
          </ul>
        )}

        <footer className="border-t border-dashed px-5 pt-4 pb-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-muted-foreground">Total</span>
            <span className="font-mono text-3xl font-bold tracking-tight tabular-nums">
              {formatPeso(cartTotal(cart))}
            </span>
          </div>
          <Button
            size="lg"
            className="mt-4 h-14 w-full text-lg"
            disabled={cart.length === 0}
            onClick={onPay}
            aria-keyshortcuts="F9"
          >
            Pay
            <kbd
              aria-hidden
              className="ml-1 hidden rounded border border-primary-foreground/40 px-1.5 font-mono text-xs lg:inline"
            >
              F9
            </kbd>
          </Button>
        </footer>
      </div>
    </section>
  );
}
