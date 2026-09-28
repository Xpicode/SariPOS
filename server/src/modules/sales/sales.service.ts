import { pool, type Db } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { pgError } from '../../utils/pgError';
import { resolveRange, type DateRange } from '../../utils/dateRange';
import { verifyOwnerPin } from '../auth/auth.service';
import { getOpenSession } from '../cash-sessions/cash-sessions.repository';
import { insertLedger } from '../customers/customers.repository';
import { chargeCheck } from '../customers/customers.service';
import { changeStock } from '../inventory/inventory.repository';
import type { CreateSaleInput, VoidSaleInput } from './sales.schema';
import * as repo from './sales.repository';

type Actor = { id: number; role: Role };

const notFound = () => new AppError(404, 'NOT_FOUND', 'Sale not found');
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

// A key belongs to whoever made it. Replaying someone else's key must not hand back their receipt.
async function replay(db: Db, existing: { id: number; cashierId: number }, userId: number) {
  if (existing.cashierId !== userId) {
    throw new AppError(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'This payment was already used. Start again.',
    );
  }
  return { sale: (await repo.getSale(db, existing.id))!, replayed: true };
}

// Checkout, plan 6.2. Everything inside ONE transaction: if any step fails, nothing is saved.
export async function createSale(input: CreateSaleInput, userId: number) {
  try {
    return await withTransaction(async (db) => {
      // 1. Seen this key before? Then this is a double tap or a retry: return THAT sale.
      const existing = await repo.findByIdempotencyKey(db, input.idempotencyKey);
      if (existing) return replay(db, existing, userId);

      // 2. Every peso must land in a shift, or the end-of-day count can't add up.
      const session = await getOpenSession(db, true);
      if (!session) {
        throw new AppError(409, 'NO_OPEN_SESSION', 'Open the cash drawer before selling');
      }

      // 3. Prices and costs come from the DATABASE. The client only said which unit and how many.
      const units = await repo.loadSellableUnits(
        db,
        input.items.map((i) => i.productUnitId),
      );
      const lines: repo.SaleLine[] = input.items.map((i) => {
        const u = units.get(i.productUnitId);
        if (!u) {
          throw new AppError(
            409,
            'ITEM_UNAVAILABLE',
            'An item in the cart is no longer sold. Remove it and try again.',
          );
        }
        return {
          productId: u.productId,
          productUnitId: u.id,
          qty: i.qty,
          baseQty: i.qty * u.factor, // tingi: 2 packs x 20 = 40 sticks
          unitPrice: u.priceCentavos, // snapshots: later price changes don't rewrite this sale
          unitCost: u.costCentavos,
          lineTotal: u.priceCentavos * i.qty,
        };
      });
      const subtotal = sum(lines.map((l) => l.lineTotal));
      const total = subtotal; // discounts aren't part of Phase 4
      const totalCost = sum(lines.map((l) => l.unitCost * l.qty));
      if (input.expectedTotal !== undefined && input.expectedTotal !== total) {
        throw new AppError(
          409,
          'PRICE_CHANGED',
          'Prices changed while the cart was open. Check the new total with the customer.',
        );
      }

      // 4. Payment.
      let amountTendered: number | null = null;
      let changeGiven: number | null = null;
      let gcashRefNo: string | null = null;
      let customerId: number | null = null;
      if (input.payment.type === 'CASH') {
        amountTendered = input.payment.amountTendered;
        if (amountTendered < total) {
          throw new AppError(400, 'NOT_ENOUGH_CASH', 'The cash received is less than the total');
        }
        changeGiven = amountTendered - total;
      } else if (input.payment.type === 'GCASH') {
        gcashRefNo = input.payment.gcashRefNo;
      } else {
        // UTANG (plan 6.3): blocked or over the limit -> refused. The customer row stays locked
        // until commit, so a second utang for them waits and then sees the new balance.
        customerId = (await chargeCheck(db, input.payment.customerId, total)).id;
      }

      // 5. Stock. A pack and loose sticks of the same product both come out of ONE count,
      //    so add up what each product needs, lock those rows (id order), then check.
      //    The lock makes check + deduct one step: two cashiers can't both sell the last pack.
      const needed = new Map<number, number>();
      for (const l of lines) needed.set(l.productId, (needed.get(l.productId) ?? 0) + l.baseQty);
      const stock = await repo.lockProducts(db, [...needed.keys()]);
      for (const [productId, qty] of needed) {
        const p = stock.get(productId)!;
        if (p.stockQty < qty) {
          throw new AppError(409, 'INSUFFICIENT_STOCK', `Not enough ${p.name} in stock`);
        }
      }

      // 6. Write: receipt number, sale, lines, and one stock-ledger row per product.
      const saleNo = await repo.nextSaleNo(db);
      const saleId = await repo.insertSale(db, {
        saleNo,
        idempotencyKey: input.idempotencyKey,
        sessionId: session.id,
        cashierId: userId,
        paymentType: input.payment.type,
        subtotal,
        total,
        totalCost,
        amountTendered,
        changeGiven,
        gcashRefNo,
        customerId,
      });
      await repo.insertItems(db, saleId, lines);
      for (const [productId, qty] of needed) {
        // CHECK (stock_qty >= 0) is still the last guard if anything above were ever wrong.
        await changeStock(db, {
          productId,
          type: 'SALE',
          qtyChange: -qty,
          referenceId: saleId,
          note: saleNo,
          createdBy: userId,
        });
      }
      // Utang: the debt is a ledger row in the SAME transaction. No sale without its charge,
      // no charge without its sale (the CHECK also requires sale_id on every CHARGE).
      if (customerId) {
        await insertLedger(db, {
          customerId,
          type: 'CHARGE',
          amount: total,
          saleId,
          note: saleNo,
          createdBy: userId,
        });
      }

      return { sale: (await repo.getSale(db, saleId))!, replayed: false };
    });
  } catch (err) {
    // The same key twice at the SAME moment: both passed step 1, the second INSERT waited for
    // the first to commit and then hit the unique index. Answer it with the first sale.
    if (pgError(err).constraint === 'sales_idempotency_key_key') {
      const existing = await repo.findByIdempotencyKey(pool, input.idempotencyKey);
      if (existing) return replay(pool, existing, userId);
    }
    throw err;
  }
}

