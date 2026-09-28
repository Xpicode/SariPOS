import { pool, type Db } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { pgError } from '../../utils/pgError';
import { getOpenSession } from '../cash-sessions/cash-sessions.repository';
import type { CreateCustomerInput, PaymentInput, UpdateCustomerInput } from './customers.schema';
import * as repo from './customers.repository';

type Actor = { id: number; role: Role };

const peso = (centavos: number) =>
  `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const notFound = () => new AppError(404, 'NOT_FOUND', 'Customer not found');

// "09171234567" -> "0917****567". Done on the SERVER for cashiers: a number hidden only by the
// screen would still be in the response for anyone who opens the browser's network tab.
export const maskPhone = (phone: string | null) =>
  phone && `${phone.slice(0, 4)}****${phone.slice(-3)}`;

function forRole<T extends { phone: string | null; address?: string | null }>(c: T, role: Role): T {
  return role === 'OWNER' ? c : { ...c, phone: maskPhone(c.phone), address: null };
}

// Called INSIDE the sale's transaction (plan 6.2 step 3): lock the customer, then check.
// Blocked, or balance + this sale over the limit -> refused with a clear reason.
export async function chargeCheck(db: Db, customerId: number, amount: number) {
  const c = await repo.lockCustomer(db, customerId);
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  if (c.isBlocked) {
    throw new AppError(409, 'CUSTOMER_BLOCKED', `${c.name} is blocked from utang`);
  }
  if (amount <= 0) throw new AppError(400, 'NOTHING_TO_CHARGE', 'Nothing to put on utang');
  if (c.balance + amount > c.creditLimit) {
    const room = Math.max(0, c.creditLimit - c.balance);
    throw new AppError(
      409,
      'CREDIT_LIMIT',
      `Over ${c.name}’s limit: owes ${peso(c.balance)} of ${peso(c.creditLimit)}, can add up to ${peso(room)}`,
    );
  }
  return c;
}

export async function listCustomers(search: string | undefined, role: Role) {
  return (await repo.listCustomers(pool, search || undefined)).map((c) => forRole(c, role));
}

export async function createCustomer(input: CreateCustomerInput, actor: Actor, ip?: string) {
  // Cashiers can add a new suki at the counter, with the default limit. The owner decides limits.
  if (input.creditLimit !== undefined && actor.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Only the owner can set a credit limit');
  }
  return withTransaction(async (db) => {
    const id = await repo.insertCustomer(db, input);
    const c = (await repo.getCustomer(db, id))!;
    await writeAudit(db, {
      userId: actor.id,
      action: 'CUSTOMER_CREATED',
      entity: 'customer',
      entityId: id,
      after: { name: c.name, creditLimit: c.creditLimit },
      ip,
    });
    return forRole(c, actor.role);
  });
}

export async function updateCustomer(
  id: number,
  input: UpdateCustomerInput,
  actorId: number,
  ip?: string,
) {
  return withTransaction(async (db) => {
    const before = await repo.lockCustomer(db, id);
    if (!before) throw notFound();
    await repo.updateCustomer(db, id, input);
    const after = (await repo.getCustomer(db, id))!;
    // Limit and block decide who may borrow: every change is traceable (plan 8.2 A09).
    await writeAudit(db, {
      userId: actorId,
      action: 'CUSTOMER_UPDATED',
      entity: 'customer',
      entityId: id,
      before: { creditLimit: before.creditLimit, isBlocked: before.isBlocked },
      after: { creditLimit: after.creditLimit, isBlocked: after.isBlocked },
      ip,
    });
    return after;
  });
}

export async function getStatement(id: number, role: Role) {
  const customer = await repo.getCustomer(pool, id);
  if (!customer) throw notFound();
  return { customer: forRole(customer, role), entries: await repo.statement(pool, id) };
}

// A payment the key already recorded: return it again, but only to the person who sent it.
async function replay(
  db: Db,
  existing: { customerId: number; createdBy: number },
  actor: Actor,
  id: number,
) {
  if (existing.createdBy !== actor.id || existing.customerId !== id) {
    throw new AppError(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'This payment was already used. Start again.',
    );
  }
  return { customer: forRole((await repo.getCustomer(db, id))!, actor.role), replayed: true };
}

// Receive a payment (plan 6.3): a NEGATIVE ledger row, and cash into the open drawer.
export async function receivePayment(id: number, input: PaymentInput, actor: Actor) {
  try {
    return await withTransaction(async (db) => {
      const existing = await repo.findPaymentByKey(db, input.idempotencyKey);
      if (existing) return replay(db, existing, actor, id);

      // Cash goes into the drawer, so a shift must be open (FOR SHARE: closing waits for us).
      const session = await getOpenSession(db, true);
      if (!session) {
        throw new AppError(
          409,
          'NO_OPEN_SESSION',
          'Open the cash drawer first: the payment goes in it',
        );
      }
      const c = await repo.lockCustomer(db, id);
      if (!c) throw notFound();
      if (input.amount > c.balance) {
        throw new AppError(
          409,
          'OVERPAYMENT',
          c.balance > 0
            ? `${c.name} only owes ${peso(c.balance)}`
            : `${c.name} doesn’t owe anything`,
        );
      }
      await repo.insertLedger(db, {
        customerId: id,
        type: 'PAYMENT',
        amount: -input.amount,
        sessionId: session.id,
        idempotencyKey: input.idempotencyKey,
        createdBy: actor.id,
      });
      return { customer: forRole((await repo.getCustomer(db, id))!, actor.role), replayed: false };
    });
  } catch (err) {
    // Same key at the same moment: the second insert hit the unique index. Answer with the first.
    if (pgError(err).constraint === 'credit_ledger_idempotency_key_key') {
      const existing = await repo.findPaymentByKey(pool, input.idempotencyKey);
      if (existing) return replay(pool, existing, actor, id);
    }
    throw err;
  }
}

const BUCKETS = [
  { key: '0-7', max: 7 },
  { key: '8-15', max: 15 },
  { key: '16-30', max: 30 },
  { key: '30+', max: Infinity },
] as const;

export async function agingReport() {
  const customers = (await repo.aging(pool)).map((c) => ({
    ...c,
    bucket: BUCKETS.find((b) => c.daysOwed <= b.max)!.key,
  }));
  const buckets = BUCKETS.map(({ key }) => {
    const list = customers.filter((c) => c.bucket === key);
    return { bucket: key, count: list.length, total: list.reduce((s, c) => s + c.balance, 0) };
  });
  return { buckets, customers };
}
