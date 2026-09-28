import type { Db } from '../../db/pool';

export type LedgerType = 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';

export type CustomerView = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  creditLimit: number;
  isBlocked: boolean;
  balance: number; // what they owe now (negative = the store owes them)
  createdAt: Date;
};

// The balance is never stored: it's always the sum of the ledger (plan 6.3), so it can't drift.
// ::bigint because SUM of BIGINT is NUMERIC, which pg would hand back as a string.
const CUSTOMER_SELECT = `
  SELECT c.id, c.name, c.phone, c.address, c.credit_limit AS "creditLimit",
         c.is_blocked AS "isBlocked", c.created_at AS "createdAt",
         COALESCE((SELECT SUM(l.amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0)::bigint
           AS balance
  FROM customers c`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export async function listCustomers(db: Db, search?: string) {
  const { rows } = await db.query<CustomerView>(
    `${CUSTOMER_SELECT}
     WHERE $1::text IS NULL OR c.name ILIKE $1 OR c.phone = $2
     ORDER BY lower(c.name), c.id
     LIMIT 500`, // ponytail: no paging; a store has dozens of suki, not thousands
    [search ? `%${escapeLike(search)}%` : null, search ?? null],
  );
  return rows;
}

export async function getCustomer(db: Db, id: number) {
  const { rows } = await db.query<CustomerView>(`${CUSTOMER_SELECT} WHERE c.id = $1`, [id]);
  return rows[0];
}

// FOR UPDATE: two charges (or a charge and a payment) for the same customer wait in line, so
// both can't pass the limit check against the same old balance.
export async function lockCustomer(db: Db, id: number) {
  await db.query('SELECT 1 FROM customers WHERE id = $1 FOR UPDATE', [id]);
  return getCustomer(db, id);
}

export async function insertCustomer(
  db: Db,
  c: { name: string; phone?: string; address?: string; creditLimit?: number },
) {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO customers (name, phone, address, credit_limit)
     VALUES ($1, $2, $3, COALESCE($4, 50000)) RETURNING id`, // default limit ₱500
    [c.name, c.phone ?? null, c.address || null, c.creditLimit ?? null],
  );
  return rows[0].id;
}

// undefined = leave as is; null (phone/address) = clear it.
export async function updateCustomer(
  db: Db,
  id: number,
  c: {
    name?: string;
    phone?: string | null;
    address?: string | null;
    creditLimit?: number;
    isBlocked?: boolean;
  },
) {
  await db.query(
    `UPDATE customers SET
       name         = COALESCE($2, name),
       phone        = CASE WHEN $3 THEN $4 ELSE phone END,
       address      = CASE WHEN $5 THEN $6 ELSE address END,
       credit_limit = COALESCE($7, credit_limit),
       is_blocked   = COALESCE($8, is_blocked)
     WHERE id = $1`,
    [
      id,
      c.name ?? null,
      c.phone !== undefined,
      c.phone ?? null,
      c.address !== undefined,
      c.address || null,
      c.creditLimit ?? null,
      c.isBlocked ?? null,
    ],
  );
}

export async function insertLedger(
  db: Db,
  e: {
    customerId: number;
    type: LedgerType;
    amount: number; // CHARGE +, PAYMENT −, ADJUSTMENT either (the CHECK enforces the signs)
    saleId?: number;
    sessionId?: number;
    idempotencyKey?: string;
    note?: string;
    createdBy: number;
  },
) {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO credit_ledger
       (customer_id, type, amount, sale_id, cash_session_id, idempotency_key, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      e.customerId,
      e.type,
      e.amount,
      e.saleId ?? null,
      e.sessionId ?? null,
      e.idempotencyKey ?? null,
      e.note ?? null,
      e.createdBy,
    ],
  );
  return rows[0].id;
}

export async function findPaymentByKey(db: Db, key: string) {
  const { rows } = await db.query<{ id: number; customerId: number; createdBy: number }>(
    `SELECT id, customer_id AS "customerId", created_by AS "createdBy"
     FROM credit_ledger WHERE idempotency_key = $1`,
    [key],
  );
  return rows[0];
}

// The statement, like a bank passbook: every row with the balance right after it.
// SUM(...) OVER (ORDER BY ...) is a window function: a running total, row by row, oldest first.
// The newest 200 are returned (the running total still counts every older row).
export async function statement(db: Db, customerId: number) {
  const { rows } = await db.query(
    `SELECT * FROM (
       SELECT l.id, l.type, l.amount, l.note, l.created_at AS "createdAt",
              u.full_name AS "createdBy", s.id AS "saleId", s.sale_no AS "saleNo",
              SUM(l.amount) OVER (ORDER BY l.created_at, l.id)::bigint AS balance
       FROM credit_ledger l
       JOIN users u ON u.id = l.created_by
       LEFT JOIN sales s ON s.id = l.sale_id
       WHERE l.customer_id = $1
     ) t
     ORDER BY "createdAt" DESC, id DESC
     LIMIT 200`,
    [customerId],
  );
  return rows;
}

// Aging (plan 6.3): how long has each customer owed? Measured from their OLDEST UNPAID charge.
// Payments are assumed to pay the oldest charges first (FIFO): walking charges oldest -> newest,
// the first one whose running total is more than everything ever paid is still (partly) unpaid.
// A voided sale's charge and its reversal cancel out, so both are left out.
export async function aging(db: Db) {
  const { rows } = await db.query(
    `WITH live AS (
       SELECT l.* FROM credit_ledger l LEFT JOIN sales s ON s.id = l.sale_id
       WHERE s.status IS DISTINCT FROM 'VOIDED'
     ),
     paid AS (
       SELECT customer_id, COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0) AS paid
       FROM live GROUP BY customer_id
     ),
     charges AS (
       SELECT customer_id, created_at,
              SUM(amount) OVER (PARTITION BY customer_id ORDER BY created_at, id) AS charged
       FROM live WHERE amount > 0
     ),
     owing AS (
       SELECT c.id, c.name, c.phone, c.credit_limit AS "creditLimit", c.is_blocked AS "isBlocked",
              (SELECT SUM(amount) FROM credit_ledger WHERE customer_id = c.id)::bigint AS balance,
              (SELECT MIN(ch.created_at) FROM charges ch
               WHERE ch.customer_id = c.id AND ch.charged > p.paid) AS "oldestUnpaid"
       FROM customers c JOIN paid p ON p.customer_id = c.id
     )
     SELECT o.*,
            ((now() AT TIME ZONE 'Asia/Manila')::date
              - ("oldestUnpaid" AT TIME ZONE 'Asia/Manila')::date) AS "daysOwed"
     FROM owing o
     WHERE o.balance > 0
     ORDER BY "daysOwed" DESC, o.balance DESC`,
  );
  return rows as (Omit<CustomerView, 'address' | 'createdAt'> & {
    oldestUnpaid: Date;
    daysOwed: number;
  })[];
}
