import { pool } from '../../db/pool';
import { resolveRange, type DateRange } from '../../utils/dateRange';
import { todayInManila } from '../../utils/time';
import { listWallets } from '../ewallet/ewallet.repository';
import type { AuditQuery } from './reports.schema';
import * as repo from './reports.repository';

const days = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Charts default to the last 30 store days; the other reports to today.
function range(q: DateRange, defaultDays = 1) {
  if (!q.from && !q.to && defaultDays > 1) {
    const to = todayInManila();
    return { from: addDays(to, 1 - defaultDays), to };
  }
  return resolveRange(q);
}

// Plan 6.7:
//   product profit = sales − cost of what was sold (completed sales)
//   GCash profit   = fees on cash-in / cash-out;  load profit = commission
//   net profit     = product + GCash + load − business expenses
// OWNER_WITHDRAWAL is the owner taking money home: it left the store, but it isn't a cost, so it
// is shown separately and NOT subtracted.
export async function profit(q: DateRange) {
  const { from, to } = range(q);
  const parts = await repo.profitParts(pool, from, to);
  const earned = (types: string[]) => {
    const rows = parts.ewallet.filter((r) => types.includes(r.type));
    return {
      count: rows.reduce((s, r) => s + r.count, 0),
      earned: rows.reduce((s, r) => s + r.earned, 0),
    };
  };
  const products = { ...parts.products, profit: parts.products.revenue - parts.products.cost };
  const gcash = earned(['CASH_IN', 'CASH_OUT']);
  const eload = earned(['ELOAD']);
  const business = parts.expenses.filter((e) => e.category !== 'OWNER_WITHDRAWAL');
  const businessTotal = business.reduce((s, e) => s + e.total, 0);
  const withdrawals = parts.expenses.find((e) => e.category === 'OWNER_WITHDRAWAL')?.total ?? 0;
  return {
    from,
    to,
    products,
    gcash,
    eload,
    expenses: { byCategory: business, total: businessTotal },
    ownerWithdrawals: withdrawals,
    netProfit: products.profit + gcash.earned + eload.earned - businessTotal,
  };
}

export async function productSales(q: DateRange) {
  const { from, to } = range(q);
  return { from, to, products: await repo.productSales(pool, from, to) };
}

export async function salesTrend(q: DateRange) {
  const { from, to } = range(q, 30);
  return { from, to, days: await repo.salesTrend(pool, from, to) };
}

export async function peakHours(q: DateRange) {
  const { from, to } = range(q, 30);
  return { from, to, days: days(from, to), hours: await repo.peakHours(pool, from, to) };
}

// The owner's "today" at a glance.
export async function dashboard() {
  const today = todayInManila();
  const [todayProfit, counts, wallets, topUtang] = await Promise.all([
    profit({ from: today, to: today }),
    repo.transactionCounts(pool, today, today),
    listWallets(pool),
    repo.topUtang(pool),
  ]);
  return {
    day: today,
    sales: todayProfit.products.revenue,
    netProfit: todayProfit.netProfit,
    transactions: counts,
    wallets,
    topUtang,
  };
}

const AUDIT_PAGE = 100;

export async function auditLog(q: AuditQuery) {
  // One extra row tells whether there's an older page, without a COUNT(*) over the whole log.
  const rows = await repo.auditLog(pool, q, AUDIT_PAGE + 1);
  return {
    entries: rows.slice(0, AUDIT_PAGE),
    hasMore: rows.length > AUDIT_PAGE,
    actions: await repo.auditActions(pool),
  };
}
