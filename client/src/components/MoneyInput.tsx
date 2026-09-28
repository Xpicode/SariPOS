import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// A text box for pesos. Text, not type="number": number inputs accept "1e5", change value on
// mouse-wheel scroll, and round decimals differently per browser. inputMode shows the
// number keypad with a decimal point on phones.
export function MoneyInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-muted-foreground"
        aria-hidden
      >
        ₱
      </span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        className={cn('pl-8 font-mono tabular-nums', className)}
        {...props}
      />
    </div>
  );
}
