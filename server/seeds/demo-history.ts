// Demo only (npm run seed:demo): fills the past N days with a believable store history, so a
// visitor sees real charts, top sellers, utang, shift reports and an audit trail.
//
// Rows are written directly (a sale "last Tuesday" can't go through the API, which stamps now()),
// using the same formulas as the app: fee.ts for GCash/load, plan 6.5 for expected cash.
// Every row still passes the database's CHECK constraints, which is the real safety net.
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { quote, type FeeRule } from '../src/modules/ewallet/fee';

type Unit = { productId: number; unitId: number; factor: number; price: number; cost: number };
type Ids = { ownerId: number; cashierId: number; gcashId: number; loadId: number };

// Same "random" store every reset (seeded PRNG, mulberry32): predictable demos, stable screenshots.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TELCOS = ['GLOBE', 'TM', 'SMART', 'TNT', 'DITO'];
// Customers per hour, 6 AM … 9 PM: breakfast, lunch and after-work peaks.
const HOUR_WEIGHTS = [2, 6, 7, 5, 4, 5, 7, 5, 3, 3, 4, 6, 8, 8, 6, 3];

export async function seedHistory(
  db: PoolClient,
  ids: Ids,
  days: number,
  today: string,
  start: { gcash: number; load: number }, // wallet balances before day 1 (the opening top-ups)
) {
  const rand = rng(20261001);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const weighted = <T>(xs: T[], w: (x: T) => number) => {
    let r = rand() * xs.reduce((s, x) => s + w(x), 0);
    for (const x of xs) if ((r -= w(x)) < 0) return x;
    return xs[xs.length - 1];
  };
  const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join('');
  const mobile = () => `09${digits(9)}`;

  const { rows: units } = await db.query<Unit & { isDefault: boolean }>(
    `SELECT product_id AS "productId", id AS "unitId", factor, price_centavos AS price,
            cost_centavos AS cost, is_default AS "isDefault"
     FROM product_units ORDER BY id`,
  );
  const { rows: rules } = await db.query<FeeRule & { txnType: string }>(
    `SELECT txn_type AS "txnType", min_amount AS "minAmount", max_amount AS "maxAmount", fee
     FROM fee_rules WHERE wallet_kind = 'GCASH'`,
  );
  const { rows: customers } = await db.query<{ id: number; limit: number }>(
    'SELECT id, credit_limit AS "limit" FROM customers WHERE NOT is_blocked ORDER BY id',
  );
  const rulesFor = (t: string) => rules.filter((r) => r.txnType === t);

  // Some products sell far more than others (softdrinks and cigarettes sticks > shampoo).
  const popularity = new Map<number, number>();
  for (const u of units)
    if (!popularity.has(u.productId)) popularity.set(u.productId, 1 + rand() * 9);
  const sellable = units.filter((u) => u.isDefault || u.factor <= 20); // no one buys a ream daily

  const sold = new Map<number, number>(); // productId -> base units sold (the opening stock covers it)
  const debt = new Map<number, number>(customers.map((c) => [c.id, 0]));
  let { gcash, load } = start; // wallet balances, live

  const at = (date: string, h: number, m: number) =>
    `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`;
  const ewallet = (
    sessionId: number | null,
    ts: string,
    row: {
      accountId: number;
      type: string;
      amount: number;
      fee: number;
      walletChange: number;
      cashChange: number;
    },
    extra: { customerNumber?: string; referenceNo?: string; telco?: string; by?: number } = {},
  ) =>
    db.query(
      `INSERT INTO ewallet_transactions (idempotency_key, cash_session_id, account_id, type, amount,
         fee, wallet_change, cash_change, customer_number, reference_no, telco, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        randomUUID(),
        sessionId,
        row.accountId,
        row.type,
        row.amount,
        row.fee,
        row.walletChange,
        row.cashChange,
        extra.customerNumber ?? null,
        extra.referenceNo ?? null,
        extra.telco ?? null,
        extra.by ?? ids.cashierId,
        ts,
      ],
    );

  for (let k = days; k >= 1; k--) {
    const date = new Date(
      Date.parse(`${today}T00:00:00+08:00`) - k * 86_400_000,
    ).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const weekend = [0, 6].includes(new Date(`${date}T12:00:00+08:00`).getUTCDay());
    const opening = 100_000; // ₱1,000 float every morning
    let cash = opening; // what the drawer should hold, live (plan 6.5)

    const {
      rows: [session],
    } = await db.query<{ id: number }>(
      `INSERT INTO cash_sessions (opened_by, opening_cash, opened_at) VALUES ($1, $2, $3) RETURNING id`,
      [ids.cashierId, opening, at(date, 6, 0)],
    );

    // Wallet running low? The owner tops it up from the bank before opening.
    if (gcash < 300_000) {
      await ewallet(
        null,
        at(date, 5, 50),
        {
          accountId: ids.gcashId,
          type: 'TOP_UP',
          amount: 500_000,
          fee: 0,
          walletChange: 500_000,
          cashChange: 0,
        },
        { by: ids.ownerId },
      );
      gcash += 500_000;
    }
    if (load < 50_000) {
      await ewallet(
        null,
        at(date, 5, 55),
        {
          accountId: ids.loadId,
          type: 'TOP_UP',
          amount: 200_000,
          fee: 0,
          walletChange: 200_000,
          cashChange: 0,
        },
        { by: ids.ownerId },
      );
      load += 200_000;
    }

    // ---- Sales ----
    const times = Array.from({ length: int(22, 34) + (weekend ? 8 : 0) }, () => {
      const hour =
        6 +
        weighted(
          HOUR_WEIGHTS.map((_, i) => i),
          (i) => HOUR_WEIGHTS[i],
        );
      return [hour, int(0, 59)] as const;
    }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    let saleNo = 0;
    const cashSaleIds: { id: number; total: number; ts: string; saleNo: string }[] = [];
    for (const [h, m] of times) {
      const ts = at(date, h, m);
      const lines = new Map<number, Unit & { qty: number }>();
      for (let n = weighted([1, 2, 3], (x) => [6, 3, 1][x - 1]); n > 0; n--) {
        const u = weighted(sellable, (x) => popularity.get(x.productId)! * (x.isDefault ? 4 : 1));
        lines.set(u.unitId, { ...u, qty: weighted([1, 2, 3], (x) => [14, 5, 1][x - 1]) });
      }
      const items = [...lines.values()];
      const total = items.reduce((s, i) => s + i.price * i.qty, 0);
      const totalCost = items.reduce((s, i) => s + i.cost * i.qty, 0);

      const r = rand();
      const debtor = customers.find((c) => debt.get(c.id)! + total <= c.limit && rand() < 0.5);
      const type = r < 0.07 && debtor ? 'UTANG' : r < 0.2 ? 'GCASH' : 'CASH';
      const tendered =
        type === 'CASH'
          ? pick([total, ...[2_000, 5_000, 10_000, 20_000, 50_000].filter((b) => b >= total)])
          : null;

      const no = `S-${date.replaceAll('-', '')}-${String(++saleNo).padStart(4, '0')}`;
      const {
        rows: [sale],
      } = await db.query<{ id: number }>(
        `INSERT INTO sales (sale_no, idempotency_key, cash_session_id, cashier_id, customer_id,
           payment_type, subtotal, total, total_cost, amount_tendered, change_given, gcash_ref_no, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          no,
          randomUUID(),
          session.id,
          ids.cashierId,
          type === 'UTANG' ? debtor!.id : null,
          type,
          total,
          totalCost,
          tendered,
          tendered === null ? null : tendered - total,
          type === 'GCASH' ? digits(13) : null,
          ts,
        ],
      );
      for (const i of items) {
        await db.query(
          `INSERT INTO sale_items (sale_id, product_id, product_unit_id, qty, base_qty, unit_price, unit_cost, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            sale.id,
            i.productId,
            i.unitId,
            i.qty,
            i.qty * i.factor,
            i.price,
            i.cost,
            i.price * i.qty,
          ],
        );
      }
      const perProduct = new Map<number, number>();
      for (const i of items)
        perProduct.set(i.productId, (perProduct.get(i.productId) ?? 0) + i.qty * i.factor);
      for (const [productId, qty] of perProduct) {
        sold.set(productId, (sold.get(productId) ?? 0) + qty);
        await db.query(
          `INSERT INTO stock_movements (product_id, type, qty_change, reference_id, created_by, created_at)
           VALUES ($1, 'SALE', $2, $3, $4, $5)`,
          [productId, -qty, sale.id, ids.cashierId, ts],
        );
      }

      if (type === 'CASH') {
        cash += total;
        cashSaleIds.push({ id: sale.id, total, ts, saleNo: no });
      } else if (type === 'GCASH') {
        gcash += total; // GCash sales land in the store's GCash wallet
      } else {
        debt.set(debtor!.id, debt.get(debtor!.id)! + total);
        await db.query(
          `INSERT INTO credit_ledger (customer_id, type, amount, sale_id, created_by, created_at)
           VALUES ($1, 'CHARGE', $2, $3, $4, $5)`,
          [debtor!.id, total, sale.id, ids.cashierId, ts],
        );
      }
    }
    await db.query('INSERT INTO sale_counters (day, last_no) VALUES ($1, $2)', [date, saleNo]);

    // A wrong item punched now and then: voided by the owner, stock back, logged.
    if (k % 4 === 2 && cashSaleIds.length > 0) {
      const v = pick(cashSaleIds);
      await db.query(
        `UPDATE sales SET status = 'VOIDED', voided_by = $2, void_reason = 'Wrong item punched' WHERE id = $1`,
        [v.id, ids.ownerId],
      );
      const { rows: back } = await db.query<{ productId: number; qty: number }>(
        `SELECT product_id AS "productId", SUM(base_qty)::int AS qty FROM sale_items WHERE sale_id = $1 GROUP BY product_id`,
        [v.id],
      );
      for (const b of back) {
        sold.set(b.productId, sold.get(b.productId)! - b.qty);
        await db.query(
          `INSERT INTO stock_movements (product_id, type, qty_change, reference_id, note, created_by, created_at)
           VALUES ($1, 'VOID_RETURN', $2, $3, $4, $5, $6)`,
          [b.productId, b.qty, v.id, `Void ${v.saleNo}`, ids.ownerId, v.ts],
        );
      }
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, before_data, after_data, created_at)
         VALUES ($1, 'SALE_VOID', 'sale', $2, $3, $4, $5)`,
        [
          ids.ownerId,
          v.id,
          { status: 'COMPLETED', total: v.total, paymentType: 'CASH' },
          { status: 'VOIDED', reason: 'Wrong item punched', approvedBy: ids.ownerId },
          v.ts,
        ],
      );
      cash -= v.total; // the cash went back to the customer
    }

    // ---- GCash cash-in / cash-out and load ----
    for (let n = int(4, 10); n > 0; n--) {
      const ts = at(date, int(7, 20), int(0, 59));
      const r = rand();
      if (r < 0.3) {
        const amount = pick([1_500, 2_000, 3_000, 5_000, 10_000]);
        if (load < amount) continue;
        const q = quote('ELOAD', amount, { commissionBp: 300 });
        await ewallet(
          session.id,
          ts,
          { accountId: ids.loadId, type: 'ELOAD', amount, ...q },
          { customerNumber: mobile(), telco: pick(TELCOS) },
        );
        load += q.walletChange;
        cash += q.cashChange;
      } else {
        const type = r < 0.75 ? 'CASH_IN' : 'CASH_OUT';
        const amount = int(2, 60) * 5_000; // ₱100 … ₱3,000
        const q = quote(type, amount, { rules: rulesFor(type) });
        if (gcash + q.walletChange < 0 || cash + q.cashChange < 0) continue;
        await ewallet(
          session.id,
          ts,
          { accountId: ids.gcashId, type, amount, ...q },
          { customerNumber: type === 'CASH_IN' ? mobile() : undefined, referenceNo: digits(13) },
        );
        gcash += q.walletChange;
        cash += q.cashChange;
      }
    }

    // ---- Utang payments (someone pays part of what they owe) ----
    for (const c of customers) {
      const owed = debt.get(c.id)!;
      if (owed < 5_000 || rand() > 0.25) continue;
      const amount = Math.min(owed, int(5, 30) * 1_000);
      await db.query(
        `INSERT INTO credit_ledger (customer_id, type, amount, cash_session_id, idempotency_key, created_by, created_at)
         VALUES ($1, 'PAYMENT', $2, $3, $4, $5, $6)`,
        [c.id, -amount, session.id, randomUUID(), ids.cashierId, at(date, int(16, 20), int(0, 59))],
      );
      debt.set(c.id, owed - amount);
      cash += amount;
    }

    // ---- Expenses ----
    const expense = (category: string, amount: number, note: string, fromDrawer = true) =>
      db.query(
        `INSERT INTO expenses (cash_session_id, category, amount, paid_from_drawer, note, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          fromDrawer ? session.id : null,
          category,
          amount,
          fromDrawer,
          note,
          fromDrawer ? ids.cashierId : ids.ownerId,
          at(date, 14, int(0, 59)),
        ],
      );
    if (k % 3 === 0) {
      const amount = int(4, 12) * 1_000;
      await expense('TRANSPORT', amount, 'Tricycle to the palengke');
      cash -= amount;
    }
    if (k % 7 === 1) {
      await expense('SUPPLIES', 15_000, 'Plastic labo and ice');
      cash -= 15_000;
    }
    if (k === Math.min(days, 16)) await expense('ELECTRIC', 185_000, 'Meralco bill', false);
    if (k % 10 === 5 && cash > 60_000) {
      await expense('OWNER_WITHDRAWAL', 50_000, 'Pang-baon');
      cash -= 50_000;
    }

    // ---- Close: counted cash is usually exact, sometimes a few pesos off ----
    const roll = rand();
    const actual = Math.max(
      0,
      cash + (roll < 0.1 ? -int(1, 8) * 500 : roll < 0.15 ? int(1, 4) * 500 : 0),
    );
    await db.query(
      `UPDATE cash_sessions SET closed_at = $2, closed_by = $3, expected_cash = $4, actual_cash = $5
       WHERE id = $1`,
      [session.id, at(date, 22, 5), ids.cashierId, cash, actual],
    );
  }

  return { sold, gcash, load };
}
