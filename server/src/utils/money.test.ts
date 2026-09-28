import assert from 'node:assert/strict';
import { test } from 'node:test';
import { peso } from './money';

test('peso() formats centavos for people', () => {
  assert.equal(peso(51_000), '₱510.00');
  assert.equal(peso(5), '₱0.05');
  assert.equal(peso(0), '₱0.00');
  assert.equal(peso(123_456_789), '₱1,234,567.89');
});
