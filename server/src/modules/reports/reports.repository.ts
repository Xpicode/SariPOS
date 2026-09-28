import type { Db } from '../../db/pool';
import { inStoreDays } from '../../utils/dateRange';

// Reporting SQL. Timestamps are stored in UTC (TIMESTAMPTZ) and turned into store (Manila) days
// and hours only here. Only COMPLETED sales count: voided ones never happened, money-wise.
// ::bigint everywhere a SUM of BIGINT is returned: SUM gives NUMERIC, which pg hands back as a string.

export type ProductSales = {
  productId: number;
  name: string;
  baseUnit: string;
  units: { unitName: string; factor: number }[]; // to show "3 packs + 5 sticks"
  stockQty: number;
  saleCount: number; // how many receipts had it: comparable across rice (grams) and candy (pcs)
  qtySold: number; // in base units
  revenue: number;
  profit: number; // line totals − the cost snapshots taken at each sale
  lastSoldAt: Date | null; // ever, not just in the range: "slow" = not sold for a long time
};

// Every product that sold in the range, plus every active product that didn't (0 sales): those
// zeros are exactly the slow movers.
export async function productSales(db: Db, from: string, to: string) {
  const { rows } = await db.query<ProductSales>(
    `WITH sold AS (
       SELECT i.product_id, COUNT(DISTINCT s.id) AS sale_count, SUM(i.base_qty) AS qty,
              SUM(i.line_total) AS revenue, SUM(i.line_total - i.unit_cost * i.qty) AS profit
       FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'COMPLETED'
       WHERE ${inStoreDays('s.created_at', '$1', '$2')}
       GROUP BY i.product_id
     ),
     last AS (
       SELECT i.product_id, MAX(s.created_at) AS at
       FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'COMPLETED'
       GROUP BY i.product_id
     )
     SELECT p.id AS "productId", p.name, p.base_unit AS "baseUnit", p.stock_qty AS "stockQty",
            COALESCE((SELECT json_agg(json_build_object('unitName', u.unit_name, 'factor', u.factor))
                      FROM product_units u WHERE u.product_id = p.id AND u.is_active), '[]') AS units,
            COALESCE(sold.sale_count, 0) AS "saleCount",
            COALESCE(sold.qty, 0)::bigint AS "qtySold",
            COALESCE(sold.revenue, 0)::bigint AS revenue,
            COALESCE(sold.profit, 0)::bigint AS profit,
            last.at AS "lastSoldAt"
     FROM products p
     LEFT JOIN sold ON sold.product_id = p.id
     LEFT JOIN last ON last.product_id = p.id
     WHERE p.is_active OR sold.product_id IS NOT NULL
     ORDER BY revenue DESC, lower(p.name)
     LIMIT 500`, // ponytail: a sari-sari catalog fits; page it if one ever grows past this
    [from, to],
  );
  return rows;
}

// The three sources of profit (plan 6.7), each from its own table.
export async function profitParts(db: Db, from: string, to: string) {
  const [products, ewallet, expenses] = await Promise.all([
    db.query<{ revenue: number; cost: number; saleCount: number }>(
      `SELECT COALESCE(SUM(i.line_total), 0)::bigint AS revenue,
              COALESCE(SUM(i.unit_cost * i.qty), 0)::bigint AS cost,
              COUNT(DISTINCT s.id) AS "saleCount"
       FROM sale_items i JOIN sales s ON s.id = i.sale_id AND s.status = 'COMPLETED'
       WHERE ${inStoreDays('s.created_at', '$1', '$2')}`,
      [from, to],
    ),
    // fee = what the store earned: the GCash fee, or the load commission. (For load, plan 6.7's
    // cash_change + wallet_change is the same number: the money_flow CHECK guarantees it.)
    db.query<{ type: 'CASH_IN' | 'CASH_OUT' | 'ELOAD'; count: number; earned: number }>(
      `SELECT type, COUNT(*) AS count, COALESCE(SUM(fee), 0)::bigint AS earned
       FROM ewallet_transactions
       WHERE status = 'COMPLETED' AND type IN ('CASH_IN', 'CASH_OUT', 'ELOAD')
         AND ${inStoreDays('created_at', '$1', '$2')}
       GROUP BY type`,
      [from, to],
    ),
    db.query<{ category: string; count: number; total: number }>(
      `SELECT category, COUNT(*) AS count, SUM(amount)::bigint AS total
       FROM expenses WHERE ${inStoreDays('created_at', '$1', '$2')}
       GROUP BY category ORDER BY total DESC`,
      [from, to],
    ),
  ]);
  return { products: products.rows[0], ewallet: ewallet.rows, expenses: expenses.rows };
}

