import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { NUMERIC_OUT_OF_RANGE, pgError } from '../../utils/pgError';
import { todayInManila } from '../../utils/time';
import { getProduct } from '../products/products.repository';
import type { AdjustInput, StockInInput } from './inventory.schema';
import * as repo from './inventory.repository';

const tooMuchStock = () =>
  new AppError(400, 'STOCK_TOO_LARGE', 'That would make the stock count too large');

export async function stockIn(input: StockInInput, userId: number) {
  if (input.expiryDate && input.expiryDate < todayInManila()) {
    throw new AppError(400, 'ALREADY_EXPIRED', 'That expiry date has already passed');
  }
  try {
    return await withTransaction(async (db) => {
      const unit = await repo.findActiveUnit(db, input.productUnitId);
      if (!unit) throw new AppError(404, 'NOT_FOUND', 'Product or unit not found');

      // Tingi: stock is counted in base units. 1 ream (factor 200) = 200 sticks.
      const baseQty = input.qty * unit.factor;
      await repo.changeStock(db, {
        productId: unit.productId,
        type: 'STOCK_IN',
        qtyChange: baseQty,
        // Ledger cost is per BASE unit. ponytail: rounded to the centavo (₱48/kilo -> ₱0.05/g);
        // store the unit id + unit cost on the movement if exact batch costing is ever needed.
        unitCost:
          input.costCentavos === undefined ? null : Math.round(input.costCentavos / unit.factor),
        expiryDate: input.expiryDate,
        note: input.note,
        createdBy: userId,
      });
      return { product: await getProduct(db, unit.productId), addedBaseQty: baseQty };
    });
  } catch (err) {
    if (pgError(err).code === NUMERIC_OUT_OF_RANGE) throw tooMuchStock(); // INT stock overflow
    throw err;
  }
}

export async function adjustStock(input: AdjustInput, userId: number, ip?: string) {
  return withTransaction(async (db) => {
    const locked = await repo.lockProductStock(db, input.productId);
    if (!locked) throw new AppError(404, 'NOT_FOUND', 'Product not found');
    const before = locked.stockQty;

    let qtyChange: number;
    if (input.type === 'SPOILAGE') {
      if (input.qty > before) {
        throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${before} in stock`);
      }
      qtyChange = -input.qty;
    } else {
      qtyChange = input.countedQty - before;
      if (qtyChange === 0) throw new AppError(400, 'NO_CHANGE', 'The count already matches');
    }

    const after = await repo.changeStock(db, {
      productId: input.productId,
      type: input.type,
      qtyChange,
      note: input.reason,
      createdBy: userId,
    });
    // Adjustments are where stock quietly "disappears", so each one is audited (plan 8.2 A09).
    await writeAudit(db, {
      userId,
      action: input.type === 'SPOILAGE' ? 'STOCK_SPOILAGE' : 'STOCK_ADJUSTMENT',
      entity: 'product',
      entityId: input.productId,
      before: { stockQty: before },
      after: { stockQty: after, qtyChange, reason: input.reason },
      ip,
    });
    return { product: await getProduct(db, input.productId), qtyChange };
  });
}

export const listMovements = (productId: number) => repo.listMovements(pool, productId);

export const listExpiring = (days: number) => repo.listExpiring(pool, days);