// Cashiers see the sales of the shift that is open now; owners see everything.
async function visibleTo(actor: Actor, sale: { cashSessionId: number }) {
  if (actor.role === 'OWNER') return true;
  const session = await getOpenSession(pool);
  return session?.id === sale.cashSessionId;
}

export async function getSale(id: number, actor: Actor) {
  const sale = await repo.getSale(pool, id);
  if (!sale || !(await visibleTo(actor, sale))) throw notFound(); // 404, not 403: don't confirm it exists
  return sale;
}

export async function listSales(q: DateRange, actor: Actor) {
  if (actor.role !== 'OWNER') {
    const session = await getOpenSession(pool);
    return session ? repo.listSales(pool, { sessionId: session.id }) : [];
  }
  return repo.listSales(pool, resolveRange(q));
}

// Void (plan 6.6): the sale stays, marked VOIDED; its stock comes back; an audit row says who,
// why, and which owner approved. Nothing is ever deleted.
export async function voidSale(id: number, input: VoidSaleInput, actor: Actor, ip?: string) {
  const existing = await repo.getSale(pool, id);
  if (!existing || !(await visibleTo(actor, existing))) throw notFound();

  // Cashiers need an owner's PIN, checked before anything changes. (The route's pinLimiter
  // allows 5 wrong tries per 15 min, shared with /auth/verify-pin.)
  let approvedBy = actor.id;
  if (actor.role !== 'OWNER') {
    if (!input.pin) {
      throw new AppError(403, 'PIN_REQUIRED', 'An owner must approve this void with their PIN');
    }
    approvedBy = await verifyOwnerPin(input.pin, actor.id, ip);
  }

  return withTransaction(async (db) => {
    const sale = await repo.lockSale(db, id);
    if (!sale) throw notFound();
    if (sale.status === 'VOIDED') {
      throw new AppError(409, 'ALREADY_VOIDED', 'This sale is already voided');
    }
    // A closed shift's drawer count is final. Voiding its sales now would silently make its
    // over/short wrong, so only sales of the open shift can be voided.
    const session = await getOpenSession(db, true);
    if (session?.id !== sale.cashSessionId) {
      throw new AppError(409, 'SHIFT_CLOSED', 'Only sales from the current shift can be voided');
    }

    await repo.markVoided(db, id, actor.id, input.reason);
    for (const { productId, baseQty } of await repo.baseQtyPerProduct(db, id)) {
      await changeStock(db, {
        productId,
        type: 'VOID_RETURN',
        qtyChange: baseQty,
        referenceId: id,
        note: `Void ${sale.saleNo}`,
        createdBy: actor.id,
      });
    }
    // Utang sale: the debt goes away too. Not by editing the charge (the ledger is append-only)
    // but with a reversing ADJUSTMENT, so the statement shows both what happened and the undo.
    if (sale.paymentType === 'UTANG' && sale.customerId) {
      await insertLedger(db, {
        customerId: sale.customerId,
        type: 'ADJUSTMENT',
        amount: -sale.total,
        saleId: id,
        note: `Void ${sale.saleNo}`,
        createdBy: actor.id,
      });
    }
    await writeAudit(db, {
      userId: actor.id,
      action: 'SALE_VOID',
      entity: 'sale',
      entityId: id,
      before: { status: sale.status, total: sale.total, paymentType: sale.paymentType },
      after: { status: 'VOIDED', reason: input.reason, approvedBy },
      ip,
    });
    return (await repo.getSale(db, id))!;
  });
}