// Sales per store day, every day of the range (generate_series fills days without sales with 0,
// so a quiet day shows as a gap instead of disappearing from the chart).
export async function salesTrend(db: Db, from: string, to: string) {
  const { rows } = await db.query<{ day: string; sales: number; profit: number; count: number }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            COALESCE(x.sales, 0)::bigint AS sales,
            COALESCE(x.profit, 0)::bigint AS profit,
            COALESCE(x.count, 0) AS count
     FROM generate_series($1::date, $2::date, interval '1 day') AS d
     LEFT JOIN (
       SELECT (created_at AT TIME ZONE 'Asia/Manila')::date AS day,
              SUM(total) AS sales, SUM(total - total_cost) AS profit, COUNT(*) AS count
       FROM sales
       WHERE status = 'COMPLETED' AND ${inStoreDays('created_at', '$1', '$2')}
       GROUP BY 1
     ) x ON x.day = d::date
     ORDER BY d`,
    [from, to],
  );
  return rows;
}

// Sales by hour of the day (Manila time), all 24 hours.
export async function peakHours(db: Db, from: string, to: string) {
  const { rows } = await db.query<{ hour: number; count: number; sales: number }>(
    `SELECT h AS hour, COALESCE(x.count, 0) AS count, COALESCE(x.sales, 0)::bigint AS sales
     FROM generate_series(0, 23) AS h
     LEFT JOIN (
       SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Manila')::int AS hour,
              COUNT(*) AS count, SUM(total) AS sales
       FROM sales
       WHERE status = 'COMPLETED' AND ${inStoreDays('created_at', '$1', '$2')}
       GROUP BY 1
     ) x ON x.hour = h
     ORDER BY h`,
    [from, to],
  );
  return rows;
}

export async function transactionCounts(db: Db, from: string, to: string) {
  const { rows } = await db.query<{ sales: number; ewallet: number }>(
    `SELECT
       (SELECT COUNT(*) FROM sales
        WHERE status = 'COMPLETED' AND ${inStoreDays('created_at', '$1', '$2')}) AS sales,
       (SELECT COUNT(*) FROM ewallet_transactions
        WHERE status = 'COMPLETED' AND type IN ('CASH_IN', 'CASH_OUT', 'ELOAD')
          AND ${inStoreDays('created_at', '$1', '$2')}) AS ewallet`,
    [from, to],
  );
  return rows[0];
}

// Who owes the most right now (the balance is always the sum of the ledger).
export async function topUtang(db: Db, limit = 5) {
  const { rows } = await db.query<{ id: number; name: string; balance: number }>(
    `SELECT c.id, c.name, SUM(l.amount)::bigint AS balance
     FROM customers c JOIN credit_ledger l ON l.customer_id = c.id
     GROUP BY c.id HAVING SUM(l.amount) > 0
     ORDER BY balance DESC, lower(c.name)
     LIMIT $1`,
    [limit],
  );
  return rows;
}

// Audit log, newest first, 100 at a time. beforeId = "older than the last row I have" (a cursor:
// unlike OFFSET, new rows arriving at the top don't shift the pages).
export async function auditLog(
  db: Db,
  f: { userId?: number; action?: string; from?: string; to?: string; beforeId?: number },
  limit: number,
) {
  const { rows } = await db.query(
    `SELECT a.id, a.created_at AS "createdAt", a.action, a.entity, a.entity_id AS "entityId",
            a.before_data AS before, a.after_data AS after, host(a.ip_address) AS ip,
            a.user_id AS "userId", u.full_name AS "userName"
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     WHERE ($1::bigint IS NULL OR a.user_id = $1)
       AND ($2::text IS NULL OR a.action = $2)
       AND ($3::date IS NULL OR a.created_at >= ($3::date::timestamp AT TIME ZONE 'Asia/Manila'))
       AND ($4::date IS NULL OR a.created_at < (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Manila'))
       AND ($5::bigint IS NULL OR a.id < $5)
     ORDER BY a.id DESC
     LIMIT $6`,
    [f.userId ?? null, f.action ?? null, f.from ?? null, f.to ?? null, f.beforeId ?? null, limit],
  );
  return rows;
}

export async function auditActions(db: Db) {
  const { rows } = await db.query<{ action: string }>(
    'SELECT DISTINCT action FROM audit_logs ORDER BY action',
  );
  return rows.map((r) => r.action);
}
