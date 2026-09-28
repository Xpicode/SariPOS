import argon2 from 'argon2';
import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { pgError, UNIQUE_VIOLATION } from '../../utils/pgError';
import { revokeAllRefreshTokens } from '../auth/auth.repository';
import * as repo from './users.repository';
import type { CreateUserInput, UpdateUserInput } from './users.schema';

type Actor = { id: number; role: Role };

const pinOwnerOnly = () => new AppError(400, 'PIN_OWNER_ONLY', 'Only an owner can have a PIN');

export const listUsers = () => repo.listUsers(pool);

export async function createUser(input: CreateUserInput, actor: Actor, ip?: string) {
  if (input.pin && input.role !== 'OWNER') throw pinOwnerOnly();

  // Hash BEFORE the transaction: argon2 is deliberately slow; don't hold DB locks meanwhile.
  const passwordHash = await argon2.hash(input.password);
  const pinHash = input.pin ? await argon2.hash(input.pin) : null;

  try {
    return await withTransaction(async (db) => {
      const user = await repo.insertUser(db, { ...input, passwordHash, pinHash });
      await writeAudit(db, {
        userId: actor.id,
        action: 'USER_CREATED',
        entity: 'user',
        entityId: user.id,
        after: {
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          hasPin: user.hasPin,
        },
        ip,
      });
      return user;
    });
  } catch (err) {
    // 23505 = unique_violation: let the DB's UNIQUE constraint decide, not a racy "check first".
    if (pgError(err).code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'USERNAME_TAKEN', 'That username is already taken');
    }
    throw err;
  }
}

export async function updateUser(id: number, input: UpdateUserInput, actor: Actor, ip?: string) {
  // Stops an owner from locking themselves (and possibly everyone) out of the owner account.
  if (id === actor.id && ((input.role && input.role !== actor.role) || input.isActive === false)) {
    throw new AppError(
      400,
      'CANNOT_CHANGE_SELF',
      "You can't change your own role or deactivate yourself",
    );
  }

  const passwordHash = input.password ? await argon2.hash(input.password) : undefined;
  const pinHash = input.pin ? await argon2.hash(input.pin) : input.pin; // null = remove, undefined = keep

  return withTransaction(async (db) => {
    const before = await repo.findUserForUpdate(db, id);
    if (!before) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (input.pin && (input.role ?? before.role) !== 'OWNER') throw pinOwnerOnly();

    const after = await repo.updateUser(db, id, { ...input, passwordHash, pinHash });

    // Password reset, deactivation or role change: end their sessions so it takes effect now,
    // not whenever they next log in. (Their current access token still expires within 15 min.)
    const roleChanged = after.role !== before.role;
    if (passwordHash || input.isActive === false || roleChanged) {
      await revokeAllRefreshTokens(db, id);
    }

    await writeAudit(db, {
      userId: actor.id,
      action: 'USER_UPDATED',
      entity: 'user',
      entityId: id,
      before: {
        fullName: before.fullName,
        role: before.role,
        isActive: before.isActive,
        hasPin: before.hasPin,
      },
      after: {
        fullName: after.fullName,
        role: after.role,
        isActive: after.isActive,
        hasPin: after.hasPin,
        passwordReset: Boolean(passwordHash), // record THAT it changed, never the value
      },
      ip,
    });
    return after;
  });
}
