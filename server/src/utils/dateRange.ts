import { z } from 'zod';
import { todayInManila } from './time';

// ?from=YYYY-MM-DD&to=YYYY-MM-DD in store (Manila) dates, for the owner's lists.
export const dateRangeSchema = z
  .object({ from: z.iso.date().optional(), to: z.iso.date().optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, '"from" must be on or before "to"')
  .refine(
    (q) => !q.from || !q.to || Date.parse(q.to) - Date.parse(q.from) <= 92 * 86_400_000,
    'Pick at most about 3 months at a time',
  );

export type DateRange = z.infer<typeof dateRangeSchema>;

// Missing dates: only one given = that single day; none = today.
export function resolveRange(q: DateRange) {
  const from = q.from ?? q.to ?? todayInManila();
  return { from, to: q.to ?? from };
}

// SQL for "created_at falls on these store days", as a timestamp range so indexes still work.
// $from / $to are the placeholders for the two dates.
export const inStoreDays = (column: string, from: string, to: string) =>
  `${column} >= (${from}::date::timestamp AT TIME ZONE 'Asia/Manila')
   AND ${column} < ((${to}::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')`;
