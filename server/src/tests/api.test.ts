// Integration tests for the money paths (plan Phase 9): the real API + a real PostgreSQL test DB.
// Tests in this file run in order and build on each other, like one shift at the counter.
import { customerId, passwords, resetDb, startApi, stockOf, unitId } from './helpers'; // first
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';

let api: Awaited<ReturnType<typeof startApi>>;
let owner: string;
let cashier: string;
const pw = passwords();
const FORTUNE = 'Fortune International Red'; // tingi: stick ×1, pack ×20, ream ×200

before(async () => {
  resetDb();
  api = await startApi();
  owner = await api.login('owner', pw.owner);
  cashier = await api.login('cashier', pw.cashier);
  const open = await api.call('POST', '/cash-sessions/open', {
    token: cashier,
    body: { openingCash: 200_000 }, // ₱2,000 in the drawer
  });
  assert.equal(open.status, 201, JSON.stringify(open.body));
});
after(() => api.close());

const sell = (token: string, body: object) => api.call('POST', '/sales', { token, body });
const cash = (amountTendered: number) => ({ type: 'CASH', amountTendered });

describe('login', () => {
  test('wrong password: 401 with a message that does not say which part was wrong', async () => {
    const r = await api.call('POST', '/auth/login', {
      body: { username: 'owner', password: 'not-the-password' },
    });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.message, 'Wrong username or password');
  });

  test('unknown username gets the exact same answer', async () => {
    const r = await api.call('POST', '/auth/login', {
      body: { username: 'nobody', password: 'whatever1' },
    });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.message, 'Wrong username or password');
  });

  test('success: access token in the body, refresh token in an httpOnly strict cookie', async () => {
    const r = await api.call('POST', '/auth/login', {
      body: { username: 'owner', password: pw.owner },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.accessToken);
    assert.equal(r.body.data.user.role, 'OWNER');
    assert.equal(r.body.data.refreshToken, undefined, 'refresh token never in the body');
    const cookie = r.headers.get('set-cookie') ?? '';
    assert.match(cookie, /refresh_token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });

  test('a refresh token works once; reusing it ends every session of that user', async () => {
    const r = await api.call('POST', '/auth/login', {
      body: { username: 'owner', password: pw.owner },
    });
    const first = (r.headers.get('set-cookie') ?? '').split(';')[0];
    const ok = await api.call('POST', '/auth/refresh', { headers: { Cookie: first } });
    assert.equal(ok.status, 200);
    const second = (ok.headers.get('set-cookie') ?? '').split(';')[0];

    const replay = await api.call('POST', '/auth/refresh', { headers: { Cookie: first } });
    assert.equal(replay.status, 401, 'old token refused');
    const alsoDead = await api.call('POST', '/auth/refresh', { headers: { Cookie: second } });
    assert.equal(alsoDead.status, 401, 'the newest token was revoked too (possible theft)');
  });
});

