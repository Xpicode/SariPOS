import { AppError } from '../../utils/AppError';
import { peso } from '../../utils/money';

// PURE functions: no database, no clock. The same input always gives the same answer, so they are
// easy to test (fee.test.ts), and the fee preview and the real transaction can never disagree.

export type TxnType = 'CASH_IN' | 'CASH_OUT' | 'ELOAD' | 'TOP_UP' | 'WITHDRAW';
export type FeeRule = { minAmount: number; maxAmount: number; fee: number };

// Tiered GCash fee: the fee of the bracket the amount falls in. (Brackets never overlap: the
// database's EXCLUDE rule on fee_rules guarantees one fee per amount.)
export function computeFee(amount: number, rules: FeeRule[]): number {
  const rule = rules.find((r) => amount >= r.minAmount && amount <= r.maxAmount);
  if (!rule) {
    const max = Math.max(0, ...rules.map((r) => r.maxAmount));
    throw new AppError(
      400,
      'NO_FEE_RULE',
      max > 0 && amount > max
        ? `The most per transaction is ${peso(max)}`
        : `No fee is set for ${peso(amount)}. The owner can add it in Fee rules.`,
    );
  }
  return rule.fee;
}

// Load: the store keeps a percentage, in basis points (300 = 3%). ₱100 at 3% -> ₱3.
// Rounded DOWN: profit is never overstated, and it always stays below the load amount.
export const eloadCommission = (amount: number, bp: number) => Math.floor((amount * bp) / 10_000);

// How the customer pays the service fee: cash into the drawer (default), or sent by GCash to
// the store's wallet. Only cash-in and cash-out have a customer-paid fee.
export type FeeVia = 'CASH' | 'GCASH';

// Plan 6.4, the two pockets: what one transaction does to the e-wallet and to the cash drawer.
// (Migration 0011's money_flow CHECK enforces exactly these formulas in the database.)
export function moneyFlow(
  type: TxnType,
  amount: number,
  fee: number,
  { drawer = false, feeVia = 'CASH' }: { drawer?: boolean; feeVia?: FeeVia } = {},
) {
  const gcashFee = feeVia === 'GCASH';
  switch (type) {
    case 'CASH_IN': // customer hands over ₱500 (+ ₱10 fee in cash, or by GCash), store sends ₱500
      return gcashFee
        ? { walletChange: fee - amount, cashChange: amount }
        : { walletChange: -amount, cashChange: amount + fee };
    case 'CASH_OUT': // customer sends ₱500 (+ ₱10 fee by GCash) and gets ₱500 cash (or ₱490)
      return gcashFee
        ? { walletChange: amount + fee, cashChange: -amount }
        : { walletChange: amount, cashChange: fee - amount };
    case 'ELOAD': // customer pays ₱100 cash, the load wallet spends ₱97
      return { walletChange: fee - amount, cashChange: amount };
    case 'TOP_UP': // owner adds money to the wallet, from the drawer or from elsewhere (bank)
      return { walletChange: amount, cashChange: drawer ? -amount : 0 };
    case 'WITHDRAW': // owner takes money out of the wallet, into the drawer or elsewhere
      return { walletChange: -amount, cashChange: drawer ? amount : 0 };
  }
}

// Everything the counter needs to know before confirming: the fee and both pocket changes.
// `fee` = a fee the OWNER typed instead of the fee rules (checked in the service, not here).
export function quote(
  type: TxnType,
  amount: number,
  opts: {
    rules?: FeeRule[];
    commissionBp?: number;
    drawer?: boolean;
    feeVia?: FeeVia;
    fee?: number;
  } = {},
) {
  const hasFee = type === 'CASH_IN' || type === 'CASH_OUT';
  const feeVia = hasFee ? (opts.feeVia ?? 'CASH') : 'CASH';
  const fee = hasFee
    ? (opts.fee ?? computeFee(amount, opts.rules ?? []))
    : type === 'ELOAD'
      ? eloadCommission(amount, opts.commissionBp ?? 0)
      : 0;
  // A ₱10 cash-out with a ₱10 fee taken from the cash would hand over nothing (or less).
  if (type === 'CASH_OUT' && feeVia === 'CASH' && fee >= amount) {
    throw new AppError(400, 'AMOUNT_TOO_SMALL', `Too small: the fee alone is ${peso(fee)}`);
  }
  return { fee, feeVia, ...moneyFlow(type, amount, fee, { drawer: opts.drawer, feeVia }) };
}
