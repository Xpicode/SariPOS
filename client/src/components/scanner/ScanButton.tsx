import { LoaderCircle, ScanBarcode } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Separate chunk: the scanner + decoder download only the first time the camera is opened.
const BarcodeScanner = lazy(() => import('./BarcodeScanner'));

export function ScanButton({
  onScan,
  label = 'Scan barcode',
}: {
  onScan: (code: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <ScanBarcode className="size-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan a barcode</DialogTitle>
            <DialogDescription>Point the back camera at the barcode.</DialogDescription>
          </DialogHeader>
          {/* Only mounted while open, so the camera turns off when the dialog closes. */}
          {open && (
            <Suspense
              fallback={
                <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-muted">
                  <LoaderCircle className="size-6 animate-spin" aria-label="Starting camera" />
                </div>
              }
            >
              <BarcodeScanner
                onDetected={(code) => {
                  setOpen(false);
                  onScan(code);
                }}
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
