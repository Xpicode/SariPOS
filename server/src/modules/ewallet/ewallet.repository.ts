import type { Db } from '../../db/pool';
import { inStoreDays } from '../../utils/dateRange';
import type { FeeRule, TxnType } from './fee';

export type WalletKind = 'GCASH' | 'MAYA' | 'ELOAD';

export type Wallet = {
  id: number;
  name: string;
  kind: WalletKind;
  balance: number;
  lowBalanceAlert: number;
  commissionBp: number;
  isLow: boolean;
};

const WALLET_SELECT = `
  SELECT id, name, kind, balance, low_balance_alert AS "lowBalanceAlert",
         commission_bp AS "commissionBp", balance < low_balance_alert AS "isLow"
  FROM ewallet_accounts`;

export async function listWallets(db: Db) {
  const { rows } = await db.query<Wallet>(`${WALLET_SELECT} WHERE is_active ORDER BY id`);
  return rows;
}

// lock = FOR UPDATE: two transactions on the same wallet wait in line, so both can't spend the
// same balance (plan: "Lock the wallet row so two cashiers can't overspend").
export async function getWallet(db: Db, id: number, lock = false) {
  const { rows } = await db.query<Wallet>(
    `${WALLET_SELECT} WHERE id = $1 AND is_active ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0];
}

// The store's GCash, where customers' GCash payments for goods land.
// ponytail: the first active GCash wallet; let the cashier pick one if a store runs several.
export async function lockStoreGcash(db: Db) {
  const { rows } = await db.query<Wallet>(
    `${WALLET_SELECT} WHERE kind = 'GCASH' AND is_active ORDER BY id LIMIT 1 FOR UPDATE`,
  );
  return rows[0];
}

// The CHECK (balance >= 0) is the last guard; callers check first for a friendly message.
export async function changeBalance(db: Db, id: number, delta: number) {
  await db.query('UPDATE ewallet_accounts SET balance = balance + $2 WHERE id = $1', [id, delta]);
}

export async function updateWallet(
  db: Db,
  id: number,
  w: { lowBalanceAlert?: number; commissionBp?: number },
) {
  await db.query(
    `UPDATE ewallet_accounts SET
       low_balance_alert = COALESCE($2, low_balance_alert),
       commission_bp     = COALESCE($3, commission_bp)
     WHERE id = $1`,
    [id, w.lowBalanceAlert ?? null, w.commissionBp ?? null],
  );
}

export async function feeRules(db: Db, kind: WalletKind, txnType: 'CASH_IN' | 'CASH_OUT') {
  const { rows } = await db.query<FeeRule>(
    `SELECT min_amount AS "minAmount", max_amount AS "maxAmount", fee
     FROM fee_rules WHERE wallet_kind = $1 AND txn_type = $2 ORDER BY min_amount`,
    [kind, txnType],
  );
  return rows;
}

export async function allFeeRules(db: Db) {
  const { rows } = await db.query(
    `SELECT wallet_kind AS "walletKind", txn_type AS "txnType",
            min_amount AS "minAmount", max_amount AS "maxAmount", fee
     FROM fee_rules ORDER BY wallet_kind, txn_type, min_amount`,
  );
  return rows as (FeeRule & { walletKind: WalletKind; txnType: 'CASH_IN' | 'CASH_OUT' })[];
}

// Swap one fee table for a new one (inside a transaction: all or nothing).
// EXCLUSIVE lock: two owners saving at once take turns; reading fees is never blocked.
export async function replaceFeeRules(
  db: Db,
  kind: WalletKind,
  txnType: 'CASH_IN' | 'CASH_OUT',
  rules: FeeRule[],
) {
  await db.query('LOCK TABLE fee_rules IN EXCLUSIVE MODE');
  await db.query('DELETE FROM fee_rules WHERE wallet_kind = $1 AND txn_type = $2', [kind, txnType]);
  await db.query(
    `INSERT INTO fee_rules (wallet_kind, txn_type, min_amount, max_amount, fee)
     SELECT $1, $2, * FROM unnest($3::bigint[], $4::bigint[], $5::bigint[])`,
    [
      kind,
      txnType,
      rules.map((r) => r.minAmount),
      rules.map((r) => r.maxAmount),
      rules.map((r) => r.fee),
    ],
  );
}

export async function findByKey(db: Db, key: string) {
  const { rows } = await db.query<{ id: number; createdBy: number }>(
    'SELECT id, created_by AS "createdBy" FROM ewallet_transactions WHERE idempotency_key = $1',
    [key],
  );
  return rows[0];
}

export async function insertTransaction(
  db: Db,
  t: {
    idempotencyKey: string;
    sessionId: number | null;
    accountId: number;
    type: TxnType;
    amount: number;
    fee: number;
    walletChange: number;
    cashChange: number;
    customerNumber: string | null;
    referenceNo: string | null;
    telco: string | null;
    createdBy: number;
  },
) {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO ewallet_transactions
       (idempotency_key, cash_session_id, account_id, type, amount, fee, wallet_change,
        cash_change, customer_number, reference_no, telco, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      t.idempotencyKey,
      t.sessionId,
      t.accountId,
      t.type,
      t.amount,
      t.fee,
      t.walletChange,
      t.cashChange,
      t.customerNumber,
      t.referenceNo,
      t.telco,
      t.createdBy,
    ],
  );
  return rows[0].id;
}

export type TxnView = {
  id: number;
  type: TxnType;
  accountId: number;
  accountName: string;
  amount: number;
  fee: number;
  walletChange: number;
  cashChange: number;
  customerNumber: string | null;
  referenceNo: string | null;
  telco: string | null;
  cashSessionId: number | null;
  createdBy: string;
  createdAt: Date;
};

const TXN_SELECT = `
  SELECT t.id, t.type, t.account_id AS "accountId", a.name AS "accountName", t.amount, t.fee,
         t.wallet_change AS "walletChange", t.cash_change AS "cashChange",
         t.customer_number AS "customerNumber", t.reference_no AS "referenceNo", t.telco,
         t.cash_session_id AS "cashSessionId", u.full_name AS "createdBy", t.created_at AS "createdAt"
  FROM ewallet_transactions t
  JOIN ewallet_accounts a ON a.id = t.account_id
  JOIN users u ON u.id = t.created_by`;

export async function getTransaction(db: Db, id: number) {
  const { rows } = await db.query<TxnView>(`${TXN_SELECT} WHERE t.id = $1`, [id]);
  return rows[0];
}

// One shift (cashier view) or a range of store days (owner view).
export async function listTransactions(
  db: Db,
  f: { sessionId?: number; from?: string; to?: string },
) {
  const { rows } = await db.query<TxnView>(
    `${TXN_SELECT}
     WHERE ($1::bigint IS NOT NULL AND t.cash_session_id = $1)
        OR ($1::bigint IS NULL AND ${inStoreDays('t.created_at', '$2', '$3')})
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT 500`, // ponytail: no paging; a few dozen GCash/load a day
    [f.sessionId ?? null, f.from ?? null, f.to ?? null],
  );
  return rows;
}
