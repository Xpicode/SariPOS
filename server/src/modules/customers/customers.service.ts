import { pool, type Db } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import type { Role } from '../../types/express';
import { AppError } from '../../utils/AppError';
import { writeAudit } from '../../utils/audit';
import { peso } from '../../utils/money';
import { pgError, UNIQUE_VIOLATION } from '../../utils/pgError';
import { todayInManila } from '../../utils/time';
import { getOpenSession } from '../cash-sessions/cash-sessions.repository';
import type { CreateCustomerInput, PaymentInput, UpdateCustomerInput } from './customers.schema';
import * as repo from './customers.repository';

type Actor = { id: number; role: Role };

const notFound = () => new AppError(404, 'NOT_FOUND', 'Customer not found');

// Interest on what they owe, in basis points (500 = 5%). Rounded DOWN to the centavo: the store
// never charges more than the agreed rate.
export const interestAmount = (balance: number, bp: number) =>
  Math.max(0, Math.floor((balance * bp) / 10_000));

// A due date must be today or later: a date already past would make them overdue on day one.
function checkDueDate(dueDate: string | null | undefined) {
  if (dueDate && dueDate < todayInManila()) {
    throw new AppError(
      400,
      'DUE_DATE_PASSED',
      'That date has already passed. Pick today or later.',
    );
  }
}

// What a cashier may change on an existing customer: only the terms (when to pay, interest).
const CASHIER_FIELDS = new Set(['dueDate', 'interestBp']);

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
  checkDueDate(input.dueDate);
  return withTransaction(async (db) => {
    const id = await repo.insertCustomer(db, input);
    const c = (await repo.getCustomer(db, id))!;
    await writeAudit(db, {
      userId: actor.id,
      action: 'CUSTOMER_CREATED',
      entity: 'customer',
      entityId: id,
      after: {
        name: c.name,
        creditLimit: c.creditLimit,
        dueDate: c.dueDate,
        interestBp: c.interestBp,
      },
      ip,
    });
    return forRole(c, actor.role);
  });
}

export async function updateCustomer(
  id: number,
  input: UpdateCustomerInput,
  actor: Actor,
  ip?: string,
) {
  const others = Object.entries(input).filter(
    ([k, v]) => v !== undefined && !CASHIER_FIELDS.has(k),
  );
  if (actor.role !== 'OWNER' && others.length > 0) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only the owner can change the name, phone, limit or block',
    );
  }
  checkDueDate(input.dueDate);
  return withTransaction(async (db) => {
    const before = await repo.lockCustomer(db, id);
    if (!before) throw notFound();
    await repo.updateCustomer(db, id, input);
    const after = (await repo.getCustomer(db, id))!;
    // Limit, block and terms decide who may borrow and what they pay: every change is traceable
    // (plan 8.2 A09).
    const terms = (c: repo.CustomerView) => ({
      creditLimit: c.creditLimit,
      isBlocked: c.isBlocked,
      dueDate: c.dueDate,
      interestBp: c.interestBp,
    });
    await writeAudit(db, {
      userId: actor.id,
      action: 'CUSTOMER_UPDATED',
      entity: 'customer',
      entityId: id,
      before: terms(before),
      after: terms(after),
      ip,
    });
    return forRole(after, actor.role);
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
      const session = await getOpenSession(db, 'share');
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

// Owner only (plan: the owner confirms, nothing is charged automatically). Once the due date has
// passed, add the agreed interest on what they owe now, as an INTEREST row in the ledger.
// One per due date: the database's unique index refuses a second one, even from two owners at once.
export async function addInterest(id: number, actor: Actor, ip?: string) {
  try {
    return await withTransaction(async (db) => {
      const c = await repo.lockCustomer(db, id);
      if (!c) throw notFound();
      const refuse = (code: string, message: string) => new AppError(409, code, message);
      if (!c.dueDate) throw refuse('NO_DUE_DATE', `${c.name} has no due date`);
      if (!c.pastDue) throw refuse('NOT_OVERDUE', `Not late yet: due ${c.dueDate}`);
      if (c.interestBp === 0) throw refuse('NO_INTEREST_RATE', `${c.name} has no interest set`);
      if (c.interestCharged) {
        throw refuse('INTEREST_ALREADY_ADDED', 'Interest for this due date is already added');
      }
      const amount = interestAmount(c.balance, c.interestBp);
      if (amount <= 0) throw refuse('NOTHING_OWED', `${c.name} owes nothing to charge interest on`);

      const pct = (c.interestBp / 100).toFixed(2).replace(/\.?0+$/, '');
      const entryId = await repo.insertLedger(db, {
        customerId: id,
        type: 'INTEREST',
        amount,
        interestFor: c.dueDate,
        note: `Interest ${pct}% of ${peso(c.balance)} (was due ${c.dueDate})`,
        createdBy: actor.id,
      });
      await writeAudit(db, {
        userId: actor.id,
        action: 'UTANG_INTEREST_ADDED',
        entity: 'customer',
        entityId: id,
        before: { balance: c.balance },
        after: { interest: amount, rateBp: c.interestBp, dueDate: c.dueDate, ledgerId: entryId },
        ip,
      });
      return forRole((await repo.getCustomer(db, id))!, actor.role);
    });
  } catch (err) {
    if (pgError(err).code === UNIQUE_VIOLATION) {
      throw new AppError(
        409,
        'INTEREST_ALREADY_ADDED',
        'Interest for this due date is already added',
      );
    }
    throw err;
  }
}
