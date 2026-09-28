import { Store } from 'lucide-react';
import { cn } from '@/lib/utils';

// compact = just the icon (collapsed sidebar); the name stays for screen readers.
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Store className="size-4.5" aria-hidden />
      </span>
      <span className={cn('text-[17px] font-semibold tracking-tight', compact && 'sr-only')}>
        SariPOS
      </span>
    </span>
  );
}
