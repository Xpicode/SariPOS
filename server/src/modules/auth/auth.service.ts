import argon2 from 'argon2';
import { env } from '../../config/env';
import { pool, type Db } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/tokens';
import * as repo from './auth.repository';

const MAX_FAILED_LOGINS = 5;

// Checking a password against a real hash takes ~50ms. If unknown usernames returned instantly,
// an attacker could time the responses to learn which usernames exist. So we always verify.
const DUMMY_HASH = argon2.hash('timing-equalizer-not-a-real-password');

export type PublicUser = { id: number; username: string; fullName: string; role: Role };

const toPublicUser = (u: { id: number; username: string; full_name: string; role: Role }) => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name,
  role: u.role,
});

// Same message for "no such user", "wrong password" and "deactivated": never hint which one.
const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Wrong username or password');
const accountLocked = () =>
  new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in 15 minutes.');
const sessionExpired = () => new AppError(401, 'SESSION_EXPIRED', 'Please log in again');

async function issueTokens(db: Db, user: { id: number; role: Role }) {
  const refreshToken = generateRefreshToken();
  await repo.insertRefreshToken(db, user.id, hashToken(refreshToken), env.REFRESH_TOKEN_TTL_DAYS);
  return { accessToken: signAccessToken(user), refreshToken };
}

export async function login(username: string, password: string, ip?: string) {
  const user = await repo.findUserByUsername(pool, username);

  if (!user) {
    await argon2.verify(await DUMMY_HASH, password);
    await writeAudit(pool, {
      userId: null,
      action: 'LOGIN_FAILED',
      after: { username, reason: 'UNKNOWN_USER' },
      ip,
    });
    throw invalidCredentials();
  }

  // Locked: refuse BEFORE checking the password, so guessing during the lock is useless.
  if (user.locked_until && user.locked_until > new Date()) {
    await writeAudit(pool, {
      userId: user.id,
      action: 'LOGIN_FAILED',
      after: { reason: 'LOCKED' },
      ip,
    });
    throw accountLocked();
  }

  if (!(await argon2.verify(user.password_hash, password))) {
    const lockedUntil = await repo.recordFailedLogin(pool, user.id, MAX_FAILED_LOGINS);
    await writeAudit(pool, {
      userId: user.id,
      action: lockedUntil ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      after: { reason: 'WRONG_PASSWORD' },
      ip,
    });
    throw lockedUntil ? accountLocked() : invalidCredentials();
  }

  if (!user.is_active) {
    await writeAudit(pool, {
      userId: user.id,
      action: 'LOGIN_FAILED',
      after: { reason: 'INACTIVE' },
      ip,
    });
    throw invalidCredentials();
  }

  await repo.resetFailedLogins(pool, user.id);
  const tokens = await issueTokens(pool, user);
  await writeAudit(pool, { userId: user.id, action: 'LOGIN_SUCCESS', ip });
  return { ...tokens, user: toPublicUser(user) };
}

// Rotation: every refresh token works ONCE. Using it returns a brand-new pair.
export async function refresh(rawToken: string | undefined, ip?: string) {
  if (!rawToken) throw sessionExpired();

  // The transaction RETURNS the outcome instead of throwing, because a throw would ROLLBACK
  // and undo the "revoke everything" we do when a stolen token is detected.
  const outcome = await withTransaction(async (db) => {
    const row = await repo.findRefreshTokenForUpdate(db, hashToken(rawToken));
    if (!row) return { ok: false as const };

    if (row.revoked_at) {
      // A dead token came back (already rotated, logged out, or killed by a password reset).
      // It may be a stolen copy, and we can't tell the thief from the real user,
      // so end ALL of this user's sessions (plan 8.3).
      await repo.revokeAllRefreshTokens(db, row.user_id);
      await writeAudit(db, { userId: row.user_id, action: 'REVOKED_TOKEN_USED', ip });
      return { ok: false as const };
    }

    await repo.revokeRefreshToken(db, row.id);
    if (row.expires_at <= new Date() || !row.is_active) return { ok: false as const };

    const tokens = await issueTokens(db, { id: row.user_id, role: row.role });
    return {
      ok: true as const,
      ...tokens,
      user: toPublicUser({ ...row, id: row.user_id }),
    };
  });

  if (!outcome.ok) throw sessionExpired();
  return outcome;
}

export async function logout(rawToken: string | undefined, ip?: string) {
  if (!rawToken) return;
  const userId = await repo.revokeRefreshTokenByHash(pool, hashToken(rawToken));
  if (userId) await writeAudit(pool, { userId, action: 'LOGOUT', ip });
}

// The access token is valid for up to 15 min, but /me re-checks the DB,
// so a deactivated user is kicked out as soon as the app reloads.
export async function me(userId: number): Promise<PublicUser> {
  const user = await repo.findUserById(pool, userId);
  if (!user || !user.is_active) throw sessionExpired();
  return toPublicUser(user);
}

// Owner approval at the counter (voids, overrides). Returns the id of the approving owner.
// Wrong PIN = 403, not 401: the frontend retries 401s after refreshing the session,
// which would silently burn a second PIN guess.
export async function verifyOwnerPin(pin: string, actorId: number, ip?: string) {
  const owners = await repo.findActiveOwnerPins(pool);
  if (owners.length === 0) {
    throw new AppError(409, 'NO_OWNER_PIN', 'No owner PIN is set up yet');
  }
  for (const owner of owners) {
    if (await argon2.verify(owner.pin_hash, pin)) {
      await writeAudit(pool, {
        userId: actorId,
        action: 'PIN_APPROVED',
        after: { ownerId: owner.id },
        ip,
      });
      return owner.id;
    }
  }
  await writeAudit(pool, { userId: actorId, action: 'PIN_FAILED', ip });
  throw new AppError(403, 'PIN_INVALID', 'Wrong owner PIN');
}
