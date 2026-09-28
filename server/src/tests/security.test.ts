// Self-pentest (plan Phase 9): each test is an attack on our own API and the answer we expect.
// The browser-side rows (XSS rendered as text, no tokens in storage) are checked in a real browser.
import { passwords, resetDb, startApi, unitId } from './helpers'; // first
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { pool } from '../db/pool';

let api: Awaited<ReturnType<typeof startApi>>;
let owner: string;
let cashier: string;
const pw = passwords();

before(async () => {
  resetDb();
  api = await startApi();
  owner = await api.login('owner', pw.owner);
  cashier = await api.login('cashier', pw.cashier);
});
after(() => api.close());

const stick = () => unitId('Fortune International Red', 'stick'); // ₱8

describe('secure defaults', () => {
  test('headers: API CSP allows nothing, no framework banner, never cached', async () => {
    const r = await api.call('GET', '/health');
    assert.equal(
      r.headers.get('content-security-policy'),
      "default-src 'none';frame-ancestors 'none'",
    );
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  test('CORS: only our own frontend may call the API from a browser', async () => {
    // The API always answers with OUR origin; a browser on another site sees the mismatch
    // and blocks the page from reading the response.
    const evil = await api.call('GET', '/health', { headers: { Origin: 'https://evil.example' } });
    assert.notEqual(evil.headers.get('access-control-allow-origin'), 'https://evil.example');
    assert.notEqual(evil.headers.get('access-control-allow-origin'), '*');
    const ours = await api.call('GET', '/health', { headers: { Origin: env.CLIENT_ORIGIN } });
    assert.equal(ours.headers.get('access-control-allow-origin'), env.CLIENT_ORIGIN);
  });

  test('a body over 100 kB is rejected before it is read', async () => {
    const r = await api.call('POST', '/auth/login', {
      body: { username: 'owner', password: 'x'.repeat(200_000) },
    });
    assert.equal(r.status, 413);
  });

  test('broken JSON: a plain 400, no stack trace or file paths', async () => {
    const res = await fetch(`${api.base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"username": ',
    });
    const text = await res.text();
    assert.equal(res.status, 400);
    assert.doesNotMatch(text, /at |\.ts|node_modules/);
  });
});

describe('SQL injection', () => {
  test("product search ' OR 1=1 -- is treated as text: no error, no products", async () => {
    const r = await api.call('GET', `/products?search=${encodeURIComponent("' OR 1=1 --")}`, {
      token: cashier,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.products.length, 0);
  });

  test('a LIKE wildcard (%) is text too, so it does not list everything', async () => {
    const r = await api.call('GET', '/products?search=%25', { token: cashier });
    assert.equal(r.body.data.products.length, 0);
  });

  test("login as admin' -- : an ordinary wrong login", async () => {
    const r = await api.call('POST', '/auth/login', {
      body: { username: "owner' --", password: 'anything1' },
    });
    assert.equal(r.status, 401);
  });

  test('an id like "1 OR 1=1" never reaches SQL: it is not a number, so "not found"', async () => {
    const r = await api.call('GET', `/sales/${encodeURIComponent('1 OR 1=1')}`, { token: owner });
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'NOT_FOUND');
  });
});

describe('stored XSS', () => {
  test('a product named <img onerror> is stored and returned exactly as typed', async () => {
    const name = '<img src=x onerror=alert(1)>';
    const r = await api.call('POST', '/products', {
      token: owner,
      body: {
        name,
        categoryId: null,
        baseUnit: 'piece',
        reorderLevel: 0,
        units: [
          {
            unitName: 'piece',
            factor: 1,
            barcode: null,
            costCentavos: 100,
            priceCentavos: 200,
            isDefault: true,
          },
        ],
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    // React prints it as text; the browser check confirms no script runs.
    assert.equal(r.body.data.product.name, name);
  });
});

describe('role bypass (cashier token on owner routes)', () => {
  const ownerOnly: [string, string, object?][] = [
    ['PATCH', '/products/1', { name: 'Free' }],
    ['GET', '/users'],
    ['POST', '/users', { username: 'x', fullName: 'X', role: 'OWNER', password: 'password1' }],
    ['GET', '/reports/profit'],
    ['GET', '/reports/audit-log'],
    ['PUT', '/ewallet/fee-rules', { rules: [] }],
    ['GET', '/cash-sessions'],
    ['GET', '/customers/aging'],
  ];
  for (const [method, path, body] of ownerOnly) {
    test(`${method} ${path} → 403`, async () => {
      const r = await api.call(method, path, { token: cashier, body });
      assert.equal(r.status, 403);
    });
  }

  test('a cashier cannot top up a wallet', async () => {
    const r = await api.call('POST', '/ewallet/transactions', {
      token: cashier,
      body: {
        idempotencyKey: randomUUID(),
        type: 'TOP_UP',
        accountId: 1,
        amount: 100,
        drawer: false,
      },
    });
    assert.equal(r.status, 403);
  });

  test('a cashier cannot give a new customer a credit limit', async () => {
    const r = await api.call('POST', '/customers', {
      token: cashier,
      body: { name: 'Bagong Suki', creditLimit: 99_999_999 },
    });
    assert.equal(r.status, 403);
  });

  test('public demo: even the owner cannot change user accounts', async () => {
    env.DEMO_MODE = true;
    try {
      const r = await api.call('PATCH', '/users/2', { token: owner, body: { isActive: false } });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'DEMO_READ_ONLY');
      assert.equal(
        (await api.call('GET', '/users', { token: owner })).status,
        200,
        'still viewable',
      );
    } finally {
      env.DEMO_MODE = false;
    }
  });
});

describe('forged tokens', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

  test('no token → 401', async () => {
    assert.equal((await api.call('GET', '/products')).status, 401);
  });

  test('"alg: none" (unsigned) token claiming OWNER → 401', async () => {
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1', role: 'OWNER' })}.`;
    assert.equal((await api.call('GET', '/users', { token })).status, 401);
  });

  test('cashier token with role edited to OWNER → 401 (signature no longer matches)', async () => {
    const [head, body, sig] = cashier.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    const token = `${head}.${b64({ ...claims, role: 'OWNER' })}.${sig}`;
    assert.equal((await api.call('GET', '/users', { token })).status, 401);
  });

  test('token signed with a guessed secret → 401', async () => {
    const token = jwt.sign({ role: 'OWNER' }, 'secret', { subject: '1', algorithm: 'HS256' });
    assert.equal((await api.call('GET', '/users', { token })).status, 401);
  });
});

describe('price tamper and double submit', () => {
  test('unitPrice: 0 / total: 0 in the request are ignored: the database price is charged', async () => {
    await api.call('POST', '/cash-sessions/open', { token: owner, body: { openingCash: 100_000 } });
    const r = await api.call('POST', '/sales', {
      token: cashier,
      body: {
        idempotencyKey: randomUUID(),
        items: [
          { productUnitId: await stick(), qty: 1, unitPrice: 0, priceCentavos: 0, lineTotal: 0 },
        ],
        payment: { type: 'CASH', amountTendered: 800 },
        total: 0,
        subtotal: 0,
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.sale.total, 800);
  });

  test('the same sale request sent 5 times at once → one sale', async () => {
    const body = {
      idempotencyKey: randomUUID(),
      items: [{ productUnitId: await stick(), qty: 1 }],
      payment: { type: 'CASH', amountTendered: 800 },
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api.call('POST', '/sales', { token: cashier, body })),
    );
    const ids = new Set(results.map((r) => r.body.data?.sale?.id));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 200, 200, 201]);
    assert.equal(ids.size, 1);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM sales WHERE idempotency_key = $1',
      [body.idempotencyKey],
    );
    assert.equal(rows[0].n, 1);
  });

  test("another user can't replay someone else's key to read their sale", async () => {
    const body = {
      idempotencyKey: randomUUID(),
      items: [{ productUnitId: await stick(), qty: 1 }],
      payment: { type: 'CASH', amountTendered: 800 },
    };
    assert.equal((await api.call('POST', '/sales', { token: owner, body })).status, 201);
    const r = await api.call('POST', '/sales', { token: cashier, body });
    assert.equal(r.status, 409);
  });
});

describe('IDOR: a cashier reading another shift', () => {
  test("a sale from a closed shift → 404, that shift's report → 403", async () => {
    const r = await api.call('GET', '/sales', { token: owner });
    const oldSale = r.body.data.sales[0];
    const cur = await api.call('GET', '/cash-sessions/current', { token: owner });
    const session = cur.body.data.session;
    const closed = await api.call('POST', `/cash-sessions/${session.id}/close`, {
      token: owner,
      body: { actualCash: session.expectedCash },
    });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    await api.call('POST', '/cash-sessions/open', { token: cashier, body: { openingCash: 0 } });

    assert.equal((await api.call('GET', `/sales/${oldSale.id}`, { token: cashier })).status, 404);
    const report = await api.call('GET', `/cash-sessions/${session.id}`, { token: cashier });
    assert.equal(report.status, 403);
    const list = await api.call('GET', '/sales', { token: cashier });
    assert.equal(list.body.data.sales.length, 0, 'the new shift has no sales yet');
  });
});

// Last: these use up this machine's request allowance.
describe('brute force', () => {
  test('20 fast wrong logins: account locked, then 429; even the right password is refused', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await api.call('POST', '/auth/login', {
        body: { username: 'cashier', password: `guess-${i}-wrong` },
      });
      statuses.push(r.status);
    }
    assert.ok(!statuses.includes(200));
    assert.ok(statuses.includes(423), 'account locked after 5 wrong passwords');
    assert.equal(statuses.at(-1), 429, 'then the rate limit answers');

    const real = await api.call('POST', '/auth/login', {
      body: { username: 'cashier', password: pw.cashier },
    });
    assert.notEqual(real.status, 200);
    const { rows } = await pool.query(
      "SELECT locked_until > now() AS locked FROM users WHERE username = 'cashier'",
    );
    assert.equal(rows[0].locked, true);
    const audit = await pool.query("SELECT 1 FROM audit_logs WHERE action = 'ACCOUNT_LOCKED'");
    assert.equal(audit.rowCount, 1, 'the lock is in the audit log');
  });

  test('general limit: more than 300 requests a minute from one IP → 429', async () => {
    let last = 0;
    for (let i = 0; i < 320 && last !== 429; i++) last = (await api.call('GET', '/health')).status;
    assert.equal(last, 429);
  });
});
