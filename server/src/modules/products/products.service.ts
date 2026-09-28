import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { FOREIGN_KEY_VIOLATION, pgError, UNIQUE_VIOLATION } from '../../utils/pgError';
import type { CreateProductInput, ListQuery, UpdateProductInput } from './products.schema';
import * as repo from './products.repository';

type Actor = { id: number; role: Role };

// A cashier can see prices (they sell) but not costs: cost minus price = the store's margin,
// which is owner-only information (plan: cashiers can't see profit).
function forRole<T extends repo.ProductView>(p: T, role: Role): T {
  if (role === 'OWNER') return p;
  return { ...p, units: p.units.map(({ costCentavos: _hidden, ...u }) => u) };
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Product not found');

// Turns constraint errors into messages a person can act on.
function translateDbError(err: unknown): never {
  const { code, constraint } = pgError(err);
  if (code === UNIQUE_VIOLATION && constraint === 'product_units_barcode_key') {
    throw new AppError(409, 'BARCODE_TAKEN', 'That barcode is already used by another product');
  }
  if (code === UNIQUE_VIOLATION && constraint === 'product_units_product_id_unit_name_key') {
    throw new AppError(409, 'UNIT_NAME_TAKEN', 'Two units can’t have the same name');
  }
  if (code === FOREIGN_KEY_VIOLATION && constraint === 'products_category_id_fkey') {
    throw new AppError(400, 'INVALID_CATEGORY', 'That category doesn’t exist');
  }
  throw err;
}

export async function listProducts(q: ListQuery, actor: Actor) {
  // Only owners may list deactivated products.
  const includeInactive = actor.role === 'OWNER' && q.includeInactive;
  const rows = await repo.listProducts(pool, { ...q, includeInactive });
  return rows.map((p) => forRole(p, actor.role));
}

export async function getProduct(id: number, actor: Actor) {
  const product = await repo.getProduct(pool, id);
  if (!product || (!product.isActive && actor.role !== 'OWNER')) throw notFound();
  return forRole(product, actor.role);
}

export async function getByBarcode(barcode: string, actor: Actor) {
  const hit = await repo.findActiveUnitByBarcode(pool, barcode);
  if (!hit) throw new AppError(404, 'NOT_FOUND', 'No product has this barcode');
  const product = await repo.getProduct(pool, hit.productId);
  return { product: forRole(product, actor.role), unitId: hit.unitId };
}

export async function createProduct(input: CreateProductInput, actor: Actor, ip?: string) {
  try {
    return await withTransaction(async (db) => {
      const id = await repo.insertProduct(db, input);
      for (const unit of input.units) await repo.insertUnit(db, id, unit);
      const product = await repo.getProduct(db, id);
      await writeAudit(db, {
        userId: actor.id,
        action: 'PRODUCT_CREATED',
        entity: 'product',
        entityId: id,
        after: product,
        ip,
      });
      return product;
    });
  } catch (err) {
    translateDbError(err);
  }
}

export async function updateProduct(
  id: number,
  input: UpdateProductInput,
  actor: Actor,
  ip?: string,
) {
  try {
    return await withTransaction(async (db) => {
      if (!(await repo.lockProduct(db, id))) throw notFound();
      const before = await repo.getProduct(db, id);

      await repo.updateProduct(db, id, input);
      if (input.units) await syncUnits(db, id, input.units, actor, ip);

      const after = await repo.getProduct(db, id);
      await writeAudit(db, {
        userId: actor.id,
        action: 'PRODUCT_UPDATED',
        entity: 'product',
        entityId: id,
        before,
        after,
        ip,
      });
      return after;
    });
  } catch (err) {
    translateDbError(err);
  }
}

// Makes the product's active units match `units` exactly:
//   has id           -> update that unit (price/cost change -> price_history + audit)
//   no id, old name  -> bring the removed unit back (unit names are unique per product)
//   no id, new name  -> insert
//   not in the list  -> deactivate (never delete: old sales point at it)
async function syncUnits(
  db: Parameters<typeof repo.lockUnits>[0],
  productId: number,
  units: NonNullable<UpdateProductInput['units']>,
  actor: Actor,
  ip?: string,
) {
  const existing = await repo.lockUnits(db, productId);
  const byId = new Map(existing.map((u) => [u.id, u]));

  // An id from another product, or a removed unit, must not be editable through this product.
  for (const u of units) {
    if (u.id !== undefined && !byId.get(u.id)?.is_active) {
      throw new AppError(400, 'INVALID_UNIT', 'One of the units doesn’t belong to this product');
    }
  }

  await repo.clearDefaultUnits(db, productId);

  const keep = new Set(units.map((u) => u.id).filter((x) => x !== undefined));
  const removed = new Set<number>();
  for (const old of existing) {
    if (old.is_active && !keep.has(old.id)) {
      await repo.deactivateUnit(db, old.id);
      removed.add(old.id);
    }
  }
  const reusable = (e: repo.UnitRow) => !e.is_active || removed.has(e.id);

  // Existing units first, new ones last: renaming "pack" -> "box" and adding a new "pack"
  // in the same save must not collide on the unique (product, unit name) rule.
  const ordered = [...units].sort(
    (a, b) => Number(a.id === undefined) - Number(b.id === undefined),
  );

  for (const u of ordered) {
    const old =
      u.id !== undefined
        ? byId.get(u.id)
        : existing.find((e) => reusable(e) && e.unit_name === u.unitName);

    if (!old) {
      await repo.insertUnit(db, productId, u);
      continue;
    }

    await repo.updateUnit(db, old.id, u);
    if (old.price_centavos !== u.priceCentavos || old.cost_centavos !== u.costCentavos) {
      const change = {
        unitId: old.id,
        oldPrice: old.price_centavos,
        newPrice: u.priceCentavos,
        oldCost: old.cost_centavos,
        newCost: u.costCentavos,
        by: actor.id,
      };
      await repo.insertPriceHistory(db, change);
      await writeAudit(db, {
        userId: actor.id,
        action: 'PRICE_CHANGE',
        entity: 'product_unit',
        entityId: old.id,
        before: { priceCentavos: change.oldPrice, costCentavos: change.oldCost },
        after: { priceCentavos: change.newPrice, costCentavos: change.newCost },
        ip,
      });
    }
  }
}

export const listCategories = () => repo.listCategories(pool);

export async function createCategory(name: string) {
  try {
    return await repo.insertCategory(pool, name);
  } catch (err) {
    if (pgError(err).code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'CATEGORY_TAKEN', 'That category already exists');
    }
    throw err;
  }
}
