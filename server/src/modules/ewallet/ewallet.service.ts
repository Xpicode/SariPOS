import { pool, type Db } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { resolveRange, type DateRange } from '../../utils/dateRange';
import { peso } from '../../utils/money';
import { pgError } from '../../utils/pgError';
import { getOpenSession, getTotals } from '../cash-sessions/cash-sessions.repository';
import { expectedCash } from '../cash-sessions/cash-sessions.service';
import { maskPhone } from '../customers/customers.service';
import type {
  FeePreviewInput,
  FeeRulesInput,
  TransactionInput,
  UpdateAccountInput,
} from './ewallet.schema';
import * as repo from './ewallet.repository';
import { quote, type TxnType } from './fee';

type Actor = { id: number; role: Role };

const OWNER_ONLY = new Set<TxnType>(['TOP_UP', 'WITHDRAW']);
const walletNotFound = () => new AppError(404, 'NOT_FOUND', 'Wallet not found');

// Cashiers see a customer's number masked, like utang customers' phones (done on the server,
// so the full number isn't in the response either).
const forRole = (t: repo.TxnView, role: Role) =>
  role === 'OWNER' ? t : { ...t, customerNumber: maskPhone(t.customerNumber) };

// The fee and both pocket changes for this wallet. Used by the preview AND the real transaction,
// so what the cashier is shown is exactly what gets saved.
async function quoteFor(
  db: Db,
  input: { accountId: number; type: TxnType; amount: number; drawer?: boolean },
) {
  const wallet = await repo.getWallet(db, input.accountId);
  if (!wallet) throw walletNotFound();
  // Cash-in/out go through GCash or Maya, load through the load wallet. Top-up/withdraw: any.
  if (!OWNER_ONLY.has(input.type) && (input.type === 'ELOAD') !== (wallet.kind === 'ELOAD')) {
    throw new AppError(
      400,
      'WRONG_WALLET',
      input.type === 'ELOAD' ? 'Load is sent from the load wallet' : 'Use a GCash or Maya wallet',
    );
  }
  const rules =
    input.type === 'CASH_IN' || input.type === 'CASH_OUT'
      ? await repo.feeRules(db, wallet.kind, input.type)
      : [];
  return quote(input.type, input.amount, {
    rules,
    commissionBp: wallet.commissionBp,
    drawer: input.drawer,
  });
}

export const listWallets = () => repo.listWallets(pool);

export const previewFee = (input: FeePreviewInput) => quoteFor(pool, input);

async function replay(db: Db, existing: { id: number; createdBy: number }, actor: Actor) {
  if (existing.createdBy !== actor.id) {
    throw new AppError(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'This transaction was already used. Start again.',
    );
  }
  return {
    transaction: forRole((await repo.getTransaction(db, existing.id))!, actor.role),
    replayed: true,
  };
}

