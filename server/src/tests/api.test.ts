// Integration tests for the money paths (plan Phase 9): the real API + a real PostgreSQL test DB.
// Tests in this file run in order and build on each other, like one shift at the counter.
import { customerId, passwords, resetDb, startApi, stockOf, unitId } from './helpers'; // first
import { pool } from '../db/pool';
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

describe('GCash form: fee paid by GCash, owner-only fee, customer name', () => {
  const gcash = 1;
  const cashIn = (token: string, extra: object) =>
    api.call('POST', '/ewallet/transactions', {
      token,
      body: {
        idempotencyKey: randomUUID(),
        type: 'CASH_IN',
        accountId: gcash,
        amount: 50_000, // ₱500, fee ₱10 by the seed's rules
        customerNumber: '0917 123 4567',
        referenceNo: `REF-${randomUUID().slice(0, 8)}`,
        ...extra,
      },
    });
  const drawer = async () =>
    (await api.call('GET', '/cash-sessions/current', { token: owner })).body.data.session
      .expectedCash as number;

  test('fee by GCash: the drawer gets only the ₱500, the ₱10 fee lands in the wallet', async () => {
    const before = await drawer();
    const r = await cashIn(cashier, { feeVia: 'GCASH', customerName: '  Aling Nena ' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.data.transaction;
    assert.deepEqual(
      [t.fee, t.feeVia, t.walletChange, t.cashChange],
      [1_000, 'GCASH', -49_000, 50_000],
    );
    assert.equal(t.customerName, 'Aling Nena');
    assert.equal(await drawer(), before + 50_000);
  });

  test('a cashier cannot change the fee (403), even to zero', async () => {
    const r = await cashIn(cashier, { feeOverride: 0 });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'FEE_OWNER_ONLY');
  });

  test('the owner can: ₱5 for a suki, and the audit log shows ₱10 → ₱5', async () => {
    const r = await cashIn(owner, { feeOverride: 500 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.transaction.fee, 500);
    const { rows } = await pool.query(
      `SELECT before_data, after_data FROM audit_logs
       WHERE action = 'EWALLET_FEE_CHANGED' AND entity_id = $1`,
      [r.body.data.transaction.id],
    );
    assert.equal(rows[0].before_data.standardFee, 1_000);
    assert.equal(rows[0].after_data.fee, 500);
  });

  test('the owner typing the SAME fee as the rules is not an audit entry', async () => {
    const r = await cashIn(owner, { feeOverride: 1_000 });
    assert.equal(r.status, 201);
    const { rowCount } = await pool.query(
      "SELECT 1 FROM audit_logs WHERE action = 'EWALLET_FEE_CHANGED' AND entity_id = $1",
      [r.body.data.transaction.id],
    );
    assert.equal(rowCount, 0);
  });

  test('preview: the fee rules say ₱10, the owner ₱5 changes the summary', async () => {
    const r = await api.call('POST', '/ewallet/fee-preview', {
      token: owner,
      body: { accountId: gcash, type: 'CASH_IN', amount: 50_000, feeOverride: 500 },
    });
    assert.deepEqual(
      [r.body.data.standardFee, r.body.data.fee, r.body.data.cashChange],
      [1_000, 500, 50_500],
    );
  });
});

describe('utang terms: due date and interest', () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const day = (offset: number) =>
    new Date(Date.parse(`${today}T12:00:00+08:00`) + offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
  let id: number;

  test('a cashier adds a customer with a due date and 5% interest', async () => {
    const r = await api.call('POST', '/customers', {
      token: cashier,
      body: { name: 'Ate Lorna', dueDate: day(7), interestBp: 500 },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    id = r.body.data.customer.id;
    assert.deepEqual(
      [r.body.data.customer.dueDate, r.body.data.customer.interestBp, r.body.data.customer.pastDue],
      [day(7), 500, false],
    );
  });

  test('a due date already past is refused', async () => {
    const r = await api.call('PATCH', `/customers/${id}`, {
      token: cashier,
      body: { dueDate: day(-1) },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'DUE_DATE_PASSED');
  });

  test('a cashier can change the terms, but not the limit', async () => {
    const ok = await api.call('PATCH', `/customers/${id}`, {
      token: cashier,
      body: { interestBp: 300 },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const no = await api.call('PATCH', `/customers/${id}`, {
      token: cashier,
      body: { creditLimit: 99_999_999 },
    });
    assert.equal(no.status, 403);
  });

  test('not late yet: interest is refused', async () => {
    const r = await api.call('POST', `/customers/${id}/interest`, { token: owner });
    assert.equal(r.body.error?.code, 'NOT_OVERDUE');
  });

  test('late (due date moved into the past by hand): owner adds 3% once, cashier cannot', async () => {
    // She owes ₱450 (a charge from a real sale), and her due date was yesterday.
    const { rows } = await pool.query("SELECT id FROM sales WHERE payment_type = 'UTANG' LIMIT 1");
    await pool.query(
      `INSERT INTO credit_ledger (customer_id, type, amount, sale_id, created_by)
       VALUES ($1, 'CHARGE', 45000, $2, 1)`,
      [id, rows[0].id],
    );
    await pool.query('UPDATE customers SET due_date = $2 WHERE id = $1', [id, day(-1)]);

    const listed = await api.call('GET', `/customers/${id}/ledger`, { token: cashier });
    assert.equal(listed.body.data.customer.pastDue, true, 'shown as overdue');

    assert.equal(
      (await api.call('POST', `/customers/${id}/interest`, { token: cashier })).status,
      403,
    );

    const r = await api.call('POST', `/customers/${id}/interest`, { token: owner });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.customer.balance, 45_000 + 1_350); // 3% of ₱450 = ₱13.50
    assert.equal(r.body.data.customer.interestCharged, true);

    const again = await api.call('POST', `/customers/${id}/interest`, { token: owner });
    assert.equal(again.body.error?.code, 'INTEREST_ALREADY_ADDED');

    const audit = await pool.query(
      "SELECT after_data FROM audit_logs WHERE action = 'UTANG_INTEREST_ADDED' AND entity_id = $1",
      [id],
    );
    assert.equal(audit.rows[0].after_data.interest, 1_350);
  });

  test('a new due date means interest can be charged again later (for that date)', async () => {
    const r = await api.call('PATCH', `/customers/${id}`, {
      token: owner,
      body: { dueDate: day(14) },
    });
    assert.deepEqual(
      [r.body.data.customer.pastDue, r.body.data.customer.interestCharged],
      [false, false],
    );
  });
});
