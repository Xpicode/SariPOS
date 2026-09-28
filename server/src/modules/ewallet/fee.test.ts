// Run: npm test   (node's built-in test runner; no test library needed)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeFee, eloadCommission, quote, type FeeRule } from './fee';

const c = (pesos: number) => Math.round(pesos * 100);

// Same brackets as the seed: ₱10 per ₱500, up to ₱10,000 (₱0.01–₱500 = ₱10, ₱500.01–₱1,000 = ₱20…)
const rules: FeeRule[] = Array.from({ length: 20 }, (_, i) => ({
  minAmount: i * c(500) + 1,
  maxAmount: (i + 1) * c(500),
  fee: (i + 1) * c(10),
}));

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return 'no error';
};

describe('computeFee (plan: edge amounts ₱1, ₱500, ₱501, max)', () => {
  it('₱1 -> ₱10', () => assert.equal(computeFee(c(1), rules), c(10)));
  it('₱500 -> ₱10 (top of the first bracket)', () =>
    assert.equal(computeFee(c(500), rules), c(10)));
  it('₱500.01 -> ₱20 (one centavo into the next)', () =>
    assert.equal(computeFee(c(500) + 1, rules), c(20)));
  it('₱501 -> ₱20', () => assert.equal(computeFee(c(501), rules), c(20)));
  it('₱10,000 (the max) -> ₱200', () => assert.equal(computeFee(c(10_000), rules), c(200)));
  it('₱10,000.01 -> NO_FEE_RULE', () =>
    assert.equal(
      code(() => computeFee(c(10_000) + 1, rules)),
      'NO_FEE_RULE',
    ));
  it('no rules at all -> NO_FEE_RULE', () =>
    assert.equal(
      code(() => computeFee(c(100), [])),
      'NO_FEE_RULE',
    ));
});

describe('eloadCommission', () => {
  it('₱100 at 3% -> ₱3', () => assert.equal(eloadCommission(c(100), 300), c(3)));
  it('₱15 at 3% -> ₱0.45', () => assert.equal(eloadCommission(c(15), 300), 45));
  it('rounds down: ₱0.01 at 50% -> 0 (never the whole amount)', () =>
    assert.equal(eloadCommission(1, 5000), 0));
});

// Plan 6.4, row by row: wallet change, drawer change, what the store earns.
describe('quote = the money-flow table', () => {
  it('Cash-in ₱500: wallet −500, drawer +510, earns 10', () =>
    assert.deepEqual(quote('CASH_IN', c(500), { rules }), {
      fee: c(10),
      walletChange: -c(500),
      cashChange: c(510),
    }));
  it('Cash-out ₱500: wallet +500, drawer −490, earns 10', () =>
    assert.deepEqual(quote('CASH_OUT', c(500), { rules }), {
      fee: c(10),
      walletChange: c(500),
      cashChange: -c(490),
    }));
  it('E-load ₱100 at 3%: wallet −97, drawer +100, earns 3', () =>
    assert.deepEqual(quote('ELOAD', c(100), { commissionBp: 300 }), {
      fee: c(3),
      walletChange: -c(97),
      cashChange: c(100),
    }));
  it('Top-up ₱2,000 from the drawer: wallet +2000, drawer −2000', () =>
    assert.deepEqual(quote('TOP_UP', c(2000), { drawer: true }), {
      fee: 0,
      walletChange: c(2000),
      cashChange: -c(2000),
    }));
  it('Top-up from the bank: the drawer is untouched', () =>
    assert.equal(quote('TOP_UP', c(2000)).cashChange, 0));
  it('Withdraw ₱1,000 into the drawer: wallet −1000, drawer +1000', () =>
    assert.deepEqual(quote('WITHDRAW', c(1000), { drawer: true }), {
      fee: 0,
      walletChange: -c(1000),
      cashChange: c(1000),
    }));
  it('store earnings = both pockets added up, for every type', () => {
    for (const [type, opts] of [
      ['CASH_IN', { rules }],
      ['CASH_OUT', { rules }],
      ['ELOAD', { commissionBp: 300 }],
    ] as const) {
      const q = quote(type, c(750), opts);
      assert.equal(q.walletChange + q.cashChange, q.fee, type);
    }
  });
  it('cash-out of ₱10 with a ₱10 fee -> AMOUNT_TOO_SMALL', () =>
    assert.equal(
      code(() => quote('CASH_OUT', c(10), { rules })),
      'AMOUNT_TOO_SMALL',
    ));
});
