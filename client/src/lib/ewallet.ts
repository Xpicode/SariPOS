import type { EwalletTxnType, Telco, WalletKind } from '@/api/types';

export const TXN_LABEL: Record<EwalletTxnType, string> = {
  CASH_IN: 'Cash-in',
  CASH_OUT: 'Cash-out',
  ELOAD: 'Load',
  TOP_UP: 'Top-up',
  WITHDRAW: 'Withdraw',
};

export const WALLET_KIND_LABEL: Record<WalletKind, string> = {
  GCASH: 'GCash',
  MAYA: 'Maya',
  ELOAD: 'Load wallet',
};

export const TELCOS: { value: Telco; label: string }[] = [
  { value: 'GLOBE', label: 'Globe' },
  { value: 'TM', label: 'TM' },
  { value: 'SMART', label: 'Smart' },
  { value: 'TNT', label: 'TNT' },
  { value: 'DITO', label: 'DITO' },
];

// Same rules as the server, checked before it normalizes ("+63 917…" -> "0917…").
export const MOBILE_RE = /^(09|\+?639)\d{9}$/;
export const REF_RE = /^[0-9A-Za-z-]{4,40}$/;

// "09171234567" -> "0917 123 4567", easy to read back to the customer. Masked ones stay as is.
export const formatMobile = (n: string) =>
  /^09\d{9}$/.test(n) ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : n;

// Load commission in basis points: 300 <-> "3.00%"
export const formatBp = (bp: number) => `${(bp / 100).toFixed(2)}%`;

// "3" / "3.5" / "2.75%" -> 300 / 350 / 275. Invalid or over 50% -> null.
export function parseBp(input: string): number | null {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?%?$/.exec(input.trim());
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bp <= 5000 ? bp : null;
}

// Per-type totals for the breakdown table: how many, how much money moved, how much the store
// earned. Fixed order (counter types first); types with no transactions are left out.
const BREAKDOWN_ORDER: EwalletTxnType[] = ['CASH_IN', 'CASH_OUT', 'ELOAD', 'TOP_UP', 'WITHDRAW'];
export function breakdown(txns: { type: EwalletTxnType; amount: number; fee: number }[]) {
  const rows = BREAKDOWN_ORDER.map((type) => {
    const of = txns.filter((t) => t.type === type);
    return {
      type,
      count: of.length,
      amount: of.reduce((s, t) => s + t.amount, 0),
      fee: of.reduce((s, t) => s + t.fee, 0),
    };
  }).filter((r) => r.count > 0);
  return { rows, totalFee: rows.reduce((s, r) => s + r.fee, 0) };
}

// The mobile number box: digits only, at most 11 (09171234567). A pasted "+63 917 123 4567" or
// "0917-123-4567" becomes 09171234567, so the cashier never has to fix it by hand.
export const mobileDigits = (raw: string) =>
  raw
    .replace(/\D/g, '')
    .replace(/^63(?=9)/, '0')
    .slice(0, 11);
