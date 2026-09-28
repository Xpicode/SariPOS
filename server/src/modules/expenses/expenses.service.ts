import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { resolveRange, type DateRange } from '../../utils/dateRange';
import { getOpenSession } from '../cash-sessions/cash-sessions.repository';
import type { CreateExpenseInput } from './expenses.schema';
import * as repo from './expenses.repository';

export async function createExpense(
  input: CreateExpenseInput,
  actor: { id: number; role: Role },
  ip?: string,
) {
  // A cashier records money that left THEIR drawer (ice delivery, plastic bags). Withdrawals and
  // bills the owner paid from elsewhere are the owner's to record.
  if (actor.role !== 'OWNER') {
    if (input.category === 'OWNER_WITHDRAWAL') {
      throw new AppError(403, 'FORBIDDEN', 'Only the owner can record a withdrawal');
    }
    if (!input.paidFromDrawer) {
      throw new AppError(403, 'FORBIDDEN', 'Cashiers record only money paid from the drawer');
    }
  }

  return withTransaction(async (db) => {
    // Drawer money belongs to the open shift, or closing would never account for it.
    // FOR SHARE: if someone is closing the drawer right now, we wait, then see it's closed.
    let sessionId: number | null = null;
    if (input.paidFromDrawer) {
      const session = await getOpenSession(db, true);
      if (!session) {
        throw new AppError(
          409,
          'NO_OPEN_SESSION',
          'Open the cash drawer first: the money comes from it',
        );
      }
      sessionId = session.id;
    }
    const id = await repo.insertExpense(db, { ...input, sessionId, createdBy: actor.id });
    // Money leaving the store: always traceable to a person (plan 8.2 A09).
    await writeAudit(db, {
      userId: actor.id,
      action: 'EXPENSE_RECORDED',
      entity: 'expense',
      entityId: id,
      after: {
        category: input.category,
        amount: input.amount,
        paidFromDrawer: input.paidFromDrawer,
      },
      ip,
    });
    return repo.getExpense(db, id);
  });
}

export const listExpenses = (q: DateRange) => {
  const { from, to } = resolveRange(q);
  return repo.listExpenses(pool, from, to);
};
