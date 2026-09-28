import type { Product } from '@/api/types';
import { cn } from '@/lib/utils';

// Out of stock > low stock > nothing. Inactive products say so instead.
export function StockBadge({ product, className }: { product: Product; className?: string }) {
  const [label, tone] = !product.isActive
    ? ['Inactive', 'bg-muted text-muted-foreground']
    : product.stockQty === 0
      ? ['Out of stock', 'bg-destructive/10 text-destructive']
      : product.isLowStock
        ? ['Low stock', 'bg-warning-soft text-warning']
        : [null, ''];
  if (!label) return null;
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold',
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
