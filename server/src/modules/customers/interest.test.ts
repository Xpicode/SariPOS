import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interestAmount } from './customers.service';

test('5% of ₱400 is ₱20', () => assert.equal(interestAmount(40_000, 500), 2_000));
test('rounded DOWN to the centavo: 2.5% of ₱3.33 is ₱0.08, not ₱0.09', () =>
  assert.equal(interestAmount(333, 250), 8));
test('nothing owed (or the store owes them): no interest', () => {
  assert.equal(interestAmount(0, 500), 0);
  assert.equal(interestAmount(-5_000, 500), 0);
});
