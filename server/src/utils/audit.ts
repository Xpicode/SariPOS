import type { Db } from '../db/pool';

export type AuditEntry = {
  userId: number | null; // null = unknown user (e.g. login with a username that doesn't exist)
  action: string; // LOGIN_FAILED, USER_CREATED, SALE_VOID ...
  entity?: string;
  entityId?: number;
  before?: unknown;
  after?: unknown;
  ip?: string;
};

// Pass the transaction client when inside withTransaction(), so the audit row commits or rolls
// back together with the change it describes. Never put passwords, PINs or tokens in before/after.
export async function writeAudit(db: Db, e: AuditEntry) {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, before_data, after_data, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      e.userId,
      e.action,
      e.entity ?? null,
      e.entityId ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      e.ip ?? null,
    ],
  );
}
