import type { Db } from '../../db/pool';
import type { UnitInput } from './products.schema';

export type UnitView = {
  id: number;
  unitName: string;
  factor: number;
  barcode: string | null;
  costCentavos?: number; // removed for cashiers by the service
  priceCentavos: number;
  isDefault: boolean;
};

export type ProductView = {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  baseUnit: string;
  stockQty: number;
  reorderLevel: number;
  isActive: boolean;
  isLowStock: boolean;
  units: UnitView[];
};

// One query returns each product with its active units as a JSON array (json_agg),
// instead of one query per product.
const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.category_id AS "categoryId", c.name AS "categoryName",
         p.base_unit AS "baseUnit", p.stock_qty AS "stockQty", p.reorder_level AS "reorderLevel",
         p.is_active AS "isActive", p.stock_qty <= p.reorder_level AS "isLowStock",
         COALESCE(
           json_agg(json_build_object(
             'id', u.id, 'unitName', u.unit_name, 'factor', u.factor, 'barcode', u.barcode,
             'costCentavos', u.cost_centavos, 'priceCentavos', u.price_centavos,
             'isDefault', u.is_default
           ) ORDER BY u.factor, u.id) FILTER (WHERE u.id IS NOT NULL),
           '[]'
         ) AS units
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN product_units u ON u.product_id = p.id AND u.is_active`;

// In LIKE patterns, % and _ are wildcards and \ escapes. Escape them so a search for "50%"
// means the text "50%", not "anything starting with 50". (Still a bound parameter: no injection.)
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export async function listProducts(
  db: Db,
  f: { search?: string; categoryId?: number; lowStock?: boolean; includeInactive?: boolean },
) {
  const search = f.search ? f.search : null;
  const { rows } = await db.query<ProductView>(
    `${PRODUCT_SELECT}
     WHERE ($1::text IS NULL
            OR p.name ILIKE $1
            OR EXISTS (SELECT 1 FROM product_units b
                       WHERE b.product_id = p.id AND b.is_active AND b.barcode = $2))
       AND ($3::bigint IS NULL OR p.category_id = $3)
       AND (NOT $4::boolean OR p.stock_qty <= p.reorder_level)
       AND ($5::boolean OR p.is_active)
     GROUP BY p.id, c.name
     ORDER BY lower(p.name), p.id
     LIMIT 500`, // ponytail: no paging; a sari-sari store has hundreds of items, not thousands
    [
      search ? `%${escapeLike(search)}%` : null,
      search,
      f.categoryId ?? null,
      f.lowStock ?? false,
      f.includeInactive ?? false,
    ],
  );
  return rows;
}

export async function getProduct(db: Db, id: number) {
  const { rows } = await db.query<ProductView>(
    `${PRODUCT_SELECT} WHERE p.id = $1 GROUP BY p.id, c.name`,
    [id],
  );
  return rows[0];
}

export async function findActiveUnitByBarcode(db: Db, barcode: string) {
  const { rows } = await db.query<{ unitId: number; productId: number }>(
    `SELECT u.id AS "unitId", u.product_id AS "productId"
     FROM product_units u JOIN products p ON p.id = u.product_id
     WHERE u.barcode = $1 AND u.is_active AND p.is_active`,
    [barcode],
  );
  return rows[0];
}

export async function insertProduct(
  db: Db,
  p: { name: string; categoryId: number | null; baseUnit: string; reorderLevel: number },
) {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO products (name, category_id, base_unit, reorder_level)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [p.name, p.categoryId, p.baseUnit, p.reorderLevel],
  );
  return rows[0].id;
}

export async function insertUnit(db: Db, productId: number, u: UnitInput) {
  await db.query(
    `INSERT INTO product_units
       (product_id, unit_name, factor, barcode, cost_centavos, price_centavos, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [productId, u.unitName, u.factor, u.barcode, u.costCentavos, u.priceCentavos, u.isDefault],
  );
}

// FOR UPDATE: nobody else can edit this product (or sell against its units' prices
// in a way that races this edit) until our transaction ends.
export async function lockProduct(db: Db, id: number) {
  const { rows } = await db.query<{ id: number }>(
    'SELECT id FROM products WHERE id = $1 FOR UPDATE',
    [id],
  );
  return rows[0];
}

export type UnitRow = {
  id: number;
  unit_name: string;
  factor: number;
  barcode: string | null;
  cost_centavos: number;
  price_centavos: number;
  is_default: boolean;
  is_active: boolean;
};

// All units, active or not: a "new" unit may reuse the name of a removed one.
export async function lockUnits(db: Db, productId: number) {
  const { rows } = await db.query<UnitRow>(
    `SELECT id, unit_name, factor, barcode, cost_centavos, price_centavos, is_default, is_active
     FROM product_units WHERE product_id = $1 ORDER BY id FOR UPDATE`,
    [productId],
  );
  return rows;
}

export async function updateProduct(
  db: Db,
  id: number,
  p: { name?: string; categoryId?: number | null; reorderLevel?: number; isActive?: boolean },
) {
  await db.query(
    `UPDATE products SET
       name          = COALESCE($2, name),
       category_id   = CASE WHEN $3 THEN $4::bigint ELSE category_id END,
       reorder_level = COALESCE($5, reorder_level),
       is_active     = COALESCE($6, is_active),
       updated_at    = now()
     WHERE id = $1`,
    [
      id,
      p.name ?? null,
      p.categoryId !== undefined, // $3: should the category change at all? (null = remove it)
      p.categoryId ?? null,
      p.reorderLevel ?? null,
      p.isActive ?? null,
    ],
  );
}

// The partial unique index allows only one default per product, so clear them all first,
// then set the new one while updating units (setting it first would briefly make two).
export async function clearDefaultUnits(db: Db, productId: number) {
  await db.query('UPDATE product_units SET is_default = FALSE WHERE product_id = $1', [productId]);
}

// Also re-activates a removed unit that is being added back under the same name.
export async function updateUnit(db: Db, unitId: number, u: UnitInput) {
  await db.query(
    `UPDATE product_units SET
       unit_name = $2, factor = $3, barcode = $4, cost_centavos = $5, price_centavos = $6,
       is_default = $7, is_active = TRUE
     WHERE id = $1`,
    [unitId, u.unitName, u.factor, u.barcode, u.costCentavos, u.priceCentavos, u.isDefault],
  );
}

// Units are never deleted (old sale_items point at them). The barcode is released so it
// can be used on another unit.
export async function deactivateUnit(db: Db, unitId: number) {
  await db.query(
    `UPDATE product_units SET is_active = FALSE, is_default = FALSE, barcode = NULL
     WHERE id = $1`,
    [unitId],
  );
}

export async function insertPriceHistory(
  db: Db,
  h: {
    unitId: number;
    oldPrice: number;
    newPrice: number;
    oldCost: number;
    newCost: number;
    by: number;
  },
) {
  await db.query(
    `INSERT INTO price_history (product_unit_id, old_price, new_price, old_cost, new_cost, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [h.unitId, h.oldPrice, h.newPrice, h.oldCost, h.newCost, h.by],
  );
}

export async function listCategories(db: Db) {
  const { rows } = await db.query<{ id: number; name: string }>(
    'SELECT id, name FROM categories ORDER BY lower(name)',
  );
  return rows;
}

export async function insertCategory(db: Db, name: string) {
  const { rows } = await db.query<{ id: number; name: string }>(
    'INSERT INTO categories (name) VALUES ($1) RETURNING id, name',
    [name],
  );
  return rows[0];
}
