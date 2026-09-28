import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Nothing on screen. When the page is printed, this copy is the only thing on the paper
// (see .print-only in index.css).
export function PrintOnly({ children }: { children: ReactNode }) {
  return createPortal(<div className="print-only">{children}</div>, document.body);
}
