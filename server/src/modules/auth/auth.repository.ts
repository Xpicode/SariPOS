import type { Db } from '../../db/pool';
import type { Role } from '../../types/express';

export type UserRow = {
  id: number;
  username: string;
  full_name: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  locked_until: Date | null;
};

const USER_COLS = 'id, username, full_name, password_hash, role, is_active, locked_until';

export async function findUserByUsername(db: Db, username: string) {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE username = $1`, [
    username,
  ]);
  return rows[0];
}

export async function findUserById(db: Db, id: number) {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  return rows[0];
}

// One atomic UPDATE, so two wrong guesses at the same instant can't both "miss" the count.
// On the 5th failure: lock for 15 minutes and reset the counter (fresh 5 tries after the lock).
// Returns the new lock time, or null if the account is not locked.
export async function recordFailedLogin(db: Db, id: number, maxFailed: number) {
  const { rows } = await db.query<{ locked_until: Date | null }>(
    `UPDATE users SET
       failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
       locked_until  = CASE WHEN failed_logins + 1 >= $2 THEN now() + interval '15 minutes' END
     WHERE id = $1
     RETURNING locked_until`,
    [id, maxFailed],
  );
  return rows[0]?.locked_until ?? null;
}

export async function resetFailedLogins(db: Db, id: number) {
  await db.query(
    `UPDATE users SET failed_logins = 0, locked_until = NULL
     WHERE id = $1 AND (failed_logins > 0 OR locked_until IS NOT NULL)`,
    [id],
  );
}

export async function insertRefreshToken(db: Db, userId: number, tokenHash: string, days: number) {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [userId, tokenHash, days],
  );
}

export type RefreshTokenRow = {
  id: number;
  user_id: number;
  expires_at: Date;
  revoked_at: Date | null;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};

// FOR UPDATE locks the token row: two refreshes with the same token run one after the other,
// so the second one sees it already revoked instead of both rotating it.
export async function findRefreshTokenForUpdate(db: Db, tokenHash: string) {
  const { rows } = await db.query<RefreshTokenRow>(
    `SELECT t.id, t.user_id, t.expires_at, t.revoked_at, u.username, u.full_name, u.role, u.is_active
     FROM refresh_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1
     FOR UPDATE OF t`,
    [tokenHash],
  );
  return rows[0];
}

export async function revokeRefreshToken(db: Db, id: number) {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [id]);
}

// Returns the owner of the token, so logout can be audited.
export async function revokeRefreshTokenByHash(db: Db, tokenHash: string) {
  const { rows } = await db.query<{ user_id: number }>(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING user_id`,
    [tokenHash],
  );
  return rows[0]?.user_id;
}

export async function revokeAllRefreshTokens(db: Db, userId: number) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
}

export async function findActiveOwnerPins(db: Db) {
  const { rows } = await db.query<{ id: number; pin_hash: string }>(
    `SELECT id, pin_hash FROM users
     WHERE role = 'OWNER' AND is_active AND pin_hash IS NOT NULL`,
  );
  return rows;
}
