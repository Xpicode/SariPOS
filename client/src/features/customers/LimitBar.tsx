import type { Customer } from '@/api/types';
import { formatPeso } from '@/lib/money';
import { limitUsed } from '@/lib/utang';
import { cn } from '@/lib/utils';

// How much of their utang limit a customer has used. The text says it too (not color alone).
export function LimitBar({
  c,
  className,
}: {
  c: Pick<Customer, 'balance' | 'creditLimit' | 'isBlocked'>;
  className?: string;
}) {
  const used = limitUsed(c.balance, c.creditLimit);
  const room = Math.max(0, c.creditLimit - c.balance);
  return (
    <div className={cn('grid gap-1', className)}>
      <div
        role="meter"
        aria-label="Utang limit used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={used}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full',
            used >= 100 ? 'bg-destructive' : used >= 80 ? 'bg-warning' : 'bg-primary',
          )}
          style={{ width: `${used}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {c.isBlocked
          ? 'No new utang (blocked)'
          : room > 0
            ? `Can still borrow ${formatPeso(room)}`
            : 'Limit reached'}{' '}
        · limit {formatPeso(c.creditLimit)}
      </p>
    </div>
  );
}