// Cash-in, cash-out, load (anyone) and top-up / withdraw (owner). Plan 6.4, in ONE transaction:
// the row, the wallet balance and the drawer money commit together or not at all.
export async function createTransaction(input: TransactionInput, actor: Actor, ip?: string) {
  if (OWNER_ONLY.has(input.type) && actor.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Only the owner can top up or withdraw');
  }
  const drawer = 'drawer' in input && input.drawer;
  try {
    return await withTransaction(async (db) => {
      // 1. Same key again (double tap, retry after the wifi dropped) = the same transaction.
      const existing = await repo.findByKey(db, input.idempotencyKey);
      if (existing) return replay(db, existing, actor);

      // 2. Fee and pocket changes, computed here. The client only said type, wallet and amount.
      const q = await quoteFor(db, { ...input, drawer });
      if (input.expectedFee !== undefined && input.expectedFee !== q.fee) {
        throw new AppError(
          409,
          'FEE_CHANGED',
          `The fee is now ${peso(q.fee)}. Tell the customer, then confirm again.`,
        );
      }

      // 3. The drawer. Cash moving in or out belongs to the open shift. Paying cash OUT takes the
      //    drawer lock alone ('update'), so two payouts can't both spend the same pesos.
      let sessionId: number | null = null;
      if (q.cashChange !== 0) {
        const paysOut = q.cashChange < 0;
        const session = await getOpenSession(db, paysOut ? 'update' : 'share');
        if (!session) {
          throw new AppError(409, 'NO_OPEN_SESSION', 'Open the cash drawer first: this moves cash');
        }
        if (paysOut) {
          const inDrawer = expectedCash(session.openingCash, await getTotals(db, session.id));
          if (inDrawer + q.cashChange < 0) {
            // Blind count: a cashier isn't told how much the drawer should hold.
            throw new AppError(
              409,
              'NOT_ENOUGH_CASH',
              actor.role === 'OWNER'
                ? `The drawer should only have ${peso(inDrawer)}`
                : 'Not enough cash in the drawer for this',
            );
          }
        }
        sessionId = session.id;
      }

      // 4. The wallet, locked (FOR UPDATE) and re-read, THEN checked: no overspending in a race.
      const wallet = await repo.getWallet(db, input.accountId, true);
      if (!wallet) throw walletNotFound();
      if (wallet.balance + q.walletChange < 0) {
        throw new AppError(
          409,
          'NOT_ENOUGH_BALANCE',
          `${wallet.name} only has ${peso(wallet.balance)}. Top it up first.`,
        );
      }

      // 5. Write: the row (append-only), then the balance.
      const id = await repo.insertTransaction(db, {
        idempotencyKey: input.idempotencyKey,
        sessionId,
        accountId: wallet.id,
        type: input.type,
        amount: input.amount,
        fee: q.fee,
        walletChange: q.walletChange,
        cashChange: q.cashChange,
        customerNumber: ('customerNumber' in input && input.customerNumber) || null,
        referenceNo: input.referenceNo ?? null,
        telco: input.type === 'ELOAD' ? input.telco : null,
        createdBy: actor.id,
      });
      await repo.changeBalance(db, wallet.id, q.walletChange);
      if (OWNER_ONLY.has(input.type)) {
        // The owner moving float in or out: traceable, like expenses (plan 8.2 A09).
        await writeAudit(db, {
          userId: actor.id,
          action: input.type === 'TOP_UP' ? 'EWALLET_TOP_UP' : 'EWALLET_WITHDRAW',
          entity: 'ewallet_transaction',
          entityId: id,
          after: { wallet: wallet.name, amount: input.amount, drawer },
          ip,
        });
      }
      return {
        transaction: forRole((await repo.getTransaction(db, id))!, actor.role),
        replayed: false,
      };
    });
  } catch (err) {
    // The same key at the same moment: the second insert hit a unique index. It may be the
    // reference index (same ref no) that fires first, so look for the key before blaming the ref.
    const constraint = pgError(err).constraint;
    if (
      constraint === 'ewallet_transactions_idempotency_key_key' ||
      constraint === 'ewallet_reference_once'
    ) {
      const existing = await repo.findByKey(pool, input.idempotencyKey);
      if (existing) return replay(pool, existing, actor);
      if (constraint === 'ewallet_reference_once') {
        throw new AppError(
          409,
          'DUPLICATE_REFERENCE',
          'This reference number is already recorded. Check the receipt again.',
        );
      }
    }
    throw err;
  }
}

// Cashiers: the open shift's transactions. Owner: any store day(s).
export async function listTransactions(q: DateRange, actor: Actor) {
  if (actor.role !== 'OWNER') {
    const session = await getOpenSession(pool);
    if (!session) return [];
    return (await repo.listTransactions(pool, { sessionId: session.id })).map((t) =>
      forRole(t, actor.role),
    );
  }
  return repo.listTransactions(pool, resolveRange(q));
}

export async function updateWallet(
  id: number,
  input: UpdateAccountInput,
  actorId: number,
  ip?: string,
) {
  return withTransaction(async (db) => {
    const before = await repo.getWallet(db, id, true);
    if (!before) throw walletNotFound();
    if (input.commissionBp && before.kind !== 'ELOAD') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Only a load wallet earns a commission');
    }
    await repo.updateWallet(db, id, input);
    const after = (await repo.getWallet(db, id))!;
    await writeAudit(db, {
      userId: actorId,
      action: 'EWALLET_SETTINGS_UPDATED',
      entity: 'ewallet_account',
      entityId: id,
      before: { lowBalanceAlert: before.lowBalanceAlert, commissionBp: before.commissionBp },
      after: { lowBalanceAlert: after.lowBalanceAlert, commissionBp: after.commissionBp },
      ip,
    });
    return after;
  });
}

export const listFeeRules = () => repo.allFeeRules(pool);

// Replace one fee table ("GCash cash-in"). Brackets come as "up to"; each starts one centavo
// after the previous one ends, so every amount up to the last "up to" has exactly one fee.
export async function saveFeeRules(input: FeeRulesInput, actorId: number, ip?: string) {
  const rules = input.brackets.map((b, i) => ({
    minAmount: i === 0 ? 1 : input.brackets[i - 1].upTo + 1,
    maxAmount: b.upTo,
    fee: b.fee,
  }));
  return withTransaction(async (db) => {
    const before = await repo.feeRules(db, input.walletKind, input.txnType);
    await repo.replaceFeeRules(db, input.walletKind, input.txnType, rules);
    // Fees are money taken from customers: every change is traceable (plan 8.2 A09).
    await writeAudit(db, {
      userId: actorId,
      action: 'FEE_RULES_UPDATED',
      entity: 'fee_rules',
      before: { walletKind: input.walletKind, txnType: input.txnType, rules: before },
      after: { walletKind: input.walletKind, txnType: input.txnType, rules },
      ip,
    });
    return repo.allFeeRules(db);
  });
}
