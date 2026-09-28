import type { Db } from '../../db/pool';
import { inStoreDays } from '../../utils/dateRange';

const EXPENSE_SELECT = `
  SELECT e.id, e.category, e.amount, e.paid_from_drawer AS "paidFromDrawer", e.note,
         e.cash_session_id AS "cashSessionId", u.full_name AS "createdBy", e.created_at AS "createdAt"
  FROM expenses e JOIN users u ON u.id = e.created_by`;

export async function insertExpense(
  db: Db,
  e: {
    category: string;
    amount: number;
    paidFromDrawer: boolean;
    note?: string;
    sessionId: number | null;
    createdBy: number;
  },
) {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO expenses (cash_session_id, category, amount, paid_from_drawer, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [e.sessionId, e.category, e.amount, e.paidFromDrawer, e.note || null, e.createdBy],
  );
  return rows[0].id;
}

export async function getExpense(db: Db, id: number) {
  const { rows } = await db.query(`${EXPENSE_SELECT} WHERE e.id = $1`, [id]);
  return rows[0];
}

export async function listExpenses(db: Db, from: string, to: string) {
  const { rows } = await db.query(
    `${EXPENSE_SELECT}
     WHERE ${inStoreDays('e.created_at', '$1', '$2')}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT 500`, // ponytail: no paging; a store records a few expenses a day
    [from, to],
  );
  return rows;
}
