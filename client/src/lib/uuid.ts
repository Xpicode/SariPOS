// A random v4 UUID for idempotency keys. crypto.randomUUID() only exists on https:// or
// localhost, so a phone testing over the LAN (http://192.168...) wouldn't have it. Build the
// same thing from getRandomValues (available everywhere) in that case.
export function newUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4 (random)
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 9562 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
