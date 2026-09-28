import { formatPeso } from './money';
import { formatLongDate } from './time';

// The text the owner pastes into Messenger / SMS. Polite Taglish, like a real sari-sari store.
export const reminderText = (name: string, balance: number, today = new Date()) =>
  `Hi ${name}! Paalala lang po mula sa tindahan: ang utang ninyo ay ${formatPeso(balance)} ` +
  `(as of ${formatLongDate(today)}). Pwede po kayong magbayad kahit paunti-unti. Salamat po!`;

// How much of the limit is used, 0–100, for the bar.
export const limitUsed = (balance: number, limit: number) =>
  limit <= 0
    ? balance > 0
      ? 100
      : 0
    : Math.min(100, Math.max(0, Math.round((balance / limit) * 100)));

// Overdue = the promised date has passed (store time, decided by the server) and they still owe.
export const isOverdue = (c: { pastDue: boolean; balance: number }) => c.pastDue && c.balance > 0;

// Interest the owner would add: same rule as the server (basis points, rounded DOWN).
export const interestPreview = (balance: number, bp: number) =>
  Math.max(0, Math.floor((balance * bp) / 10_000));

// Whole days between a due date and today, both "YYYY-MM-DD": 1 = was due yesterday.
export const daysLate = (dueDate: string, today: string) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);

// "5%" / "2.5%" for people (formatBp shows "5.00%", fine for settings, fussy on a warning).
export const percentLabel = (bp: number) =>
  `${(bp / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
