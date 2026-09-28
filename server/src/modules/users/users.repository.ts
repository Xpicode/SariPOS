import type { Db } from '../../db/pool';
import type { Role } from '../../types/express';

// Never selects password_hash or pin_hash: those must not leave the server.
const PUBLIC_COLS = `id, username, full_name AS "fullName", role, is_active AS "isActive",
  pin_hash IS NOT NULL AS "hasPin", locked_until AS "lockedUntil", created_at AS "createdAt"`;

export type UserView = {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  hasPin: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
};

export async function listUsers(db: Db) {
  const { rows } = await db.query<UserView>(`SELECT ${PUBLIC_COLS} FROM users ORDER BY id`);
  return rows;
}

// FOR UPDATE: nobody else can change this user until our transaction ends.
export async function findUserForUpdate(db: Db, id: number) {
  const { rows } = await db.query<UserView>(
    `SELECT ${PUBLIC_COLS} FROM users WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0];
}

export async function insertUser(
  db: Db,
  u: {
    username: string;
    fullName: string;
    passwordHash: string;
    pinHash: string | null;
    role: Role;
  },
) {
  const { rows } = await db.query<UserView>(
    `INSERT INTO users (username, full_name, password_hash, pin_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLS}`,
    [u.username, u.fullName, u.passwordHash, u.pinHash, u.role],
  );
  return rows[0];
}

// undefined = leave unchanged. COALESCE($n, column) keeps the old value when $n is NULL.
// A password reset also clears the lockout, so the owner can unlock a cashier this way.
export async function updateUser(
  db: Db,
  id: number,
  u: {
    fullName?: string;
    role?: Role;
    isActive?: boolean;
    passwordHash?: string;
    pinHash?: string | null; // null = remove PIN
  },
) {
  const { rows } = await db.query<UserView>(
    `UPDATE users SET
       full_name     = COALESCE($2, full_name),
       role          = COALESCE($3::user_role, role),
       is_active     = COALESCE($4, is_active),
       password_hash = COALESCE($5, password_hash),
       pin_hash      = CASE WHEN $6 THEN $7 ELSE pin_hash END,
       failed_logins = CASE WHEN $5 IS NOT NULL THEN 0 ELSE failed_logins END,
       locked_until  = CASE WHEN $5 IS NOT NULL THEN NULL ELSE locked_until END
     WHERE id = $1
     RETURNING ${PUBLIC_COLS}`,
    [
      id,
      u.fullName ?? null,
      u.role ?? null,
      u.isActive ?? null,
      u.passwordHash ?? null,
      u.pinHash !== undefined, // $6: should the PIN change at all?
      u.pinHash ?? null,
    ],
  );
  return rows[0];
}
