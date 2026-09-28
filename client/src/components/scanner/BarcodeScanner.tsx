import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
// The decoder (.wasm, ~1 MB) is served from OUR build, not the library's default CDN:
// no third party can swap the code, and scanning doesn't depend on someone else's server.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { BARCODE_RE } from '@/features/products/queries';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasmUrl : prefix + path,
  },
});

// Product barcodes (EAN/UPC on groceries, Code 128 on cartons) plus QR.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

function cameraError(err: unknown) {
  const name = (err as { name?: string }).name;
  if (name === 'NotAllowedError') {
    return 'Camera access is blocked. Allow it in the browser settings, or type the barcode instead.';
  }
  if (name === 'NotFoundError') return 'No camera found on this device. Type the barcode instead.';
  if (name === 'NotReadableError') return 'The camera is being used by another app.';
  return 'Couldn’t start the camera. Type the barcode instead.';
}

// Loaded lazily (see ScanButton) so the decoder only downloads when someone opens the camera.
export default function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(
    // Browsers only allow the camera on https:// or localhost.
    navigator.mediaDevices ? null : 'The camera needs a secure (https) connection.',
  );
  const handleDetected = useEffectEvent(onDetected);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const detector = new BarcodeDetector({ formats: FORMATS as never });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }, // back camera on phones
          audio: false,
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop()); // closed while asking
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const scan = async () => {
          if (stopped) return;
          try {
            const [hit] = await detector.detect(video);
            // A QR code can hold anything (a link, a script). Only accept what looks like a
            // product barcode; it is only ever used as a search value, never opened.
            const code = hit?.rawValue.trim();
            if (code && BARCODE_RE.test(code)) {
              stopped = true;
              navigator.vibrate?.(60);
              handleDetected(code);
              return;
            }
          } catch {
            // a frame that couldn't be read; try the next one
          }
          timer = setTimeout(scan, 150); // ~6 tries a second: fast enough, easy on the battery
        };
        scan();
      } catch (err) {
        if (!stopped) setError(cameraError(err));
      }
    })();

    // Closing the scanner must switch the camera OFF (the light next to it goes out).
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-2xl bg-muted px-4 py-6 text-center text-[15px]">
        {error}
      </p>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        muted
        playsInline // iPhone: play inside the page, not fullscreen
        className="aspect-[4/3] w-full object-cover"
      />
      {/* Aiming guide */}
      <div
        className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80"
        aria-hidden
      />
    </div>
  );
}