describe('checkout', () => {
  const key = randomUUID();
  let saleId: number;

  test('2 packs sold: stock drops by 40 sticks, price comes from the database', async () => {
    const before = await stockOf(FORTUNE);
    const pack = await unitId(FORTUNE, 'pack');
    const r = await sell(cashier, {
      idempotencyKey: key,
      items: [{ productUnitId: pack, qty: 2 }],
      payment: cash(50_000),
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    saleId = r.body.data.sale.id;
    assert.equal(r.body.data.sale.total, 30_000); // 2 × ₱150
    assert.equal(r.body.data.sale.changeGiven, 20_000);
    assert.equal(await stockOf(FORTUNE), before - 40);
  });

  test('same request again (double tap / retry): the same sale comes back, nothing new', async () => {
    const before = await stockOf(FORTUNE);
    const r = await sell(cashier, {
      idempotencyKey: key,
      items: [{ productUnitId: await unitId(FORTUNE, 'pack'), qty: 2 }],
      payment: cash(50_000),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.replayed, true);
    assert.equal(r.body.data.sale.id, saleId);
    assert.equal(await stockOf(FORTUNE), before, 'stock not taken twice');
  });

  test('cash less than the total is refused', async () => {
    const r = await sell(cashier, {
      idempotencyKey: randomUUID(),
      items: [{ productUnitId: await unitId(FORTUNE, 'stick'), qty: 1 }],
      payment: cash(700),
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'NOT_ENOUGH_CASH');
  });

  test('insufficient stock: refused, and nothing is taken', async () => {
    const before = await stockOf(FORTUNE);
    const r = await sell(cashier, {
      idempotencyKey: randomUUID(),
      items: [{ productUnitId: await unitId(FORTUNE, 'ream'), qty: 50 }], // 10,000 sticks
      payment: cash(10_000_000),
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'INSUFFICIENT_STOCK');
    assert.equal(await stockOf(FORTUNE), before);
  });

  describe('void', () => {
    test('a cashier needs an owner PIN', async () => {
      const r = await api.call('POST', `/sales/${saleId}/void`, {
        token: cashier,
        body: { reason: 'Customer changed mind' },
      });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'PIN_REQUIRED');
    });

    test('a wrong PIN is refused', async () => {
      const wrong = pw.pin === '0000' ? '1111' : '0000';
      const r = await api.call('POST', `/sales/${saleId}/void`, {
        token: cashier,
        body: { reason: 'Customer changed mind', pin: wrong },
      });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'PIN_INVALID');
    });

    test('with the PIN: the sale stays (VOIDED) and the 40 sticks come back', async () => {
      const before = await stockOf(FORTUNE);
      const r = await api.call('POST', `/sales/${saleId}/void`, {
        token: cashier,
        body: { reason: 'Customer changed mind', pin: pw.pin },
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.data.sale.status, 'VOIDED');
      assert.equal(await stockOf(FORTUNE), before + 40);
    });

    test('voiding twice is refused (stock would come back twice)', async () => {
      const r = await api.call('POST', `/sales/${saleId}/void`, {
        token: owner,
        body: { reason: 'Again' },
      });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'ALREADY_VOIDED');
    });
  });
});

describe('utang limit', () => {
  const coke = () => unitId('Coca-Cola 1.5L', 'bottle'); // ₱75

  test('over the credit limit (7 × ₱75 = ₱525 > ₱500): refused', async () => {
    const r = await sell(cashier, {
      idempotencyKey: randomUUID(),
      items: [{ productUnitId: await coke(), qty: 7 }],
      payment: { type: 'UTANG', customerId: await customerId('Aling Nena') },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'CREDIT_LIMIT');
  });

  test('within the limit (₱450): allowed, and she now owes ₱450', async () => {
    const id = await customerId('Aling Nena');
    const r = await sell(cashier, {
      idempotencyKey: randomUUID(),
      items: [{ productUnitId: await coke(), qty: 6 }],
      payment: { type: 'UTANG', customerId: id },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const ledger = await api.call('GET', `/customers/${id}/ledger`, { token: owner });
    assert.equal(ledger.body.data.customer.balance, 45_000);
  });

  test('₱1 more is now over the limit (₱450 + ₱75 > ₱500)', async () => {
    const r = await sell(cashier, {
      idempotencyKey: randomUUID(),
      items: [{ productUnitId: await coke(), qty: 1 }],
      payment: { type: 'UTANG', customerId: await customerId('Aling Nena') },
    });
    assert.equal(r.body.error?.code, 'CREDIT_LIMIT');
  });

  test('a blocked customer gets no utang at all', async () => {
    const r = await sell(cashier, {
      idempotencyKey: randomUUID(),
      items: [{ productUnitId: await coke(), qty: 1 }],
      payment: { type: 'UTANG', customerId: await customerId('Kuya Jun') },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'CUSTOMER_BLOCKED');
  });
});

describe('GCash cash-out', () => {
  const gcash = 1; // seed: wallet 1 = GCash (₱5,000), fee ₱20 for ₱500.01–₱1,000
  const cashOut = (amount: number, ref: string) =>
    api.call('POST', '/ewallet/transactions', {
      token: cashier,
      body: {
        idempotencyKey: randomUUID(),
        type: 'CASH_OUT',
        accountId: gcash,
        amount,
        referenceNo: ref,
      },
    });
  const drawer = async () =>
    (await api.call('GET', '/cash-sessions/current', { token: owner })).body.data.session
      .expectedCash as number;
  const walletBalance = async () => {
    const r = await api.call('GET', '/ewallet/accounts', { token: owner });
    return r.body.data.accounts.find((a: { id: number }) => a.id === gcash).balance as number;
  };

  test('₱1,000 cash-out: GCash +₱1,000, drawer −₱980 (the ₱20 fee stays)', async () => {
    const [cashBefore, walletBefore] = [await drawer(), await walletBalance()];
    const r = await cashOut(100_000, 'REF-OUT-1');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.transaction.fee, 2_000);
    assert.equal(await walletBalance(), walletBefore + 100_000);
    assert.equal(await drawer(), cashBefore - 98_000);
  });

  test('more than the drawer holds: refused, and the cashier is not told how much is in it', async () => {
    const r = await cashOut(900_000, 'REF-OUT-2');
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'NOT_ENOUGH_CASH');
    assert.doesNotMatch(r.body.error.message, /₱/, 'blind count: no amount in the message');
  });

  test('the same GCash reference number cannot be used twice', async () => {
    const r = await cashOut(10_000, 'REF-OUT-1');
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'DUPLICATE_REFERENCE');
  });
});
