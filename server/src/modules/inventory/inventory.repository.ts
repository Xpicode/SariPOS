import type { Db } from '../../db/pool';

type MovementType = 'STOCK_IN' | 'SALE' | 'VOID_RETURN' | 'ADJUSTMENT' | 'SPOILAGE';

export async function findActiveUnit(db: Db, unitId: number) {
  const { rows } = await db.query<{ productId: number; factor: number; unitName: string }>(
    `SELECT u.product_id AS "productId", u.factor, u.unit_name AS "unitName"
     FROM product_units u JOIN products p ON p.id = u.product_id
     WHERE u.id = $1 AND u.is_active AND p.is_active`,
    [unitId],
  );
  return rows[0];
}

// FOR UPDATE: a sale or another adjustment can't change this stock between our read and write.
export async function lockProductStock(db: Db, productId: number) {
  const { rows } = await db.query<{ stockQty: number }>(
    'SELECT stock_qty AS "stockQty" FROM products WHERE id = $1 FOR UPDATE',
    [productId],
  );
  return rows[0];
}

// The ONLY way stock changes: the cached total and its ledger row, always together
// (callers run this inside withTransaction). The CHECK (stock_qty >= 0) is the last guard.
export async function changeStock(
  db: Db,
  m: {
    productId: number;
    type: MovementType;
    qtyChange: number;
    unitCost?: number | null;
    expiryDate?: string | null;
    note?: string | null;
    referenceId?: number | null; // the sale a SALE / VOID_RETURN belongs to
    createdBy: number;
  },
) {
  const { rows } = await db.query<{ stockQty: number }>(
    `UPDATE products SET stock_qty = stock_qty + $2, updated_at = now()
     WHERE id = $1 RETURNING stock_qty AS "stockQty"`,
    [m.productId, m.qtyChange],
  );
  await db.query(
    `INSERT INTO stock_movements
       (product_id, type, qty_change, unit_cost, expiry_date, note, reference_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      m.productId,
      m.type,
      m.qtyChange,
      m.unitCost ?? null,
      m.expiryDate ?? null,
      m.note ?? null,
      m.referenceId ?? null,
      m.createdBy,
    ],
  );
  return rows[0].stockQty;
}

export async function listMovements(db: Db, productId: number) {
  const { rows } = await db.query(
    `SELECT m.id, m.type, m.qty_change AS "qtyChange", m.unit_cost AS "unitCost",
            to_char(m.expiry_date, 'YYYY-MM-DD') AS "expiryDate", m.note,
            m.created_at AS "createdAt", u.full_name AS "createdBy"
     FROM stock_movements m JOIN users u ON u.id = m.created_by
     WHERE m.product_id = $1
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 100`, // ponytail: newest 100 only; add "load more" paging when a product has more
    [productId],
  );
  return rows;
}

// Which stock-in batches are probably still on the shelf, and expire soon?
// We don't track batches at the counter, so assume FIFO (oldest sells first): the stock on
// hand is made of the NEWEST deliveries. Walking deliveries newest -> oldest, a batch is still
// (partly) on the shelf while the deliveries newer than it add up to less than stock on hand.
export async function listExpiring(db: Db, days: number) {
  const { rows } = await db.query(
    `WITH batches AS (
       SELECT m.id, m.product_id, m.qty_change, m.expiry_date,
              SUM(m.qty_change) OVER (PARTITION BY m.product_id
                                      ORDER BY m.created_at DESC, m.id DESC) - m.qty_change
                AS newer_qty
       FROM stock_movements m
       WHERE m.type = 'STOCK_IN'
     )
     SELECT b.id AS "movementId", p.id AS "productId", p.name, p.base_unit AS "baseUnit",
            to_char(b.expiry_date, 'YYYY-MM-DD') AS "expiryDate",
            LEAST(b.qty_change, p.stock_qty - b.newer_qty) AS "qtyLeft",
            b.expiry_date - (now() AT TIME ZONE 'Asia/Manila')::date AS "daysLeft"
     FROM batches b JOIN products p ON p.id = b.product_id
     WHERE b.expiry_date IS NOT NULL
       AND b.expiry_date <= (now() AT TIME ZONE 'Asia/Manila')::date + $1::int
       AND b.newer_qty < p.stock_qty
       AND p.is_active
     ORDER BY b.expiry_date, p.name`,
    [days],
  );
  return rows;
}
