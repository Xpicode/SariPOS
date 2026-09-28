// Tries to write bad data and asserts the DATABASE refuses each attempt, for the right reason.
// Everything runs in one transaction that is always rolled back, so your data is never changed.
// Run after migrate:up + seed:  npm run db:check
import { pool } from '../src/db/pool';

// PostgreSQL error codes: https://www.postgresql.org/docs/17/errcodes-appendix.html
const CHECK = '23514';
const UNIQUE = '23505';
const EXCLUSION = '23P01';
const GENERATED = '428C9'; // tried to write a GENERATED ALWAYS column
const RAISED = 'P0001'; // RAISE EXCEPTION in a trigger

const SALE_COLS = `(sale_no, idempotency_key, cash_session_id, cashier_id, customer_id,
  payment_type, subtotal, discount, total, total_cost, gcash_ref_no)`;

async function main() {
  const db = await pool.connect();
  let failed = 0;
  try {
    await db.query('BEGIN');

    // --- Valid rows the bad attempts refer to ---
    const one = async (sql: string, params: unknown[] = []) =>
      (await db.query(sql, params)).rows[0];
    const { id: userId } = await one(`SELECT id FROM users WHERE role = 'OWNER' LIMIT 1`);
    const { id: productId } = await one(`SELECT id FROM products ORDER BY id LIMIT 1`);
    // Use the drawer that's open now (the store may be mid-day), else open one for the test.
    const { id: sessionId } =
      (await one(`SELECT id FROM cash_sessions WHERE closed_at IS NULL`)) ??
      (await one(
        `INSERT INTO cash_sessions (opened_by, opening_cash) VALUES ($1, 100000) RETURNING id`,
        [userId],
      ));
    const { id: saleId, idempotency_key: usedKey } = await one(
      `INSERT INTO sales ${SALE_COLS}
       VALUES ('T-OK', gen_random_uuid(), $1, $2, NULL, 'CASH', 1000, 0, 1000, 800, NULL) RETURNING id, idempotency_key`,
      [sessionId, userId],
    );
    const { id: customerId } = await one(
      `INSERT INTO customers (name) VALUES ('Aling Nena') RETURNING id`,
    );
    // A real row for the delete/edit attempts to hit (a trigger only fires on existing rows).
    const { id: ledgerId } = await one(
      `INSERT INTO credit_ledger (customer_id, type, amount, sale_id, created_by)
       VALUES ($1, 'CHARGE', 1000, $2, $3) RETURNING id`,
      [customerId, saleId, userId],
    );
    const { id: gcashId } = await one(
      `SELECT id FROM ewallet_accounts WHERE kind = 'GCASH' LIMIT 1`,
    );
    const { id: auditId } = await one(
      `INSERT INTO audit_logs (user_id, action) VALUES ($1, 'TEST') RETURNING id`,
      [userId],
    );

    // [what we try, expected error code, SQL, params]
    const cases: [string, string, string, unknown[]][] = [
      // users / products / stock
      [
        'uppercase username',
        CHECK,
        `INSERT INTO users (username, full_name, password_hash) VALUES ('Owner', 'x', 'x')`,
        [],
      ],
      ['negative stock', CHECK, `UPDATE products SET stock_qty = -1 WHERE id = $1`, [productId]],
      [
        'unit with factor 0',
        CHECK,
        `INSERT INTO product_units (product_id, unit_name, factor, cost_centavos, price_centavos) VALUES ($1, 'bad', 0, 0, 0)`,
        [productId],
      ],
      [
        'negative price',
        CHECK,
        `INSERT INTO product_units (product_id, unit_name, factor, cost_centavos, price_centavos) VALUES ($1, 'bad', 1, 0, -100)`,
        [productId],
      ],
      [
        'second default unit',
        UNIQUE,
        `INSERT INTO product_units (product_id, unit_name, factor, cost_centavos, price_centavos, is_default) VALUES ($1, 'bad', 1, 0, 0, TRUE)`,
        [productId],
      ],
      [
        'SALE movement that adds stock',
        CHECK,
        `INSERT INTO stock_movements (product_id, type, qty_change, created_by) VALUES ($1, 'SALE', 5, $2)`,
        [productId, userId],
      ],
      [
        'zero stock movement',
        CHECK,
        `INSERT INTO stock_movements (product_id, type, qty_change, created_by) VALUES ($1, 'ADJUSTMENT', 0, $2)`,
        [productId, userId],
      ],

      // cash sessions
      [
        'second open session',
        UNIQUE,
        `INSERT INTO cash_sessions (opened_by, opening_cash) VALUES ($1, 0)`,
        [userId],
      ],
      [
        'close session without counting',
        CHECK,
        `UPDATE cash_sessions SET closed_at = now() WHERE id = $1`,
        [sessionId],
      ],
      [
        'close without saying who closed it',
        CHECK,
        `UPDATE cash_sessions SET closed_at = now(), expected_cash = 0, actual_cash = 0 WHERE id = $1`,
        [sessionId],
      ],
      [
        'type in a fake over/short',
        GENERATED,
        `UPDATE cash_sessions SET over_short = 0 WHERE id = $1`,
        [sessionId],
      ],

      // sales
      [
        'UTANG sale without customer',
        CHECK,
        `INSERT INTO sales ${SALE_COLS} VALUES ('T-2', gen_random_uuid(), $1, $2, NULL, 'UTANG', 1000, 0, 1000, 800, NULL)`,
        [sessionId, userId],
      ],
      [
        'GCASH sale without ref no',
        CHECK,
        `INSERT INTO sales ${SALE_COLS} VALUES ('T-3', gen_random_uuid(), $1, $2, NULL, 'GCASH', 1000, 0, 1000, 800, NULL)`,
        [sessionId, userId],
      ],
      [
        'total != subtotal - discount',
        CHECK,
        `INSERT INTO sales ${SALE_COLS} VALUES ('T-4', gen_random_uuid(), $1, $2, NULL, 'CASH', 1000, 0, 1, 800, NULL)`,
        [sessionId, userId],
      ],
      [
        'double submit (same idempotency key)',
        UNIQUE,
        `INSERT INTO sales ${SALE_COLS} VALUES ('T-5', $3, $1, $2, NULL, 'CASH', 1000, 0, 1000, 800, NULL)`,
        [sessionId, userId, usedKey],
      ],
      [
        'void without reason',
        CHECK,
        `UPDATE sales SET status = 'VOIDED', voided_by = $2 WHERE id = $1`,
        [saleId, userId],
      ],
      [
        'line total that does not add up',
        CHECK,
        `INSERT INTO sale_items (sale_id, product_id, product_unit_id, qty, base_qty, unit_price, unit_cost, line_total) SELECT $1, product_id, id, 2, 2, 1000, 800, 1 FROM product_units WHERE product_id = $2 LIMIT 1`,
        [saleId, productId],
      ],

      // utang
      [
        'positive PAYMENT (increases debt)',
        CHECK,
        `INSERT INTO credit_ledger (customer_id, type, amount, created_by) VALUES ($1, 'PAYMENT', 500, $2)`,
        [customerId, userId],
      ],
      [
        'utang payment outside a shift',
        CHECK,
        `INSERT INTO credit_ledger (customer_id, type, amount, created_by) VALUES ($1, 'PAYMENT', -500, $2)`,
        [customerId, userId],
      ],
      [
        'erase a debt (delete a ledger row)',
        RAISED,
        `DELETE FROM credit_ledger WHERE customer_id = $1`,
        [customerId],
      ],
      [
        'rewrite a debt (edit a ledger row)',
        RAISED,
        `UPDATE credit_ledger SET amount = 1 WHERE id = $1`,
        [ledgerId],
      ],
      [
        'badly formatted phone',
        CHECK,
        `INSERT INTO customers (name, phone) VALUES ('Mang Tonyo', '0917-123')`,
        [],
      ],
      [
        'CHARGE not linked to a sale',
        CHECK,
        `INSERT INTO credit_ledger (customer_id, type, amount, created_by) VALUES ($1, 'CHARGE', 500, $2)`,
        [customerId, userId],
      ],

      // e-wallet
      [
        'overlapping fee bracket',
        EXCLUSION,
        `INSERT INTO fee_rules (wallet_kind, txn_type, min_amount, max_amount, fee) VALUES ('GCASH', 'CASH_IN', 40000, 60000, 1000)`,
        [],
      ],
      [
        'negative wallet balance',
        CHECK,
        `UPDATE ewallet_accounts SET balance = -1 WHERE id = $1`,
        [gcashId],
      ],
      [
        'cash-out without reference no',
        CHECK,
        `INSERT INTO ewallet_transactions (idempotency_key, account_id, type, amount, wallet_change, cash_change, created_by) VALUES (gen_random_uuid(), $1, 'CASH_OUT', 50000, 50000, -49000, $2)`,
        [gcashId, userId],
      ],

      // expenses / audit
      [
        'unknown expense category',
        CHECK,
        `INSERT INTO expenses (category, amount, paid_from_drawer, created_by) VALUES ('SNACKS', 1000, FALSE, $1)`,
        [userId],
      ],
      [
        'drawer expense outside a shift',
        CHECK,
        `INSERT INTO expenses (category, amount, paid_from_drawer, created_by) VALUES ('SUPPLIES', 1000, TRUE, $1)`,
        [userId],
      ],
      [
        'edit an audit log',
        RAISED,
        `UPDATE audit_logs SET action = 'NOTHING_HAPPENED' WHERE id = $1`,
        [auditId],
      ],
      ['delete an audit log', RAISED, `DELETE FROM audit_logs WHERE id = $1`, [auditId]],
    ];

    for (const [name, expected, sql, params] of cases) {
      await db.query('SAVEPOINT attempt');
      try {
        await db.query(sql, params);
        console.error(`FAIL  ${name}: the database ACCEPTED it`);
        failed++;
      } catch (e) {
        const err = e as { code?: string; message: string };
        if (err.code === expected) {
          console.log(`ok    ${name}`);
        } else {
          console.error(
            `FAIL  ${name}: rejected for the wrong reason (${err.code}) ${err.message}`,
          );
          failed++;
        }
      }
      await db.query('ROLLBACK TO SAVEPOINT attempt');
    }

    console.log(
      failed
        ? `\n${failed} of ${cases.length} checks FAILED`
        : `\nAll ${cases.length} checks passed`,
    );
  } finally {
    await db.query('ROLLBACK'); // throw away the test rows
    db.release();
    await pool.end();
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
