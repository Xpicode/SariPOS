import { pool, type Db } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { resolveRange, type DateRange } from '../../utils/dateRange';
import { pgError } from '../../utils/pgError';
import type { CloseSessionInput } from './cash-sessions.schema';
import * as repo from './cash-sessions.repository';

type Totals = Awaited<ReturnType<typeof repo.getTotals>>;

// Plan 6.5: what SHOULD be in the drawer.
//   opening cash + cash sales (not voided) + utang payments received + e-wallet cash in/out
//   − expenses paid from the drawer
// GCash and utang SALES are not here: no cash came in for them at the counter.
export const expectedCash = (openingCash: number, t: Totals) =>
  openingCash + t.cashSales + t.utangPayments + t.ewalletCash - t.drawerExpenses;

// The shift summary (the "Z-report" once closed).
async function buildReport(db: Db, id: number) {
  const head = await repo.getSessionHead(db, id);
  if (!head) return null;
  const t = await repo.getTotals(db, id);
  const open = head.closedAt === null;
  return {
    ...head,
    status: open ? ('OPEN' as const) : ('CLOSED' as const),
    sales: {
      cashCount: t.cashCount,
      cashTotal: t.cashSales as number | null,
      gcashCount: t.gcashCount,
      gcashTotal: t.gcashSales as number | null,
      voidedCount: t.voidedCount,
      voidedTotal: t.voidedTotal as number | null,
      utangCount: t.utangCount,
      utangTotal: t.utangSales as number | null,
    },
    utangPayments: t.utangPayments as number | null,
    utangPaymentCount: t.utangPaymentCount,
    ewalletCash: t.ewalletCash as number | null,
    drawerExpenses: t.drawerExpenses,
    expenses: await repo.listDrawerExpenses(db, id),
    // Open: live figure. Closed: the figure saved at closing time (the official record).
    expectedCash: open ? expectedCash(head.openingCash, t) : head.expectedCash,
  };
}

type Report = NonNullable<Awaited<ReturnType<typeof buildReport>>>;

// BLIND COUNT. While the shift is open, a cashier doesn't see how much the drawer "should" have
// (nor the cash totals that would let them work it out). Otherwise extra cash, e.g. a customer who
// overpaid, could be pocketed and the count reported as "exact". Once their count is saved it can't
// change, so the closed report (with over/short) is shown in full. The owner always sees everything.
function forRole(r: Report, role: Role): Report {
  if (role === 'OWNER' || r.status === 'CLOSED') return r;
  return {
    ...r,
    expectedCash: null,
    ewalletCash: null,
    utangPayments: null,
    sales: { ...r.sales, cashTotal: null, gcashTotal: null, voidedTotal: null, utangTotal: null },
  };
}

export async function getCurrent(role: Role) {
  const open = await repo.getOpenSession(pool);
  if (!open) return null;
  return forRole((await buildReport(pool, open.id))!, role);
}

export async function openSession(openingCash: number, userId: number, role: Role, ip?: string) {
  try {
    const report = await withTransaction(async (db) => {
      const id = await repo.insertSession(db, userId, openingCash);
      await writeAudit(db, {
        userId,
        action: 'CASH_SESSION_OPENED',
        entity: 'cash_session',
        entityId: id,
        after: { openingCash },
        ip,
      });
      return (await buildReport(db, id))!;
    });
    return forRole(report, role);
  } catch (err) {
    // Two phones pressing "Open" at the same moment: the unique index lets only one win.
    if (pgError(err).constraint === 'one_open_session') {
      throw new AppError(409, 'SESSION_ALREADY_OPEN', 'The drawer is already open');
    }
    throw err;
  }
}

export async function closeSession(
  id: number,
  input: CloseSessionInput,
  userId: number,
  ip?: string,
) {
  return withTransaction(async (db) => {
    // Lock first: sales already saving finish, new ones wait, and a second "Close" (double tap,
    // another phone) waits here and then sees ALREADY_CLOSED.
    const session = await repo.lockSession(db, id);
    if (!session) throw new AppError(404, 'NOT_FOUND', 'Shift not found');
    if (session.closedAt) throw new AppError(409, 'ALREADY_CLOSED', 'This shift is already closed');

    // Computed by the SERVER, after the lock. The client only sends what it counted.
    const expected = expectedCash(session.openingCash, await repo.getTotals(db, id));
    await repo.closeSession(db, {
      id,
      closedBy: userId,
      expectedCash: expected,
      actualCash: input.actualCash,
      cashCount: input.cashCount as Record<string, number> | undefined,
      notes: input.notes,
    });
    await writeAudit(db, {
      userId,
      action: 'CASH_SESSION_CLOSED',
      entity: 'cash_session',
      entityId: id,
      after: {
        expectedCash: expected,
        actualCash: input.actualCash,
        overShort: input.actualCash - expected,
      },
      ip,
    });
    return (await buildReport(db, id))!; // closed -> full report, for everyone
  });
}

export async function getReport(id: number) {
  const report = await buildReport(pool, id);
  if (!report) throw new AppError(404, 'NOT_FOUND', 'Shift not found');
  return report;
}

export const listSessions = (q: DateRange) => {
  const { from, to } = resolveRange(q);
  return repo.listSessions(pool, from, to);
};
