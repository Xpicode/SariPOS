import { Store } from 'lucide-react';

export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Store className="size-4.5" aria-hidden />
      </span>
      <span className="text-[17px] font-semibold tracking-tight">SariPOS</span>
    </span>
  );
}
