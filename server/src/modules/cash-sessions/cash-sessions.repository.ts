import type { Db } from '../../db/pool';
import { inStoreDays } from '../../utils/dateRange';

export type OpenSession = { id: number; openingCash: number; openedAt: Date; openedBy: string };

// The store has one drawer, so at most one open session (unique index one_open_session).
// Lock it inside a transaction that moves drawer money:
//   'share'  (sale, void, expense, payment in): many can run at once, but closing the drawer
//            (FOR UPDATE, below) waits until they commit, so nothing lands in a closed shift.
//   'update' (cash paid OUT after checking there's enough): one at a time, so two payouts can't
//            both spend the same cash. Take it directly: upgrading SHARE -> UPDATE can deadlock.
export async function getOpenSession(db: Db, lock: false | 'share' | 'update' = false) {
  const { rows } = await db.query<OpenSession>(
    `SELECT s.id, s.opening_cash AS "openingCash", s.opened_at AS "openedAt",
            u.full_name AS "openedBy"
     FROM cash_sessions s JOIN users u ON u.id = s.opened_by
     WHERE s.closed_at IS NULL
     ${lock === 'share' ? 'FOR SHARE OF s' : lock === 'update' ? 'FOR UPDATE OF s' : ''}`,
  );
  return rows[0] ?? null;
}

export async function insertSession(db: Db, openedBy: number, openingCash: number) {
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO cash_sessions (opened_by, opening_cash) VALUES ($1, $2) RETURNING id',
    [openedBy, openingCash],
  );
  return rows[0].id;
}

// FOR UPDATE: waits for sales/expenses already in progress, then blocks new ones until we commit.
export async function lockSession(db: Db, id: number) {
  const { rows } = await db.query<{ id: number; closedAt: Date | null; openingCash: number }>(
    `SELECT id, closed_at AS "closedAt", opening_cash AS "openingCash"
     FROM cash_sessions WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0];
}

export async function getSessionHead(db: Db, id: number) {
  const { rows } = await db.query<{
    id: number;
    openedAt: Date;
    openedBy: string;
    closedAt: Date | null;
    closedBy: string | null;
    openingCash: number;
    expectedCash: number | null; // stored when closed
    actualCash: number | null;
    overShort: number | null;
    cashCount: Record<string, number> | null;
    notes: string | null;
  }>(
    `SELECT s.id, s.opened_at AS "openedAt", o.full_name AS "openedBy",
            s.closed_at AS "closedAt", c.full_name AS "closedBy",
            s.opening_cash AS "openingCash", s.expected_cash AS "expectedCash",
            s.actual_cash AS "actualCash", s.over_short AS "overShort",
            s.cash_count AS "cashCount", s.notes
     FROM cash_sessions s
     JOIN users o ON o.id = s.opened_by
     LEFT JOIN users c ON c.id = s.closed_by
     WHERE s.id = $1`,
    [id],
  );
  return rows[0];
}

// Everything that moved money during the shift, in ONE query.
// FILTER picks rows per total; COALESCE turns "no rows" (NULL) into 0; ::bigint because SUM of a
// BIGINT is NUMERIC, which the pg driver would hand back as a string.
export async function getTotals(db: Db, id: number) {
  const { rows } = await db.query<{
    cashSales: number;
    cashCount: number;
    gcashSales: number;
    gcashCount: number;
    voidedTotal: number;
    voidedCount: number;
    utangSales: number;
    utangCount: number;
    utangPayments: number;
    utangPaymentCount: number;
    ewalletCash: number;
    ewalletCount: number;
    drawerExpenses: number;
  }>(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE payment_type = 'CASH'  AND status = 'COMPLETED'), 0)::bigint AS "cashSales",
       COUNT(*)            FILTER (WHERE payment_type = 'CASH'  AND status = 'COMPLETED')            AS "cashCount",
       COALESCE(SUM(total) FILTER (WHERE payment_type = 'GCASH' AND status = 'COMPLETED'), 0)::bigint AS "gcashSales",
       COUNT(*)            FILTER (WHERE payment_type = 'GCASH' AND status = 'COMPLETED')            AS "gcashCount",
       COALESCE(SUM(total) FILTER (WHERE status = 'VOIDED'), 0)::bigint                               AS "voidedTotal",
       COUNT(*)            FILTER (WHERE status = 'VOIDED')                                           AS "voidedCount",
       COALESCE(SUM(total) FILTER (WHERE payment_type = 'UTANG' AND status = 'COMPLETED'), 0)::bigint AS "utangSales",
       COUNT(*)            FILTER (WHERE payment_type = 'UTANG' AND status = 'COMPLETED')            AS "utangCount",
       (SELECT COALESCE(-SUM(amount), 0)::bigint FROM credit_ledger
        WHERE cash_session_id = $1 AND type = 'PAYMENT')                                              AS "utangPayments",
       (SELECT COUNT(*) FROM credit_ledger
        WHERE cash_session_id = $1 AND type = 'PAYMENT')                                              AS "utangPaymentCount",
       (SELECT COALESCE(SUM(cash_change), 0)::bigint FROM ewallet_transactions
        WHERE cash_session_id = $1 AND status = 'COMPLETED')                                          AS "ewalletCash",
       (SELECT COUNT(*) FROM ewallet_transactions
        WHERE cash_session_id = $1 AND status = 'COMPLETED')                                          AS "ewalletCount",
       (SELECT COALESCE(SUM(amount), 0)::bigint FROM expenses
        WHERE cash_session_id = $1 AND paid_from_drawer)                                              AS "drawerExpenses"
     FROM sales WHERE cash_session_id = $1`,
    [id],
  );
  return rows[0];
}

export async function listDrawerExpenses(db: Db, sessionId: number) {
  const { rows } = await db.query(
    `SELECT e.id, e.category, e.amount, e.note, u.full_name AS "createdBy", e.created_at AS "createdAt"
     FROM expenses e JOIN users u ON u.id = e.created_by
     WHERE e.cash_session_id = $1 AND e.paid_from_drawer
     ORDER BY e.created_at, e.id`,
    [sessionId],
  );
  return rows;
}

export async function closeSession(
  db: Db,
  s: {
    id: number;
    closedBy: number;
    expectedCash: number;
    actualCash: number;
    cashCount?: Record<string, number>;
    notes?: string;
  },
) {
  await db.query(
    `UPDATE cash_sessions
     SET closed_at = now(), closed_by = $2, expected_cash = $3, actual_cash = $4,
         cash_count = $5, notes = $6
     WHERE id = $1`,
    [
      s.id,
      s.closedBy,
      s.expectedCash,
      s.actualCash,
      s.cashCount ? JSON.stringify(s.cashCount) : null,
      s.notes || null,
    ],
  );
}

// Owner's shift history. over_short is computed by the database (GENERATED column).
export async function listSessions(db: Db, from: string, to: string) {
  const { rows } = await db.query(
    `SELECT s.id, s.opened_at AS "openedAt", o.full_name AS "openedBy",
            s.closed_at AS "closedAt", c.full_name AS "closedBy",
            s.opening_cash AS "openingCash", s.expected_cash AS "expectedCash",
            s.actual_cash AS "actualCash", s.over_short AS "overShort"
     FROM cash_sessions s
     JOIN users o ON o.id = s.opened_by
     LEFT JOIN users c ON c.id = s.closed_by
     WHERE ${inStoreDays('s.opened_at', '$1', '$2')}
     ORDER BY s.opened_at DESC
     LIMIT 200`,
    [from, to],
  );
  return rows;
}
