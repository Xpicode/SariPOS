import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expectedCash } from './cash-sessions.service';

type Totals = Parameters<typeof expectedCash>[1];

// A shift where nothing happened; each test changes only what it's about.
const quiet: Totals = {
  cashSales: 0,
  cashCount: 0,
  gcashSales: 0,
  gcashCount: 0,
  voidedTotal: 0,
  voidedCount: 0,
  utangSales: 0,
  utangCount: 0,
  utangPayments: 0,
  utangPaymentCount: 0,
  ewalletCash: 0,
  ewalletCount: 0,
  drawerExpenses: 0,
};

test('nothing sold: the drawer should still hold the opening cash', () => {
  assert.equal(expectedCash(100_000, quiet), 100_000);
});

test('plan 6.5: opening + cash sales + utang payments + e-wallet cash − drawer expenses', () => {
  const t = { ...quiet, cashSales: 50_000, utangPayments: 20_000, ewalletCash: 3_000 };
  assert.equal(expectedCash(100_000, { ...t, drawerExpenses: 15_000 }), 158_000);
});

test('GCash sales, utang sales and voided sales put no cash in the drawer', () => {
  const t = { ...quiet, gcashSales: 99_000, utangSales: 88_000, voidedTotal: 77_000 };
  assert.equal(expectedCash(100_000, t), 100_000);
});

test('a GCash cash-out TAKES cash out of the drawer (ewalletCash is negative)', () => {
  // Customer cashes out ₱1,000, pays a ₱20 fee: the drawer gives ₱980.
  assert.equal(expectedCash(100_000, { ...quiet, ewalletCash: -98_000 }), 2_000);
});
