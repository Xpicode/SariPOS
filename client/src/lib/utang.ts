import { formatPeso } from './money';
import { formatLongDate } from './time';

// The text the owner pastes into Messenger / SMS. Polite Taglish, like a real sari-sari store.
export const reminderText = (name: string, balance: number, today = new Date()) =>
  `Hi ${name}! Paalala lang po mula sa tindahan: ang utang ninyo ay ${formatPeso(balance)} ` +
  `(as of ${formatLongDate(today)}). Pwede po kayong magbayad kahit paunti-unti. Salamat po!`;

// How much of the limit is used, 0–100, for the bar.
export const limitUsed = (balance: number, limit: number) =>
  limit <= 0 ? (balance > 0 ? 100 : 0) : Math.min(100, Math.max(0, Math.round((balance / limit) * 100)));
