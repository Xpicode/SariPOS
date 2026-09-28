import { useEffect, useState } from 'react';

// The DB stores UTC; people read Philippine time. Convert only when displaying.
const TZ = 'Asia/Manila';

const dateFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const clockFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const longDateFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const hourFmt = new Intl.DateTimeFormat('en-PH', { timeZone: TZ, hour: 'numeric', hour12: false });

// "SEP 28, 2026 · 09:41", printed like a receipt header (short enough for a phone)
export const receiptStamp = (d: Date) => `${dateFmt.format(d)} · ${clockFmt.format(d)}`;

export const formatClock = (iso: string) => clockFmt.format(new Date(iso));

// "2026-09-28": today's date in the store, the format <input type="date"> uses.
export const todayInManila = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

// "2026-09-28" moved by whole days: addDays('2026-09-28', -30) -> "2026-08-29".
// Done in UTC on purpose: a plain date has no time zone, so no daylight-saving surprises.
export const addDays = (ymd: string, days: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const dateTimeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
// "Sep 28, 10:32 AM"
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

// "2026-10-05" (a date without time) -> "Oct 5, 2026"
export const formatDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const formatLongDate = (d: Date) => longDateFmt.format(d);

export function greeting(d: Date) {
  const h = Number(hourFmt.format(d)) % 24;
  if (h < 12) return 'Magandang umaga';
  if (h < 13) return 'Magandang tanghali';
  if (h < 18) return 'Magandang hapon';
  return 'Magandang gabi';
}

// Re-renders every `ms` so clocks stay current.
export function useNow(ms = 10_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
