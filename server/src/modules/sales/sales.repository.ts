import type { Db } from '../../db/pool';
import { inStoreDays } from '../../utils/dateRange';

export type PaymentType = 'CASH' | 'GCASH' | 'UTANG';
export type SaleStatus = 'COMPLETED' | 'VOIDED';

export async function findByIdempotencyKey(db: Db, key: string) {
  const { rows } = await db.query<{ id: number; cashierId: number }>(
    'SELECT id, cashier_id AS "cashierId" FROM sales WHERE idempotency_key = $1',
    [key],
  );
  return rows[0];
}

// The REAL price and cost of each unit in the cart, straight from the database.
// Only units that are still sold (unit and product both active).
export async function loadSellableUnits(db: Db, unitIds: number[]) {
  const { rows } = await db.query<{
    id: number;
    productId: number;
    factor: number;
    priceCentavos: number;
    costCentavos: number;
  }>(
    `SELECT u.id, u.product_id AS "productId", u.factor,
            u.price_centavos AS "priceCentavos", u.cost_centavos AS "costCentavos"
     FROM product_units u JOIN products p ON p.id = u.product_id
     WHERE u.id = ANY($1::bigint[]) AND u.is_active AND p.is_active`,
    [unitIds],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

// Lock every product in the sale, ALWAYS in id order. Two sales that share products then
// queue up instead of each holding one row the other needs (a deadlock).
export async function lockProducts(db: Db, productIds: number[]) {
  const { rows } = await db.query<{
    id: number;
    name: string;
    stockQty: number;
    baseUnit: string;
    single: string | null;
  }>(
    `SELECT p.id, p.name, p.stock_qty AS "stockQty", p.base_unit AS "baseUnit",
            (SELECT unit_name FROM product_units
             WHERE product_id = p.id AND factor = 1 AND is_active LIMIT 1) AS single
     FROM products p
     WHERE p.id = ANY($1::bigint[])
     ORDER BY p.id
     FOR UPDATE OF p`,
    [productIds],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

// Next receipt number for today (store time). See migration 0007.
export async function nextSaleNo(db: Db) {
  const { rows } = await db.query<{ day: string; n: number }>(
    `INSERT INTO sale_counters (day, last_no)
     VALUES ((now() AT TIME ZONE 'Asia/Manila')::date, 1)
     ON CONFLICT (day) DO UPDATE SET last_no = sale_counters.last_no + 1
     RETURNING to_char(day, 'YYYYMMDD') AS day, last_no AS n`,
  );
  // padStart never cuts: sale 10,000 of the day becomes -10000, not a duplicate "-1000".
  return `S-${rows[0].day}-${String(rows[0].n).padStart(4, '0')}`;
}

export async function insertSale(
  db: Db,
  s: {
    saleNo: string;
    idempotencyKey: string;
    sessionId: number;
    cashierId: number;
    paymentType: PaymentType;
    subtotal: number;
    total: number;
    totalCost: number;
    amountTendered: number | null;
    changeGiven: number | null;
    gcashRefNo: string | null;
    customerId: number | null;
  },
) {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO sales (sale_no, idempotency_key, cash_session_id, cashier_id, payment_type,
                        subtotal, total, total_cost, amount_tendered, change_given, gcash_ref_no,
                        customer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      s.saleNo,
      s.idempotencyKey,
      s.sessionId,
      s.cashierId,
      s.paymentType,
      s.subtotal,
      s.total,
      s.totalCost,
      s.amountTendered,
      s.changeGiven,
      s.gcashRefNo,
      s.customerId,
    ],
  );
  return rows[0].id;
}

export type SaleLine = {
  productId: number;
  productUnitId: number;
  qty: number;
  baseQty: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
};

// All lines in ONE statement: unnest() turns the parallel arrays back into rows.
export async function insertItems(db: Db, saleId: number, lines: SaleLine[]) {
  await db.query(
    `INSERT INTO sale_items
       (sale_id, product_id, product_unit_id, qty, base_qty, unit_price, unit_cost, line_total)
     SELECT $1, * FROM unnest($2::bigint[], $3::bigint[], $4::int[], $5::int[],
                              $6::bigint[], $7::bigint[], $8::bigint[])`,
    [
      saleId,
      lines.map((l) => l.productId),
      lines.map((l) => l.productUnitId),
      lines.map((l) => l.qty),
      lines.map((l) => l.baseQty),
      lines.map((l) => l.unitPrice),
      lines.map((l) => l.unitCost),
      lines.map((l) => l.lineTotal),
    ],
  );
}

// Receipt view. No cost / profit here: cashiers see receipts too.
// ponytail: product and unit NAMES are read live, so a renamed product shows its new name on
// old receipts. Snapshot the name into sale_items if receipts must be reprinted word for word.
export async function getSale(db: Db, id: number) {
  const { rows } = await db.query<{
    id: number;
    saleNo: string;
    cashSessionId: number;
    cashierId: number;
    cashierName: string;
    paymentType: PaymentType;
    subtotal: number;
    discount: number;
    total: number;
    amountTendered: number | null;
    changeGiven: number | null;
    gcashRefNo: string | null;
    status: SaleStatus;
    voidReason: string | null;
    voidedBy: string | null;
    customerId: number | null;
    customerName: string | null;
    createdAt: Date;
    items: {
      productId: number;
      productName: string;
      unitName: string;
      qty: number;
      unitPrice: number;
      lineTotal: number;
    }[];
  }>(
    `SELECT s.id, s.sale_no AS "saleNo", s.cash_session_id AS "cashSessionId",
            s.cashier_id AS "cashierId", c.full_name AS "cashierName",
            s.payment_type AS "paymentType", s.subtotal, s.discount, s.total,
            s.amount_tendered AS "amountTendered", s.change_given AS "changeGiven",
            s.gcash_ref_no AS "gcashRefNo", s.status, s.void_reason AS "voidReason",
            v.full_name AS "voidedBy", s.created_at AS "createdAt",
            s.customer_id AS "customerId", cu.name AS "customerName",
            (SELECT json_agg(json_build_object(
                      'productId', i.product_id, 'productName', p.name, 'unitName', u.unit_name,
                      'qty', i.qty, 'unitPrice', i.unit_price, 'lineTotal', i.line_total
                    ) ORDER BY i.id)
             FROM sale_items i
             JOIN products p ON p.id = i.product_id
             JOIN product_units u ON u.id = i.product_unit_id
             WHERE i.sale_id = s.id) AS items
     FROM sales s
     JOIN users c ON c.id = s.cashier_id
     LEFT JOIN users v ON v.id = s.voided_by
     LEFT JOIN customers cu ON cu.id = s.customer_id
     WHERE s.id = $1`,
    [id],
  );
  return rows[0];
}

// Either one cash session (cashier view) or a range of store days (owner view).
export async function listSales(db: Db, f: { sessionId?: number; from?: string; to?: string }) {
  const { rows } = await db.query(
    `SELECT s.id, s.sale_no AS "saleNo", s.created_at AS "createdAt",
            s.payment_type AS "paymentType", s.total, s.status, c.full_name AS "cashierName",
            cu.name AS "customerName",
            (SELECT SUM(qty) FROM sale_items WHERE sale_id = s.id) AS "itemCount"
     FROM sales s JOIN users c ON c.id = s.cashier_id
     LEFT JOIN customers cu ON cu.id = s.customer_id
     WHERE ($1::bigint IS NOT NULL AND s.cash_session_id = $1)
        OR ($1::bigint IS NULL AND ${inStoreDays('s.created_at', '$2', '$3')})
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT 500`, // ponytail: no paging; ~500 sales is several busy days for one store
    [f.sessionId ?? null, f.from ?? null, f.to ?? null],
  );
  return rows;
}

// FOR UPDATE: two people pressing Void on the same sale can't both return the stock.
export async function lockSale(db: Db, id: number) {
  const { rows } = await db.query<{
    id: number;
    saleNo: string;
    status: SaleStatus;
    cashSessionId: number;
    total: number;
    paymentType: PaymentType;
    customerId: number | null;
  }>(
    `SELECT id, sale_no AS "saleNo", status, cash_session_id AS "cashSessionId", total,
            payment_type AS "paymentType", customer_id AS "customerId"
     FROM sales WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0];
}

export async function markVoided(db: Db, id: number, userId: number, reason: string) {
  await db.query(
    `UPDATE sales SET status = 'VOIDED', voided_by = $2, void_reason = $3 WHERE id = $1`,
    [id, userId, reason],
  );
}

// How much stock each product gets back (pack + sticks of the same product add up).
export async function baseQtyPerProduct(db: Db, saleId: number) {
  const { rows } = await db.query<{ productId: number; baseQty: number }>(
    `SELECT product_id AS "productId", SUM(base_qty) AS "baseQty"
     FROM sale_items WHERE sale_id = $1
     GROUP BY product_id ORDER BY product_id`, // id order again: no deadlocks
    [saleId],
  );
  return rows;
}
